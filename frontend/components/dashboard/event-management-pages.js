"use client";

import { formatLap, normalizeDriverSetup } from "@/components/dashboard/planned-session-utils";

export function EventManager({
  mode,
  eventsStore,
  eventDraft,
  driversStore,
  tracksStore,
  editingEventId,
  onSelectEvent,
  onCancel,
  onChange,
  onDelete,
  onEdit,
  onCreateSession,
  onSubmit,
}) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const filteredEvents = eventsStore.filter((item) => {
    const startKey = item.start_date || item.date;
    if (mode === "View Upcoming Events") {
      return !startKey || String(startKey) >= todayKey;
    }
    if (mode === "View Past Events") {
      return Boolean(startKey) && String(startKey) < todayKey;
    }
    return true;
  });
  const isCreateMode = mode === "Create Event";
  const heading = isCreateMode
    ? "Create and shape the event before any session planning starts."
    : mode === "View Upcoming Events"
      ? "Browse the future event schedule and jump into session planning when you are ready."
      : "Open older events when you need to revisit their session plans.";
  const listTitle = mode === "View Past Events" ? "Past events" : mode === "View Upcoming Events" ? "Upcoming events" : "All events";

  return (
    <div className="workspace-page">
      <section className="workspace-hero workspace-hero-premium">
        <div className="workspace-hero-premium-grid">
          <div className="workspace-hero-copy max-w-3xl">
            <p className="workspace-section-label">Event Planning</p>
            <h2 className="workspace-hero-title">{listTitle}</h2>
            <p className="workspace-hero-text">{heading}</p>
          </div>
          <div className="workspace-hero-grid">
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Events in view</p>
              <p className="workspace-kpi-value">{filteredEvents.length}</p>
              <p className="workspace-kpi-detail">{mode === "View Past Events" ? "Historical events currently visible." : "Events currently in your planning view."}</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Planned sessions</p>
              <p className="workspace-kpi-value">{eventsStore.reduce((count, item) => count + (item.sessions?.length || 0), 0)}</p>
              <p className="workspace-kpi-detail">Sessions already built across the loaded event schedule.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Mode</p>
              <p className="workspace-kpi-value">{isCreateMode ? "Create" : "Browse"}</p>
              <p className="workspace-kpi-detail">{isCreateMode ? "Build a new event record before session planning starts." : "Open the right event and drop into the session workspace."}</p>
            </div>
          </div>
        </div>
      </section>

      <article className="app-panel p-5">
        {isCreateMode ? (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="workspace-section-label">Event Editor</p>
                <h3 className="mt-2 text-2xl font-semibold">{editingEventId ? "Update event" : "Create event"}</h3>
              </div>
              <span className="pill pill-neutral">{editingEventId ? "Editing" : "New event"}</span>
            </div>

            <form className="mt-5 grid gap-4" onSubmit={onSubmit}>
              <select className="workspace-field" value={eventDraft.venue} onChange={(event) => onChange((current) => ({ ...current, venue: event.target.value }))}>
                <option value="">Select track / venue</option>
                {tracksStore.map((track) => (
                  <option key={track.id} value={track.name}>{track.name}</option>
                ))}
              </select>
              <input className="workspace-field" placeholder="Event name" value={eventDraft.name} onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))} />
              <div className="grid gap-4 md:grid-cols-2">
                <input className="workspace-field" placeholder="Session type" value={eventDraft.session_type} onChange={(event) => onChange((current) => ({ ...current, session_type: event.target.value }))} />
                <input className="workspace-field" placeholder="From date" type="date" value={eventDraft.start_date} onChange={(event) => onChange((current) => ({ ...current, start_date: event.target.value }))} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <input className="workspace-field" placeholder="To date" type="date" value={eventDraft.end_date} onChange={(event) => onChange((current) => ({ ...current, end_date: event.target.value }))} />
                <div className="workspace-subtle-card flex items-center px-4 py-3 text-sm muted">Use one day for single-day tests or set a full event range.</div>
              </div>
              <div className="workspace-subtle-card p-4">
                <p className="text-sm font-medium text-white">Assign drivers to this event</p>
                <div className="mt-3 workflow-chip-grid">
                  {driversStore.map((driver) => {
                    const checked = eventDraft.driver_ids.includes(driver.id);
                    return (
                      <label key={driver.id} className={`pill selection-pill ${checked ? "is-selected" : "pill-neutral"} cursor-pointer`}>
                        <input
                          className="hidden"
                          checked={checked}
                          type="checkbox"
                          onChange={(event) => onChange((current) => ({
                            ...current,
                            driver_ids: event.target.checked
                              ? [...current.driver_ids, driver.id]
                              : current.driver_ids.filter((id) => id !== driver.id),
                          }))}
                        />
                        <span className="selection-pill-marker" aria-hidden="true">OK</span>
                        <span>{driver.name} ({driver.class_name || "No class"})</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="profile-actions">
                <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" type="submit">{editingEventId ? "Save event" : "Create event"}</button>
                {editingEventId ? (
                  <button className="workspace-ghost px-4 py-3 text-sm" onClick={onCancel} type="button">Cancel</button>
                ) : null}
              </div>
            </form>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="workspace-section-label">Event List</p>
              <h3 className="mt-2 text-2xl font-semibold">{listTitle}</h3>
            </div>
            <span className="pill pill-neutral">{filteredEvents.length} events</span>
          </div>
        )}

        <div className="entity-list mt-6">
          {filteredEvents.map((item) => (
            <div key={item.id} className="entity-row">
              <div>
                <p className="entity-title">{item.name}</p>
                <p className="entity-subtitle">{item.venue} / {item.session_type} / {formatEventDateRange(item)}</p>
              </div>
              <div>
                <p className="member-block-label">Event drivers</p>
                <div className="chip-row mt-2">
                  {item.drivers?.length ? item.drivers.slice(0, 3).map((driver) => (
                    <span key={driver.id} className="pill pill-neutral">{driver.name}</span>
                  )) : <span className="pill pill-neutral">No drivers assigned</span>}
                  {item.drivers?.length > 3 ? <span className="pill pill-neutral">+{item.drivers.length - 3} more</span> : null}
                </div>
              </div>
              <div>
                <p className="member-block-label">Sessions</p>
                <p className="entity-subtitle mt-2">{item.sessions?.length || 0} planned</p>
              </div>
              <div className="entity-actions">
                <button className="workspace-ghost px-3 py-2 text-sm" onClick={() => onSelectEvent(item.id)} type="button">Sessions</button>
                <button className="workspace-ghost px-3 py-2 text-sm" onClick={() => onCreateSession(item.id)} type="button">New session</button>
                <button className="workspace-ghost px-3 py-2 text-sm" onClick={() => onEdit(item)} type="button">Edit</button>
                <button className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" onClick={() => onDelete(item.id)} type="button">Delete</button>
              </div>
            </div>
          ))}
          {!filteredEvents.length ? (
            <div className="workspace-subtle-card p-6 text-sm muted">
              {isCreateMode ? "No events created yet. Use the editor above to add the first event." : `No events found in ${listTitle.toLowerCase()}.`}
            </div>
          ) : null}
        </div>
      </article>
    </div>
  );
}

