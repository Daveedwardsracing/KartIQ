export function getInitials(name) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "DR";
}

export function formatRoleLabel(role) {
  return String(role || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ") || "User";
}

export function roleForManagementScreen(screen) {
  if (screen === "Driver Management") return "driver";
  if (screen === "Driver Profiles") return "driver";
  if (screen === "Driver Accounts") return "driver";
  if (screen === "Parent Management") return "parent";
  if (screen === "Administrator Management") return "manager";
  return "driver";
}

export function createEmptyAccountDraftForScreen(screen, emptyAccount = {}) {
  return {
    ...emptyAccount,
    role: roleForManagementScreen(screen)
  };
}

export function getManagementScreenForRole(role) {
  if (role === "driver") return "Driver Accounts";
  if (role === "parent") return "Parent Management";
  return "Administrator Management";
}

export function formatMetric(value, decimals = null) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  if (typeof value === "number" && Number.isFinite(value) && decimals !== null) {
    return value.toFixed(decimals);
  }
  return value;
}

export function normalizeSpeedUnit(unit) {
  return String(unit || "").toLowerCase() === "mph" ? "mph" : "kmh";
}

export function getSpeedUnitLabel(unit) {
  return normalizeSpeedUnit(unit) === "mph" ? "mph" : "km/h";
}

export function convertSpeedValue(value, unit) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return value;
  }
  return normalizeSpeedUnit(unit) === "mph"
    ? value * 0.621371
    : value;
}

export function formatSpeed(value, unit = "kmh", decimals = 2) {
  const converted = convertSpeedValue(value, unit);
  return formatMetric(converted, decimals);
}

export function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function formatDateLabel(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

export function buildDriverPayload(draft) {
  return {
    name: draft.name,
    number: draft.number,
    class_name: draft.class_name,
    aliases: draft.aliases_text.split(",").map((item) => item.trim()).filter(Boolean),
    email: draft.email,
    password: draft.password
  };
}
