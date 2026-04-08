const express = require("express");
const path = require("path");
const fs = require("fs");
const session = require("express-session");

const app = express();
const port = process.env.PORT || 3000;
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const usersPath = path.join(__dirname, "data", "users.json");
const storePath = path.join(__dirname, "data", "store.json");

app.use(express.json({ limit: "3mb" }));
app.use(session({
  secret: process.env.SESSION_SECRET || "der-unipro-local-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
  },
}));
app.use(express.static(__dirname));

app.get("/api/health", async (req, res) => {
  try {
    const response = await fetch(`${ollamaBaseUrl}/api/tags`);
    if (!response.ok) {
      throw new Error(`Ollama responded with ${response.status}`);
    }

    const data = await response.json();
    res.json({
      ok: true,
      ollamaReachable: true,
      models: Array.isArray(data.models) ? data.models.map((model) => model.name) : [],
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      ollamaReachable: false,
      error: error.message,
    });
  }
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const users = readJson(usersPath);
  const user = users.find((entry) => entry.username === username && entry.password === password);

  if (!user) {
    return res.status(401).json({ ok: false, error: "Invalid username or password." });
  }

  req.session.user = sanitiseUser(user);
  res.json({ ok: true, user: req.session.user });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/session", (req, res) => {
  const user = req.session.user || null;
  const store = readJson(storePath);
  const dashboard = buildDashboardForUser(user, store);

  res.json({
    ok: true,
    user,
    dashboard,
  });
});

app.post("/api/analysis/save", requireRole("manager"), (req, res) => {
  const { dashboard } = req.body || {};

  if (!dashboard || typeof dashboard !== "object") {
    return res.status(400).json({ ok: false, error: "Dashboard payload is required." });
  }

  const currentStore = readJson(storePath);
  const historyEntry = {
    savedAt: new Date().toISOString(),
    drivers: (Array.isArray(dashboard.drivers) ? dashboard.drivers : []).map((driver) => ({
      driverName: driver.driverName,
      score: driver.score,
      rowCount: driver.rowCount,
    })),
  };

  const nextStore = {
    savedAt: historyEntry.savedAt,
    teamContext: dashboard.teamContext || "",
    coachingGoal: dashboard.coachingGoal || "",
    comparison: dashboard.comparison || {
      summary: [],
      topPerformer: null,
      topMetric: null,
      groupScoreboard: [],
      comparisonRows: [],
    },
    drivers: Array.isArray(dashboard.drivers) ? dashboard.drivers : [],
    history: [...(Array.isArray(currentStore.history) ? currentStore.history : []), historyEntry].slice(-24),
  };

  writeJson(storePath, nextStore);

  res.json({
    ok: true,
    savedAt: nextStore.savedAt,
    dashboard: buildDashboardForUser(req.session.user, nextStore),
  });
});

app.post("/api/feedback", requireSession, async (req, res) => {
  const { provider, model, apiKey, prompt } = req.body || {};

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "A prompt string is required." });
  }

  try {
    if (provider === "openai") {
      if (!apiKey) {
        return res.status(400).json({ ok: false, error: "An OpenAI API key is required when provider is OpenAI." });
      }

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: typeof model === "string" && model.trim() ? model.trim() : "gpt-5.4-mini",
          input: prompt,
          text: {
            format: {
              type: "json_schema",
              name: "telemetry_feedback",
              strict: true,
              schema: telemetryFeedbackSchema(),
            },
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `OpenAI responded with ${response.status}`);
      }

      const data = await response.json();
      const parsed = extractOpenAiStructuredOutput(data);
      return res.json({ ok: true, provider: "openai", model: data.model, response: parsed });
    }

    const response = await fetch(`${ollamaBaseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: typeof model === "string" && model.trim() ? model.trim() : "gemma3:1b",
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Ollama responded with ${response.status}`);
    }

    const data = await response.json();
    res.json({
      ok: true,
      provider: "ollama",
      model: data.model,
      response: safeJsonParse(data.response) || {
        overallSummary: data.response || "",
        strengths: [],
        weaknesses: [],
        likelyCause: "",
        coachingActions: [],
        confidenceRating: 0.5,
        parentSummary: data.response || "",
        nextSessionFocus: "",
      },
    });
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: error.message,
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`UniPro analyser running at http://localhost:${port}`);
});

function requireSession(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ ok: false, error: "Please log in first." });
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ ok: false, error: "Please log in first." });
    }
    if (req.session.user.role !== role) {
      return res.status(403).json({ ok: false, error: "You do not have access to this action." });
    }
    next();
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function sanitiseUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    driverName: user.driverName || null,
  };
}

function buildDashboardForUser(user, store) {
  if (!user) {
    return null;
  }

  if (user.role === "manager") {
    return store;
  }

  return {
    savedAt: store.savedAt,
    teamContext: store.teamContext,
    coachingGoal: store.coachingGoal,
    comparison: store.comparison,
    drivers: store.drivers.filter((driver) => driver.driverName === user.driverName),
    history: (store.history || []).map((snapshot) => ({
      savedAt: snapshot.savedAt,
      drivers: snapshot.drivers.filter((driver) => driver.driverName === user.driverName),
    })),
  };
}

function telemetryFeedbackSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      overallSummary: { type: "string" },
      strengths: { type: "array", items: { type: "string" } },
      weaknesses: { type: "array", items: { type: "string" } },
      likelyCause: { type: "string" },
      coachingActions: { type: "array", items: { type: "string" } },
      confidenceRating: { type: "number" },
      parentSummary: { type: "string" },
      nextSessionFocus: { type: "string" },
    },
    required: ["overallSummary", "strengths", "weaknesses", "likelyCause", "coachingActions", "confidenceRating", "parentSummary", "nextSessionFocus"],
  };
}

function extractOpenAiStructuredOutput(payload) {
  const direct = safeJsonParse(payload.output_text);
  if (direct) {
    return direct;
  }

  for (const output of payload.output || []) {
    for (const content of output.content || []) {
      if (typeof content.text === "string") {
        const parsed = safeJsonParse(content.text);
        if (parsed) {
          return parsed;
        }
      }
    }
  }

  throw new Error("OpenAI returned no structured JSON output.");
}

function safeJsonParse(value) {
  if (!value || typeof value !== "string") {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