export function SessionListPage({ eventsStore, sessionsStore, reportsStore, selectedPlannerEventId, onBackToEvents, onCreateSession, onEditSession, onDeleteSession, onOpenSession, onOpenUploadSession, onRefreshAllWeather, loading = false }) {
  const selectedEvent = eventsStore.find((item) => item.id === selectedPlannerEventId) || null;
  const sessions = selectedEvent?.sessions || [];
  const eventSummary = buildEventDaySummary(sessions, sessionsStore || [], reportsStore || []);

  return (
    <div className="workspace-page">
      <section className="workspace-hero workspace-hero-premium">
        <div className="workspace-hero-premium-grid">
          <div className="workspace-hero-copy">
            <p className="workspace-section-label">Event Sessions</p>
            <h2 className="workspace-hero-title">{selectedEvent ? selectedEvent.name : "Choose an event"}</h2>
            <p className="workspace-hero-text">
              {selectedEvent
                ? `${selectedEvent.venue} / ${selectedEvent.session_type} / ${selectedEvent.date || "No date"}`
                : "Go back to Events and choose the event you want to manage."}
            </p>
          </div>
          <div className="workspace-hero-grid">
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Planned sessions</p>
              <p className="workspace-kpi-value">{sessions.length}</p>
              <p className="workspace-kpi-detail">Every planned session inside this event.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Uploads logged</p>
              <p className="workspace-kpi-value">{eventSummary.uploadedCount}</p>
              <p className="workspace-kpi-detail">Runs already brought back from the circuit.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Need reports</p>
              <p className="workspace-kpi-value">{eventSummary.needReportsCount}</p>
              <p className="workspace-kpi-detail">Uploaded sessions still waiting on reports.</p>
            </div>
          </div>
        </div>
        <div className="mt-5 profile-actions">
            <button className="workspace-ghost px-4 py-3 text-sm" onClick={onBackToEvents} type="button">Back to events</button>
            {selectedEvent ? <button className="workspace-ghost px-4 py-3 text-sm" onClick={() => onRefreshAllWeather?.(selectedEvent.id)} type="button" disabled={loading || !sessions.length}>{loading ? "Refreshing forecasts..." : "Refresh all forecasts"}</button> : null}
            {selectedEvent ? <button className="workspace-primary px-4 py-3 text-sm text-white" onClick={() => onCreateSession(selectedEvent.id)} type="button">Create session</button> : null}
        </div>
      </section>

      <article className="app-panel p-5">
        {selectedEvent ? (
          <div className="mt-6 grid gap-5">
            <div className="workspace-hero-grid">
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">Planned Sessions</p>
                <p className="workspace-kpi-value">{sessions.length}</p>
                <p className="workspace-kpi-detail">All sessions scheduled inside this event</p>
              </div>
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">Uploads Logged</p>
                <p className="workspace-kpi-value">{eventSummary.uploadedCount}</p>
                <p className="workspace-kpi-detail">Runs already brought back from the circuit</p>
              </div>
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">Setup Saved</p>
                <p className="workspace-kpi-value">{eventSummary.setupSavedCount}</p>
                <p className="workspace-kpi-detail">Sessions with setup entered</p>
              </div>
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">Need Reports</p>
                <p className="workspace-kpi-value">{eventSummary.needReportsCount}</p>
                <p className="workspace-kpi-detail">Uploaded sessions still waiting on reports</p>
              </div>
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">Conditions Logged</p>
                <p className="workspace-kpi-value">{eventSummary.conditionsLoggedCount}</p>
                <p className="workspace-kpi-detail">Sessions with weather / track / note context saved</p>
              </div>
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">Forecasts Ready</p>
                <p className="workspace-kpi-value">{eventSummary.forecastReadyCount}</p>
                <p className="workspace-kpi-detail">Planned sessions with a saved forecast snapshot</p>
              </div>
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">Forecasts Stale</p>
                <p className="workspace-kpi-value">{eventSummary.forecastStaleCount}</p>
                <p className="workspace-kpi-detail">Forecasts that should be refreshed before running</p>
              </div>
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">Operationally Active</p>
                <p className="workspace-kpi-value">{eventSummary.statusReadyCount}</p>
                <p className="workspace-kpi-detail">Sessions moved beyond pure planning</p>
              </div>
            </div>
            <div className="workspace-subtle-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="workspace-section-label">Event-Day Dashboard</p>
                  <h3 className="mt-2 text-xl font-semibold">What still needs attention today</h3>
                </div>
                <span className="pill pill-neutral">{eventSummary.attentionItems.length} action{eventSummary.attentionItems.length === 1 ? "" : "s"}</span>
              </div>
              {eventSummary.attentionItems.length ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {eventSummary.attentionItems.map((item) => (
                    <div key={`${item.sessionId}-${item.label}`} className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                      <p className="text-sm font-medium text-white">{item.sessionName}</p>
                      <p className="mt-2 text-sm muted">{item.label}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-slate-950/20 p-5 text-sm muted">
                  This event looks tidy so far. All sessions have either setup saved, uploads logged, or reports underway.
                </div>
              )}
            </div>
            <div className="entity-list">
              {sessions.map((testSession) => {
                const metrics = buildPlannedSessionMetrics(testSession, sessionsStore || [], reportsStore || []);
                return (
                  <div key={testSession.id} className="workflow-card">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                      <button className="min-w-0 flex-1 text-left" onClick={() => onOpenSession(testSession)} type="button">
                        <h4 className="text-lg font-semibold">{testSession.name}</h4>
                        <p className="mt-1 text-sm muted">{testSession.venue} / {testSession.session_type} / {testSession.date || "No date"}</p>
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="pill pill-neutral">{testSession.drivers.length} drivers</span>
                        <span className={`pill ${testSession.setup_saved ? "" : "pill-neutral"}`}>{testSession.setup_saved ? "setup saved" : "setup pending"}</span>
                        <span className={`pill ${(testSession.upload_count || 0) ? "" : "pill-neutral"}`}>{testSession.upload_count || 0} upload{(testSession.upload_count || 0) === 1 ? "" : "s"}</span>
                        <span className={`pill ${(testSession.report_count || 0) ? "" : "pill-neutral"}`}>{testSession.report_count || 0} report{(testSession.report_count || 0) === 1 ? "" : "s"}</span>
                        <span className={`pill planned-session-status planned-session-status-${testSession.status || "planned"}`}>{formatPlannedSessionStatus(testSession.status)}</span>
                        <button className="workspace-ghost px-3 py-2 text-sm" onClick={() => onOpenSession(testSession)} type="button">Open session</button>
                        <button className="workspace-primary px-3 py-2 text-sm text-white" onClick={() => onOpenUploadSession(testSession)} type="button">Upload data</button>
                        <button className="workspace-ghost px-3 py-2 text-sm" onClick={() => onEditSession(testSession)} type="button">Edit session</button>
                        <button className="workspace-danger px-3 py-2 text-sm" onClick={() => onDeleteSession(testSession.id)} type="button">Delete session</button>
                      </div>
                    </div>
                    <div className="workflow-chip-grid mt-4">
                      {testSession.drivers.map((driver) => (
                        <span key={driver.id} className="pill pill-neutral">{driver.name} - {driver.class_name || "No class"}</span>
                      ))}
                      {metrics.forecastStatusLabel ? <span className={`pill ${metrics.forecastStatusTone === "warn" ? "pill-warn" : "pill-neutral"}`}>{metrics.forecastStatusLabel}</span> : null}
                    </div>
                    {testSession.weather_forecast?.summary ? (
                      <EventForecastStrip forecast={testSession.weather_forecast} />
                    ) : null}
                    {metrics.warnings.length ? (
                      <div className="workflow-chip-grid mt-4">
                        {metrics.warnings.map((warning) => (
                          <span key={`${testSession.id}-${warning}`} className="pill pill-warn">{warning}</span>
                        ))}
                      </div>
                    ) : (
                      <div className="workflow-chip-grid mt-4">
                        <span className="pill">Operationally ready</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {!sessions.length ? <div className="workspace-subtle-card p-6 text-sm muted">No sessions created for this event yet. Create one to start the upload workflow.</div> : null}
            </div>
          </div>
        ) : (
          <div className="workspace-subtle-card mt-6 p-6 text-sm muted">No event selected yet.</div>
        )}
      </article>
    </div>
  );
}

export function formatPlannedSessionStatus(status) {
  const options = {
    planned: "Planned",
    setup_complete: "Setup Complete",
    uploaded: "Uploaded",
    analysed: "Analysed",
    reviewed: "Reviewed",
  };
  return options[status || "planned"] || "Planned";
}

export function buildPlannedSessionMetrics(testSession, sessionsStore = [], reportsStore = []) {
  const linkedUploads = sessionsStore.filter((item) => item.test_session_id === testSession.id);
  const linkedReports = reportsStore.filter((item) => linkedUploads.some((upload) => upload.id === item.session_id));
  const hasConditions = Boolean(
    (testSession.weather || "").trim()
    || (testSession.track_condition || "").trim()
    || (testSession.tyre_condition || "").trim()
    || (testSession.mechanic_notes || "").trim()
    || (testSession.coach_notes || "").trim()
  );
  const hasForecast = Boolean((testSession.weather_forecast?.summary || "").trim());
  const forecastState = getForecastState(testSession);
  const warnings = [];
  if (!testSession.setup_saved) {
    warnings.push("Setup missing");
  }
  if (!linkedUploads.length) {
    warnings.push("Upload missing");
  }
  if (linkedUploads.length && !linkedReports.length) {
    warnings.push("Report needed");
  }
  if (!hasConditions) {
    warnings.push("Conditions missing");
  }
  if (forecastState.isStale) {
    warnings.push("Forecast stale");
  }
  return {
    setupSaved: Boolean(testSession.setup_saved),
    uploadCount: linkedUploads.length || testSession.upload_count || 0,
    reportCount: linkedReports.length || testSession.report_count || 0,
    hasConditions,
    hasForecast,
    forecastStatusLabel: forecastState.label,
    forecastStatusTone: forecastState.tone,
    forecastIsStale: forecastState.isStale,
    warnings,
  };
}

export function buildEventDaySummary(testSessions = [], sessionsStore = [], reportsStore = []) {
  const attentionItems = [];
  let uploadedCount = 0;
  let setupSavedCount = 0;
  let needReportsCount = 0;
  let conditionsLoggedCount = 0;
  let forecastReadyCount = 0;
  let forecastStaleCount = 0;
  let statusReadyCount = 0;

  testSessions.forEach((testSession) => {
    const metrics = buildPlannedSessionMetrics(testSession, sessionsStore, reportsStore);
    uploadedCount += metrics.uploadCount;
    setupSavedCount += metrics.setupSaved ? 1 : 0;
    conditionsLoggedCount += metrics.hasConditions ? 1 : 0;
    forecastReadyCount += metrics.hasForecast ? 1 : 0;
    forecastStaleCount += metrics.forecastIsStale ? 1 : 0;
    statusReadyCount += ["uploaded", "analysed", "reviewed"].includes(testSession.status) ? 1 : 0;
    if (!metrics.setupSaved) {
      attentionItems.push({ sessionId: testSession.id, sessionName: testSession.name, label: "Kart setup still needs entering." });
    }
    if (!metrics.uploadCount) {
      attentionItems.push({ sessionId: testSession.id, sessionName: testSession.name, label: "No telemetry upload has been linked yet." });
    }
    if (metrics.uploadCount && !metrics.reportCount) {
      needReportsCount += 1;
      attentionItems.push({ sessionId: testSession.id, sessionName: testSession.name, label: "Uploads are in but reports are still missing." });
    }
    if (!metrics.hasConditions) {
      attentionItems.push({ sessionId: testSession.id, sessionName: testSession.name, label: "Weather, tyre, or mechanic notes still need logging." });
    }
    if (metrics.forecastIsStale) {
      attentionItems.push({ sessionId: testSession.id, sessionName: testSession.name, label: "Forecast snapshot is stale or out of date for this session." });
    }
  });

  return {
    uploadedCount,
    setupSavedCount,
    needReportsCount,
    conditionsLoggedCount,
    forecastReadyCount,
    forecastStaleCount,
    statusReadyCount,
    attentionItems,
  };
}

export function getForecastState(testSession) {
  const forecast = testSession?.weather_forecast || {};
  if (!String(forecast.summary || "").trim()) {
    return { label: "No forecast", tone: "neutral", isStale: false };
  }

  const forecastDate = String(forecast.forecast_date || "").trim();
  const sessionDate = String(testSession?.date || "").trim();
  const refreshedAt = String(forecast.refreshed_at || "").trim();
  const now = Date.now();
  const refreshedMs = refreshedAt ? Date.parse(refreshedAt) : NaN;
  const ageHours = Number.isFinite(refreshedMs) ? (now - refreshedMs) / 36e5 : null;
  const dateMismatch = Boolean(forecastDate && sessionDate && forecastDate !== sessionDate);
  const staleByAge = ageHours !== null && ageHours > 6;

  if (dateMismatch) {
    return { label: "Date mismatch", tone: "warn", isStale: true };
  }
  if (staleByAge) {
    return { label: "Forecast stale", tone: "warn", isStale: true };
  }
  return { label: "Forecast fresh", tone: "neutral", isStale: false };
}

function EventForecastStrip({ forecast }) {
  return (
    <div className="event-forecast-strip mt-4">
      <div className="event-forecast-badge" aria-hidden="true">{getForecastIcon(forecast)}</div>
      <div className="event-forecast-main">
        <p className="event-forecast-title">{forecast.weather_label || "Forecast"}</p>
        <p className="event-forecast-subtitle">{forecast.summary}</p>
      </div>
      <div className="event-forecast-stat">
        <span className="event-forecast-stat-label">Temp</span>
        <strong>{formatForecastTemperatureRange(forecast)}</strong>
      </div>
      <div className="event-forecast-stat">
        <span className="event-forecast-stat-label">Rain</span>
        <strong>{formatForecastPercent(forecast.rain_probability_pct)}</strong>
      </div>
      <div className="event-forecast-stat">
        <span className="event-forecast-stat-label">Wind</span>
        <strong>{formatForecastWind(forecast.wind_kph)}</strong>
      </div>
    </div>
  );
}

function getForecastIcon(forecast = {}) {
  const code = Number(forecast.weather_code);
  if ([95, 96, 99].includes(code)) return "⛈";
  if ([61, 63, 65, 80, 81, 82].includes(code)) return "🌧";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "🌨";
  if ([51, 53, 55, 56, 57].includes(code)) return "🌦";
  if ([45, 48].includes(code)) return "🌫";
  if ([1, 2].includes(code)) return "⛅";
  if (code === 3) return "☁";
  return "☀";
}

function formatForecastTemperatureRange(forecast = {}) {
  const min = forecast.temperature_min_c;
  const max = forecast.temperature_max_c;
  if (min == null && max == null) return "-";
  if (min == null) return `${Number(max).toFixed(0)}C`;
  if (max == null) return `${Number(min).toFixed(0)}C`;
  return `${Number(min).toFixed(0)}-${Number(max).toFixed(0)}C`;
}

function formatForecastPercent(value) {
  return value == null ? "-" : `${Number(value).toFixed(0)}%`;
}

function formatForecastWind(value) {
  return value == null ? "-" : `${Number(value).toFixed(0)} km/h`;
}

export function formatEventDateRange(eventItem) {
  const startKey = eventItem?.start_date || eventItem?.date;
  const endKey = eventItem?.end_date || eventItem?.start_date || eventItem?.date;
  if (!startKey) {
    return "No date";
  }
  if (!endKey || endKey === startKey) {
    return startKey;
  }
  return `${startKey} to ${endKey}`;
}

const FRONT_SPROCKET_OPTIONS = ["11T", "12T", "13T"];
const REAR_SPROCKET_OPTIONS = ["73T", "74T", "75T", "76T", "77T", "78T", "79T", "80T", "81T", "82T", "83T", "84T"];
const CARB_JET_OPTIONS = ["124", "125", "126", "127", "128", "129", "130"];
const AXLE_LENGTH_OPTIONS = ["1000", "1030"];
const TYRE_TYPE_OPTIONS = ["Slicks", "Wets"];
const TORSION_BAR_OPTIONS = ["Flat", "Round"];
const CASTER_OPTIONS = ["Neutral", "Half", "Full"];
const RIDE_HEIGHT_OPTIONS = ["Neutral", "Raised", "Dropped"];
const PLANNED_SESSION_STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "setup_complete", label: "Setup Complete" },
  { value: "uploaded", label: "Uploaded" },
  { value: "analysed", label: "Analysed" },
  { value: "reviewed", label: "Reviewed" },
];

function KartSetupField({ label, children }) {
  return (
    <label className="grid gap-2">
      <span className="workspace-kpi-label">{label}</span>
      {children}
    </label>
  );
}

function updateDraftDriverSetup(onChange, driverId, field, value) {
  onChange((current) => ({
    ...current,
    driver_setups: {
      ...(current.driver_setups || {}),
      [driverId]: {
        ...normalizeDriverSetup(current.driver_setups?.[driverId]),
        [field]: value,
      },
    },
  }));
}

export function SessionEditorPage({ eventsStore, testSessionDraft, editingTestSessionId, onChange, onCancel, onSubmit }) {
  const selectedEvent = eventsStore.find((item) => item.id === testSessionDraft.event_id) || null;
  const availableDrivers = selectedEvent?.drivers || [];
  const selectedDrivers = availableDrivers.filter((driver) => testSessionDraft.driver_ids.includes(driver.id));

  return (
    <div className="workspace-page">
      <article className="app-panel p-5">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="workspace-section-label">Session Editor</p>
            <h2 className="mt-2 text-3xl font-semibold">{editingTestSessionId ? "Edit planned session" : "Create planned session"}</h2>
            <p className="mt-2 text-sm muted">
              {selectedEvent
                ? `Creating inside ${selectedEvent.name} at ${selectedEvent.venue}.`
                : "Choose the parent event from the Events page first."}
            </p>
          </div>
          <button className="workspace-ghost px-4 py-3 text-sm" onClick={onCancel} type="button">Back to sessions</button>
        </div>

        <form className="mt-5 grid gap-4" onSubmit={onSubmit}>
          <div className="workspace-subtle-card p-4">
            <p className="text-sm font-medium text-white">{selectedEvent?.name || "No event selected"}</p>
            <p className="mt-1 text-sm muted">{selectedEvent ? `${selectedEvent.venue} / ${selectedEvent.session_type} / ${selectedEvent.date || "No date"}` : "Return to Events and open a session list first."}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <input className="workspace-field" placeholder="Session name" value={testSessionDraft.name} onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))} />
            <input className="workspace-field" placeholder="Venue" value={testSessionDraft.venue} onChange={(event) => onChange((current) => ({ ...current, venue: event.target.value }))} />
            <input className="workspace-field" placeholder="Session type" value={testSessionDraft.session_type} onChange={(event) => onChange((current) => ({ ...current, session_type: event.target.value }))} />
            <input className="workspace-field" type="date" value={testSessionDraft.date} onChange={(event) => onChange((current) => ({ ...current, date: event.target.value }))} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <KartSetupField label="Start Time">
              <input className="workspace-field" type="time" value={testSessionDraft.start_time || ""} onChange={(event) => onChange((current) => ({ ...current, start_time: event.target.value }))} />
            </KartSetupField>
            <KartSetupField label="End Time">
              <input className="workspace-field" type="time" value={testSessionDraft.end_time || ""} onChange={(event) => onChange((current) => ({ ...current, end_time: event.target.value }))} />
            </KartSetupField>
          </div>
          <div className="workspace-subtle-card p-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KartSetupField label="Session Status">
                <select className="workspace-field" value={testSessionDraft.status || "planned"} onChange={(event) => onChange((current) => ({ ...current, status: event.target.value }))}>
                  {PLANNED_SESSION_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </KartSetupField>
              <KartSetupField label="Weather">
                <input className="workspace-field" placeholder="Dry, cold, windy..." value={testSessionDraft.weather || ""} onChange={(event) => onChange((current) => ({ ...current, weather: event.target.value }))} />
              </KartSetupField>
              <KartSetupField label="Track Condition">
                <input className="workspace-field" placeholder="Green, rubbered in..." value={testSessionDraft.track_condition || ""} onChange={(event) => onChange((current) => ({ ...current, track_condition: event.target.value }))} />
              </KartSetupField>
              <KartSetupField label="Tyre Condition">
                <input className="workspace-field" placeholder="Fresh, scrubbed, used..." value={testSessionDraft.tyre_condition || ""} onChange={(event) => onChange((current) => ({ ...current, tyre_condition: event.target.value }))} />
              </KartSetupField>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <KartSetupField label="Mechanic Notes">
                <textarea className="workspace-field min-h-[120px]" placeholder="Garage observations and changes between runs." value={testSessionDraft.mechanic_notes || ""} onChange={(event) => onChange((current) => ({ ...current, mechanic_notes: event.target.value }))} />
              </KartSetupField>
              <KartSetupField label="Coach Notes">
                <textarea className="workspace-field min-h-[120px]" placeholder="Session goals, briefing notes, and debrief prompts." value={testSessionDraft.coach_notes || ""} onChange={(event) => onChange((current) => ({ ...current, coach_notes: event.target.value }))} />
              </KartSetupField>
            </div>
          </div>
          <div className="workspace-subtle-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-white">Assign drivers</p>
              <span className="pill pill-neutral">{selectedEvent ? `${selectedEvent.name} driver pool` : "No event driver pool"}</span>
            </div>
            <div className="mt-3 workflow-chip-grid">
              {availableDrivers.map((driver) => {
                const checked = testSessionDraft.driver_ids.includes(driver.id);
                return (
                  <label key={driver.id} className={`pill selection-pill ${checked ? "is-selected" : "pill-neutral"} cursor-pointer`}>
                    <input
                      className="hidden"
                      checked={checked}
                      type="checkbox"
                      onChange={(event) => onChange((current) => ({
                        ...current,
                        driver_ids: event.target.checked
                          ? [...current.driver_ids, driver.id]
                          : current.driver_ids.filter((id) => id !== driver.id),
                      }))}
                    />
                    <span className="selection-pill-marker" aria-hidden="true">OK</span>
                    <span>{driver.name} ({driver.class_name || "No class"})</span>
                  </label>
                );
              })}
            </div>
          </div>
          {selectedDrivers.length ? (
            <div className="workspace-subtle-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">Per-driver kart setup</p>
                  <p className="mt-1 text-sm muted">These setup values are stored on this session only, so they can change from one session to the next.</p>
                </div>
                <span className="pill pill-neutral">{selectedDrivers.length} setup sheet{selectedDrivers.length === 1 ? "" : "s"}</span>
              </div>
              <div className="mt-4 grid gap-4">
                {selectedDrivers.map((driver) => {
                  const setup = normalizeDriverSetup(testSessionDraft.driver_setups?.[driver.id]);
                  return (
                    <div key={`${driver.id}-setup`} className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                        <div>
                          <p className="text-base font-semibold text-white">{driver.name}</p>
                          <p className="mt-1 text-sm muted">{driver.class_name || "No class"}</p>
                        </div>
                        <span className="pill pill-neutral">Session-specific setup</span>
                      </div>
                      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <KartSetupField label="Front Sprocket">
                          <select className="workspace-field" value={setup.front_sprocket} onChange={(event) => updateDraftDriverSetup(onChange, driver.id, "front_sprocket", event.target.value)}>
                            <option value="">Select front sprocket</option>
                            {FRONT_SPROCKET_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                        </KartSetupField>
                        <KartSetupField label="Rear Sprocket">
                          <select className="workspace-field" value={setup.rear_sprocket} onChange={(event) => updateDraftDriverSetup(onChange, driver.id, "rear_sprocket", event.target.value)}>
                            <option value="">Select rear sprocket</option>
                            {REAR_SPROCKET_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                        </KartSetupField>
                        <KartSetupField label="Carb Jet">
                          <select className="workspace-field" value={setup.carb_jet} onChange={(event) => updateDraftDriverSetup(onChange, driver.id, "carb_jet", event.target.value)}>
                            <option value="">Select carb jet</option>
                            {CARB_JET_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                        </KartSetupField>
                        <KartSetupField label="Axle Length">
                          <select className="workspace-field" value={setup.axle_length} onChange={(event) => updateDraftDriverSetup(onChange, driver.id, "axle_length", event.target.value)}>
                            <option value="">Select axle length</option>
                            {AXLE_LENGTH_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                        </KartSetupField>
                        <KartSetupField label="Axle Type">
                          <input className="workspace-field" placeholder="Enter axle type" value={setup.axle_type} onChange={(event) => updateDraftDriverSetup(onChange, driver.id, "axle_type", event.target.value)} />
                        </KartSetupField>
                        <KartSetupField label="Tyre Type">
                          <select className="workspace-field" value={setup.tyre_type} onChange={(event) => updateDraftDriverSetup(onChange, driver.id, "tyre_type", event.target.value)}>
                            <option value="">Select tyre type</option>
                            {TYRE_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                        </KartSetupField>
                        <KartSetupField label="Torsion Bar Type">
                          <select className="workspace-field" value={setup.torsion_bar_type} onChange={(event) => updateDraftDriverSetup(onChange, driver.id, "torsion_bar_type", event.target.value)}>
                            <option value="">Select torsion bar type</option>
                            {TORSION_BAR_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                        </KartSetupField>
                        <KartSetupField label="Caster Type">
                          <select className="workspace-field" value={setup.caster_type} onChange={(event) => updateDraftDriverSetup(onChange, driver.id, "caster_type", event.target.value)}>
                            <option value="">Select caster type</option>
                            {CASTER_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                        </KartSetupField>
                        <KartSetupField label="Ride Height">
                          <select className="workspace-field" value={setup.ride_height} onChange={(event) => updateDraftDriverSetup(onChange, driver.id, "ride_height", event.target.value)}>
                            <option value="">Select ride height</option>
                            {RIDE_HEIGHT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                        </KartSetupField>
                        <KartSetupField label="Front Tyre Pressure">
                          <input className="workspace-field" inputMode="decimal" placeholder="Enter front tyre pressure" type="number" step="0.1" value={setup.front_tyre_pressure} onChange={(event) => updateDraftDriverSetup(onChange, driver.id, "front_tyre_pressure", event.target.value)} />
                        </KartSetupField>
                        <KartSetupField label="Rear Tyre Pressure">
                          <input className="workspace-field" inputMode="decimal" placeholder="Enter rear tyre pressure" type="number" step="0.1" value={setup.rear_tyre_pressure} onChange={(event) => updateDraftDriverSetup(onChange, driver.id, "rear_tyre_pressure", event.target.value)} />
                        </KartSetupField>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="profile-actions">
            <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" type="submit">{editingTestSessionId ? "Save session" : "Create session"}</button>
            <button className="workspace-ghost px-4 py-3 text-sm" onClick={onCancel} type="button">Cancel</button>
          </div>
        </form>
      </article>
    </div>
  );
}
