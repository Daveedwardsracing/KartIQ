const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export async function login(payload) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function register(payload) {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function requestPasswordReset(payload) {
  return request("/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function confirmPasswordReset(payload) {
  return request("/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function changePassword(payload) {
  return request("/auth/password-change", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function listSeedData() {
  return request("/seed/overview");
}

export async function listDrivers() {
  return request("/drivers");
}

export async function createDriver(payload) {
  return request("/drivers", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateDriver(id, payload) {
  return request(`/drivers/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function deleteDriver(id) {
  return request(`/drivers/${id}`, {
    method: "DELETE"
  });
}

export async function listEvents() {
  return request("/events");
}

export async function listAccessLevels() {
  return request("/access-levels");
}

export async function createAccessLevel(payload) {
  return request("/access-levels", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateAccessLevel(id, payload) {
  return request(`/access-levels/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function listKartClasses() {
  return request("/kart-classes");
}

export async function listTracks() {
  return request("/tracks");
}

export async function updateTrack(id, payload) {
  return request(`/tracks/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function getAppSettings(params = {}) {
  const query = new URLSearchParams();
  if (params.user_account_id) query.set("user_account_id", params.user_account_id);
  if (params.email) query.set("email", params.email);
  if (params.role) query.set("role", params.role);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request(`/settings/app${suffix}`);
}

function buildSettingsScopeQuery(params = {}) {
  const query = new URLSearchParams();
  if (params.user_account_id) query.set("user_account_id", params.user_account_id);
  if (params.email) query.set("email", params.email);
  if (params.role) query.set("role", params.role);
  return query.toString() ? `?${query.toString()}` : "";
}

export async function getEmailSettings() {
  return request("/settings/email");
}

export async function updateEmailSettings(payload) {
  return request("/settings/email", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function sendTestEmail(payload) {
  return request("/settings/email/test", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function listAuthAudit(limit = 100) {
  return request(`/audit/auth?limit=${encodeURIComponent(limit)}`);
}

export async function listEmailDelivery(limit = 50) {
  return request(`/email/delivery?limit=${encodeURIComponent(limit)}`);
}

export async function getOperationsHealth(params = {}) {
  return request(`/operations/health${buildSettingsScopeQuery(params)}`);
}

export async function listBackups() {
  return request("/operations/backups");
}

export async function createBackup() {
  return request("/operations/backups", {
    method: "POST"
  });
}

export async function getRestoreGuidance() {
  return request("/operations/restore-guidance");
}

export async function exportOperationalData() {
  const response = await fetch(`${API_BASE_URL}/operations/export`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || data.error || "Export failed");
  }
  return response.blob();
}

export async function updateAppSettings(payload) {
  return request("/settings/app", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function listSessions() {
  return request("/sessions");
}

export async function getSessionDetail(id) {
  return request(`/sessions/${id}`);
}

export async function deleteSession(id) {
  return request(`/sessions/${id}`, {
    method: "DELETE"
  });
}

export async function createSessionPreset(sessionId, payload) {
  return request(`/sessions/${sessionId}/presets`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function deleteSessionPreset(sessionId, presetId) {
  return request(`/sessions/${sessionId}/presets/${presetId}`, {
    method: "DELETE"
  });
}

export async function createCoachingNote(sessionId, payload) {
  return request(`/sessions/${sessionId}/notes`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function deleteCoachingNote(sessionId, noteId) {
  return request(`/sessions/${sessionId}/notes/${noteId}`, {
    method: "DELETE"
  });
}

export async function listTestSessions() {
  return request("/test-sessions");
}

export async function getTestSession(id) {
  return request(`/test-sessions/${id}`);
}

export async function listSetupDatabase() {
  return request("/setup-database");
}

export async function listReports() {
  return request("/reports");
}

export async function listUserAccounts() {
  return request("/user-accounts");
}

export async function createUserAccount(payload) {
  return request("/user-accounts", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateUserAccount(id, payload) {
  return request(`/user-accounts/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function deleteUserAccount(id) {
  return request(`/user-accounts/${id}`, {
    method: "DELETE"
  });
}

export async function approveUserAccount(id, payload = {}) {
  return request(`/user-accounts/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function rejectUserAccount(id, payload = {}) {
  return request(`/user-accounts/${id}/reject`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function resendApprovalEmail(id, payload = {}) {
  return request(`/user-accounts/${id}/resend-approval`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function approveUserAccountManual(id, payload = {}) {
  return request(`/user-accounts/${id}/approve-manual`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getDriverPortal(id) {
  return request(`/drivers/${id}/portal`);
}

export async function getDriverTimeline(id) {
  return request(`/drivers/${id}/timeline`);
}

export async function getUserAccountPortal(id) {
  return request(`/user-accounts/${id}/portal`);
}

export async function createEvent(payload) {
  return request("/events", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function createTestSession(payload) {
  return request("/test-sessions", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateTestSession(id, payload) {
  return request(`/test-sessions/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function refreshTestSessionWeather(id) {
  return request(`/test-sessions/${id}/weather-refresh`, {
    method: "POST"
  });
}

export async function deleteTestSession(id) {
  return request(`/test-sessions/${id}`, {
    method: "DELETE"
  });
}

export async function updateEvent(id, payload) {
  return request(`/events/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function deleteEvent(id) {
  return request(`/events/${id}`, {
    method: "DELETE"
  });
}

export async function uploadSessions(formData) {
  return fetch(`${API_BASE_URL}/sessions/upload`, {
    method: "POST",
    body: formData
  }).then(handleJson);
}

export async function generateFeedback(payload) {
  return request("/ai/feedback", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function aiHealth(params = {}) {
  return request(`/ai/health${buildSettingsScopeQuery(params)}`);
}

export async function chatWithAi(payload) {
  return request("/ai/chat", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function listAiMemory(params = {}) {
  const query = new URLSearchParams();
  if (params.user_account_id) query.set("user_account_id", params.user_account_id);
  if (params.email) query.set("email", params.email);
  if (params.role) query.set("role", params.role);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request(`/ai/memory${suffix}`);
}

export async function createAiMemory(payload) {
  return request("/ai/memory", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function deleteAiMemory(id) {
  return request(`/ai/memory/${id}`, {
    method: "DELETE"
  });
}

export async function listAiChatHistory(params = {}) {
  const query = new URLSearchParams();
  if (params.user_account_id) query.set("user_account_id", params.user_account_id);
  if (params.email) query.set("email", params.email);
  if (params.role) query.set("role", params.role);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request(`/ai/chat-history${suffix}`);
}

export async function exportPdf(payload) {
  const response = await fetch("/api/report-pdf", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || data.error || "PDF export failed");
  }
  return response.blob();
}

export async function reportEngineHealth() {
  const response = await fetch("/api/report-pdf");
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Report engine unavailable");
  }
  return data;
}

export async function updateSessionStatus(id, payload) {
  return request(`/sessions/${id}/status`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function updateReportPublish(id, payload) {
  return request(`/reports/${id}/publish`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

async function request(path, init = {}) {
  return fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    },
    ...init
  }).then(handleJson);
}

async function handleJson(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || data.error || "Request failed");
  }
  return data;
}
