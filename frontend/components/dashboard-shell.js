"use client";

import { useEffect, useMemo, useState } from "react";
import { createDriver, createEvent, exportPdf, generateFeedback, listDrivers, listEvents, listSeedData, login, uploadSessions } from "@/lib/api";

const NAV_ITEMS = ["Events", "Drivers", "Upload Session", "Reports"];

export default function DashboardShell() {
  const [session, setSession] = useState(null);
  const [screen, setScreen] = useState("Upload Session");
  const [seed, setSeed] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [reports, setReports] = useState(null);
  const [driversStore, setDriversStore] = useState([]);
  const [eventsStore, setEventsStore] = useState([]);
  const [credentials, setCredentials] = useState({ email: "coach@der.local", password: "password123" });
  const [driverDraft, setDriverDraft] = useState({ name: "", number: "", class_name: "" });
  const [eventDraft, setEventDraft] = useState({ venue: "", name: "", session_type: "", date: "" });
  const [formState, setFormState] = useState({
    eventName: "PFi",
    eventRound: "TVKC Round 3",
    sessionType: "Saturday Practice",
    audience: "coach",
    aiProvider: "openai",
    model: "gpt-5.4-mini",
    apiKey: ""
  });

  useEffect(() => {
    listSeedData().then(setSeed).catch(() => {});
    listDrivers().then((data) => setDriversStore(data.drivers)).catch(() => {});
    listEvents().then((data) => setEventsStore(data.events)).catch(() => {});
  }, []);

  const drivers = analysis?.drivers || [];
  const selectedEventLabel = useMemo(() => {
    return [formState.eventName, formState.eventRound, formState.sessionType].filter(Boolean).join(" / ");
  }, [formState]);

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    try {
      const data = await login(credentials);
      setSession(data);
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function handleUpload(event) {
    const files = [...event.target.files];
    if (!files.length) return;
    setLoading(true);
    setError("");
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      formData.append("event_name", formState.eventName);
      formData.append("event_round", formState.eventRound);
      formData.append("session_type", formState.sessionType);
      const data = await uploadSessions(formData);
      setAnalysis(data);
      setScreen("Reports");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  async function handleGenerateFeedback() {
    if (!analysis) return;
    setLoading(true);
    setError("");
    try {
      const data = await generateFeedback({
        audience: formState.audience,
        provider: formState.aiProvider,
        model: formState.model,
        api_key: formState.apiKey,
        analysis
      });
      setReports(data);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateDriver(event) {
    event.preventDefault();
    const created = await createDriver(driverDraft);
    setDriversStore((current) => [...current, created]);
    setDriverDraft({ name: "", number: "", class_name: "" });
    setScreen("Drivers");
  }

  async function handleCreateEvent(event) {
    event.preventDefault();
    const created = await createEvent(eventDraft);
    setEventsStore((current) => [...current, created]);
    setEventDraft({ venue: "", name: "", session_type: "", date: "" });
    setScreen("Events");
  }

  async function handleExportPdf() {
    if (!analysis) return;
    const blob = await exportPdf({
      audience: formState.audience,
      provider: formState.aiProvider,
      model: formState.model,
      api_key: formState.apiKey,
      analysis
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "session-report.pdf";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-7xl items-center px-6 py-12">
        <div className="grid w-full gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="app-panel p-10">
            <p className="mb-3 text-xs uppercase tracking-[0.3em] text-blue-300">UniPro Coaching Platform</p>
            <h1 className="max-w-xl text-5xl font-semibold leading-tight">Telemetry comparison, AI debriefs, and session reports for your drivers.</h1>
            <p className="mt-5 max-w-2xl text-lg muted">
              Build events, upload UniPro TSVs, compare multiple drivers side by side, and generate coach, driver, and parent-friendly reports from deterministic analysis.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {["Best lap + best 3 average", "Consistency + sectors", "AI debrief + PDF-ready reports"].map((item) => (
                <div key={item} className="app-panel bg-transparent p-4">
                  <span className="badge">MVP</span>
                  <p className="mt-3 text-sm">{item}</p>
                </div>
              ))}
            </div>
          </section>
          <section className="app-panel p-8">
            <p className="mb-3 text-xs uppercase tracking-[0.3em] text-blue-300">Sign In</p>
            <h2 className="text-2xl font-semibold">Open your dashboard</h2>
            <form className="mt-6 grid gap-4" onSubmit={handleLogin}>
              <label className="grid gap-2 text-sm">
                <span className="muted">Email</span>
                <input className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 outline-none" value={credentials.email} onChange={(event) => setCredentials((current) => ({ ...current, email: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="muted">Password</span>
                <input className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 outline-none" type="password" value={credentials.password} onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))} />
              </label>
              <button className="rounded-xl bg-blue-500 px-4 py-3 font-medium text-white" type="submit">Sign in</button>
            </form>
            <p className="mt-4 text-sm muted">Demo login: `coach@der.local / password123`</p>
            {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-4 lg:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1600px] grid-cols-1 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/20 shadow-2xl lg:grid-cols-[240px_1fr]">
        <aside className="app-panel rounded-none border-0 border-r border-white/10 bg-slate-900/90 p-6">
          <div className="flex items-center gap-3 border-b border-white/10 pb-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/90 font-semibold">U</div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-blue-300">DER</p>
              <h2 className="text-lg font-semibold">Fleet Intelligence</h2>
            </div>
          </div>
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
            <span className="badge">{session.role}</span>
            <p className="mt-3 font-medium">{session.name}</p>
            <p className="mt-1 text-sm muted">{session.email}</p>
          </div>
          <nav className="mt-6 grid gap-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition ${screen === item ? "border-blue-400/30 bg-blue-500/15 text-white" : "border-transparent bg-transparent text-slate-300 hover:border-white/10 hover:bg-white/5"}`}
                onClick={() => setScreen(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </nav>
          <div className="mt-auto pt-6">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-medium">Seeded drivers</p>
              <p className="mt-2 text-sm muted">{seed?.drivers?.join(", ") || "Loading..."}</p>
            </div>
          </div>
        </aside>

        <section className="bg-[#101826] p-5">
          <header className="mb-5 flex flex-col gap-4 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm muted">Dashboard / {screen}</p>
              <h1 className="mt-1 text-3xl font-semibold">{selectedEventLabel}</h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <select className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm" value={formState.aiProvider} onChange={(event) => setFormState((current) => ({ ...current, aiProvider: event.target.value }))}>
                <option value="openai">OpenAI</option>
                <option value="ollama">Ollama</option>
              </select>
              <input className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm" placeholder="Model" value={formState.model} onChange={(event) => setFormState((current) => ({ ...current, model: event.target.value }))} />
              <input className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm" placeholder="OpenAI API key if used" type="password" value={formState.apiKey} onChange={(event) => setFormState((current) => ({ ...current, apiKey: event.target.value }))} />
              <button className="rounded-xl bg-blue-500 px-4 py-3 text-sm font-medium" onClick={handleGenerateFeedback} type="button">Generate feedback</button>
              <button className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium" onClick={handleExportPdf} type="button">Export PDF</button>
            </div>
          </header>

          <section className="grid gap-5">
            {screen === "Events" ? (
              <EventManager eventsStore={eventsStore} eventDraft={eventDraft} onChange={setEventDraft} onSubmit={handleCreateEvent} />
            ) : null}
            {screen === "Drivers" ? (
              <DriverManager driversStore={driversStore} driverDraft={driverDraft} onChange={setDriverDraft} onSubmit={handleCreateDriver} />
            ) : null}
            <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
              <article className="app-panel p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Upload Session</p>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <input className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3" placeholder="Track / venue" value={formState.eventName} onChange={(event) => setFormState((current) => ({ ...current, eventName: event.target.value }))} />
                  <input className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3" placeholder="Round / event name" value={formState.eventRound} onChange={(event) => setFormState((current) => ({ ...current, eventRound: event.target.value }))} />
                  <input className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3" placeholder="Session type" value={formState.sessionType} onChange={(event) => setFormState((current) => ({ ...current, sessionType: event.target.value }))} />
                </div>
                <label className="mt-4 grid min-h-52 cursor-pointer place-items-center rounded-2xl border border-dashed border-blue-400/25 bg-blue-500/5 px-6 py-10 text-center">
                  <input multiple className="hidden" type="file" accept=".tsv,.txt" onChange={handleUpload} />
                  <div>
                    <p className="text-lg font-medium">Drop UniPro TSV files here</p>
                    <p className="mt-2 text-sm muted">Upload one or more driver files for the selected event and session.</p>
                  </div>
                </label>
                {loading ? <p className="mt-4 text-sm muted">Processing files...</p> : null}
                {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
              </article>

              <article className="app-panel p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Current Scope</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {[
                    ["Drivers", drivers.length || 0],
                    ["Reports", reports?.reports?.length || 0],
                    ["Event", formState.eventRound],
                    ["Audience", formState.audience]
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm muted">{label}</p>
                      <p className="mt-2 text-xl font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
                <label className="mt-4 grid gap-2 text-sm">
                  <span className="muted">Feedback audience</span>
                  <select className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3" value={formState.audience} onChange={(event) => setFormState((current) => ({ ...current, audience: event.target.value }))}>
                    <option value="coach">Coach format</option>
                    <option value="driver">Driver format</option>
                    <option value="parent">Parent-friendly format</option>
                  </select>
                </label>
              </article>
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <AnalysisPanel analysis={analysis} />
              <ReportsPanel reports={reports} />
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function AnalysisPanel({ analysis }) {
  if (!analysis) {
    return (
      <article className="app-panel p-5">
        <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Analysis</p>
        <p className="mt-4 muted">Upload TSV files to see best lap, best three average, consistency, sector deltas, and side-by-side driver comparisons.</p>
      </article>
    );
  }

  return (
    <article className="app-panel p-5">
      <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Comparison Dashboard</p>
      <div className="mt-4 grid gap-4 md:grid-cols-4">
        {[
          ["Best Driver", analysis.summary.fastest_driver],
          ["Best Lap", analysis.summary.best_lap_time],
          ["Drivers", analysis.summary.driver_count],
          ["Session", analysis.summary.session_type]
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm muted">{label}</p>
            <p className="mt-2 text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-slate-300">
              <th className="px-3 py-3">Driver</th>
              <th className="px-3 py-3">Best Lap</th>
              <th className="px-3 py-3">Best 3 Avg</th>
              <th className="px-3 py-3">Consistency</th>
              <th className="px-3 py-3">Session Rank</th>
              <th className="px-3 py-3">Time Loss</th>
            </tr>
          </thead>
          <tbody>
            {analysis.drivers.map((driver) => (
              <tr key={driver.driver_name} className="border-b border-white/5">
                <td className="px-3 py-3">
                  <p className="font-medium">{driver.driver_name}</p>
                  <p className="text-xs muted">{driver.detected_track} / {driver.session_date || "Unknown date"}</p>
                </td>
                <td className="px-3 py-3">{driver.best_lap}</td>
                <td className="px-3 py-3">{driver.best_three_average}</td>
                <td className="px-3 py-3">{driver.consistency}</td>
                <td className="px-3 py-3">{driver.session_rank}</td>
                <td className="px-3 py-3">{driver.time_loss_hint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function ReportsPanel({ reports }) {
  if (!reports) {
    return (
      <article className="app-panel p-5">
        <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Report View</p>
        <p className="mt-4 muted">Generate AI feedback after analysis to get coach notes, driver debriefs, parent-friendly summaries, and next-session actions.</p>
      </article>
    );
  }

  return (
    <article className="app-panel p-5">
      <p className="text-xs uppercase tracking-[0.3em] text-blue-300">AI Feedback</p>
      <div className="mt-4 grid gap-4">
        {reports.reports.map((report) => (
          <div key={report.driver_name} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{report.driver_name}</h3>
                <p className="text-sm muted">{report.format_label}</p>
              </div>
              <span className="badge">{report.confidence_rating}</span>
            </div>
            <p className="mt-4 text-sm">{report.overall_summary}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <ReportList title="Strengths" items={report.strengths} />
              <ReportList title="Weaknesses" items={report.weaknesses} />
              <ReportList title="Action Points" items={report.action_points} />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function ReportList({ title, items }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-3 grid gap-2 text-sm muted">
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}
