"use client";

import { useEffect, useState } from "react";
import { exportPdf } from "@/lib/api";
import { slugify } from "@/lib/dashboard-utils";
import {
  applySetupChangeCounts,
  buildSetupDeltaGroups,
  buildSetupPerformanceCorrelations,
  buildUploadedRunComparisons,
  formatLap,
  normalizeDriverSetup,
} from "@/components/dashboard/planned-session-utils";
import { buildPlannedSessionMetrics, formatPlannedSessionStatus, getForecastState } from "@/components/dashboard/event-management-pages";

export function PlannedSessionPage({
  selectedTestSession,
  linkedUploadedSessions = [],
  loading,
  mobileExperience = false,
  onBack,
  onDeleteSession,
  onEditSession,
  onOpenUploadSession,
  onSaveSetup,
  onSaveSession,
  onRefreshWeather,
  onOpenUploadedSession,
  onDeleteUploadedSession
}) {
  const [driverSetups, setDriverSetups] = useState({});
  const [setupDirty, setSetupDirty] = useState(false);
  const [sessionDraft, setSessionDraft] = useState({
    status: "planned",
    weather: "",
    track_condition: "",
    tyre_condition: "",
    mechanic_notes: "",
    coach_notes: "",
  });
  const [sessionDirty, setSessionDirty] = useState(false);
  const [reportDriverIds, setReportDriverIds] = useState([]);
  const [selectedUploadIds, setSelectedUploadIds] = useState([]);

  useEffect(() => {
    setDriverSetups(
      Object.fromEntries(
        (selectedTestSession?.drivers || []).map((driver) => [driver.id, normalizeDriverSetup(driver.setup)])
      )
    );
    setSessionDraft({
      status: selectedTestSession?.status || "planned",
      start_time: selectedTestSession?.start_time || "",
      end_time: selectedTestSession?.end_time || "",
      weather: selectedTestSession?.weather || "",
      track_condition: selectedTestSession?.track_condition || "",
      tyre_condition: selectedTestSession?.tyre_condition || "",
      mechanic_notes: selectedTestSession?.mechanic_notes || "",
      coach_notes: selectedTestSession?.coach_notes || "",
    });
    setSetupDirty(false);
    setSessionDirty(false);
    setReportDriverIds((selectedTestSession?.drivers || []).map((driver) => driver.id));
    setSelectedUploadIds([]);
  }, [selectedTestSession]);

  const selectedUploads = linkedUploadedSessions.filter((item) => selectedUploadIds.includes(item.id));
  const setupDeltaGroups = buildSetupDeltaGroups(selectedUploads);
  const runComparisons = applySetupChangeCounts(buildUploadedRunComparisons(selectedUploads), setupDeltaGroups);
  const setupPerformanceCorrelations = buildSetupPerformanceCorrelations(selectedUploads);
  const plannedSessionMetrics = buildPlannedSessionMetrics(selectedTestSession || {}, linkedUploadedSessions, []);
  const topRunImprovement = runComparisons.find((entry) => entry.improvementLabel && !entry.improvementLabel.startsWith("Baseline"));
  const forecast = selectedTestSession?.weather_forecast || null;
  const forecastState = getForecastState(selectedTestSession);

  async function handleSaveSetup() {
    if (!selectedTestSession) return;
    await onSaveSetup(selectedTestSession.id, driverSetups);
    setSetupDirty(false);
  }

  async function handleSaveSessionDetails() {
    if (!selectedTestSession) return;
    await onSaveSession(selectedTestSession.id, sessionDraft);
    setSessionDirty(false);
  }

  function openSetupReport() {
    if (!selectedTestSession) return;
    const params = new URLSearchParams({
      testSessionId: selectedTestSession.id,
      reportType: "setup",
      audience: "coach",
    });
    if (reportDriverIds.length) {
      params.set("driverIds", reportDriverIds.join(","));
    }
    window.open(`/report-template?${params.toString()}`, "_blank", "noopener,noreferrer");
  }

  async function exportSetupReport() {
    if (!selectedTestSession) return;
    const blob = await exportPdf({
      testSessionId: selectedTestSession.id,
      reportType: "setup",
      audience: "coach",
      driverIds: reportDriverIds,
      fileName: `${slugify(selectedTestSession.name || "session")}-setup-report.pdf`,
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slugify(selectedTestSession.name || "session")}-setup-report.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  if (selectedTestSession && mobileExperience) {
    return (
      <div className="workspace-page mobile-planning-page">
        <section className="workspace-hero workspace-hero-premium mobile-planning-hero">
          <div className="workspace-hero-copy mobile-compact-header">
            <p className="mobile-compact-label">Mobile Planned Session</p>
            <h2 className="mobile-compact-title">{selectedTestSession.name}</h2>
            <p className="mobile-compact-text">
              {[selectedTestSession.venue, selectedTestSession.session_type, selectedTestSession.date || "No date"].filter(Boolean).join(" / ")}
            </p>
          </div>
          <div className="mobile-stat-strip">
            <div className="mobile-stat-chip">
              <p className="mobile-stat-chip-label">Drivers</p>
              <p className="mobile-stat-chip-value">{selectedTestSession.drivers.length}</p>
            </div>
            <div className="mobile-stat-chip">
              <p className="mobile-stat-chip-label">Uploads</p>
              <p className="mobile-stat-chip-value">{linkedUploadedSessions.length}</p>
            </div>
            <div className="mobile-stat-chip">
              <p className="mobile-stat-chip-label">State</p>
              <p className="mobile-stat-chip-value">{formatPlannedSessionStatus(sessionDraft.status)}</p>
            </div>
          </div>
          <div className="mobile-toolbar">
            <button className="workspace-ghost" onClick={onBack} type="button">Back</button>
            <button className="workspace-primary text-white" onClick={() => onOpenUploadSession(selectedTestSession)} type="button">Upload</button>
            <button className="workspace-ghost" onClick={() => onEditSession(selectedTestSession)} type="button">Edit</button>
          </div>
        </section>

        <article className="mobile-section-card">
          <div className="mobile-list-stack">
            {plannedSessionMetrics.warnings.length ? (
              <div className="mobile-chip-strip">
                {plannedSessionMetrics.warnings.map((warning) => (
                  <span key={`${selectedTestSession.id}-${warning}`} className="pill pill-warn">{warning}</span>
                ))}
              </div>
            ) : (
              <div className="mobile-chip-strip">
                <span className="pill">Session looks operationally tidy</span>
              </div>
            )}

            <div className="mobile-list-row">
              <div className="mobile-list-row-main">
                <div>
                  <p className="mobile-list-title">Forecast</p>
                  <p className="mobile-list-meta">
                    {forecast?.summary
                      ? `${forecast.summary} / ${forecast.location_name || selectedTestSession.venue}`
                      : "No forecast saved yet for this session."}
                  </p>
                </div>
                <button
                  className="workspace-ghost"
                  disabled={!selectedTestSession?.date || !selectedTestSession?.venue || loading}
                  onClick={() => onRefreshWeather?.(selectedTestSession.id)}
                  type="button"
                >
                  {loading ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              {forecast?.summary ? (
                <>
                  <WeatherForecastVisual forecast={forecast} forecastState={forecastState} />
                  <div className="mobile-inline-metrics">
                    <div className="session-debrief-row">
                      <span>Session window</span>
                      <span>{formatSessionWindow(selectedTestSession)}</span>
                    </div>
                    <div className="session-debrief-row">
                      <span>Status</span>
                      <span>{forecastState.label}</span>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <div className="mobile-list-row">
              <p className="mobile-list-title">Session notes</p>
              <div className="mobile-filter-stack mt-3">
                <KartSetupField label="Status">
                  <select className="workspace-field" value={sessionDraft.status} onChange={(event) => { setSessionDraft((current) => ({ ...current, status: event.target.value })); setSessionDirty(true); }}>
                    {PLANNED_SESSION_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </KartSetupField>
                <KartSetupField label="Weather">
                  <input className="workspace-field" placeholder="Dry, cold, windy..." value={sessionDraft.weather} onChange={(event) => { setSessionDraft((current) => ({ ...current, weather: event.target.value })); setSessionDirty(true); }} />
                </KartSetupField>
                <KartSetupField label="Track Condition">
                  <input className="workspace-field" placeholder="Green, rubbered in..." value={sessionDraft.track_condition} onChange={(event) => { setSessionDraft((current) => ({ ...current, track_condition: event.target.value })); setSessionDirty(true); }} />
                </KartSetupField>
                <KartSetupField label="Coach Notes">
                  <textarea className="workspace-field min-h-[110px]" placeholder="Session goals and reminders." value={sessionDraft.coach_notes} onChange={(event) => { setSessionDraft((current) => ({ ...current, coach_notes: event.target.value })); setSessionDirty(true); }} />
                </KartSetupField>
              </div>
              <div className="mobile-list-actions">
                <button className="workspace-primary text-white" disabled={!sessionDirty || loading} onClick={handleSaveSessionDetails} type="button">
                  {loading ? "Saving..." : "Save details"}
                </button>
              </div>
            </div>

            <div className="mobile-list-row">
              <div className="mobile-list-row-main">
                <div>
                  <p className="mobile-list-title">Drivers</p>
                  <p className="mobile-list-meta">Assigned to this session.</p>
                </div>
                <span className="pill pill-neutral">{selectedTestSession.drivers.length}</span>
              </div>
              <div className="mobile-list-stack mt-3">
                {selectedTestSession.drivers.map((driver) => (
                  <div key={`${driver.id}-mobile-driver`} className="mobile-list-row">
                    <div className="mobile-list-row-main">
                      <div>
                        <p className="mobile-list-title">{driver.name}</p>
                        <p className="mobile-list-meta">{driver.class_name || "No class"}</p>
                      </div>
                      <span className="pill pill-neutral">{driver.setup ? "Setup saved" : "Setup pending"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mobile-list-row">
              <div className="mobile-list-row-main">
                <div>
                  <p className="mobile-list-title">Uploaded runs</p>
                  <p className="mobile-list-meta">Runs linked back to this plan.</p>
                </div>
                <span className="pill pill-neutral">{linkedUploadedSessions.length}</span>
              </div>
              <div className="mobile-list-stack mt-3">
                {linkedUploadedSessions.length ? linkedUploadedSessions.map((sessionRecord) => (
                  <div key={sessionRecord.id} className="mobile-list-row">
                    <div className="mobile-list-row-main">
                      <div>
                        <p className="mobile-list-title">{sessionRecord.event_round || sessionRecord.event_name || "Uploaded session"}</p>
                        <p className="mobile-list-meta">{[sessionRecord.session_type, sessionRecord.created_at].filter(Boolean).join(" / ")}</p>
                      </div>
                      <button className="workspace-ghost" onClick={() => onOpenUploadedSession(sessionRecord.id)} type="button">Open</button>
                    </div>
                  </div>
                )) : (
                  <div className="mobile-list-row">
                    <p className="text-sm font-medium text-white">No uploaded runs linked yet.</p>
                    <p className="mt-2 text-sm muted">Use Upload when the drivers come in.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="workspace-page">
      <section className="workspace-hero workspace-hero-premium">
        <div className="workspace-hero-premium-grid">
          <div className="workspace-hero-copy">
            <p className="workspace-section-label">Planned Session</p>
            <h2 className="workspace-hero-title">
              {selectedTestSession ? selectedTestSession.name : "Choose a session"}
            </h2>
            <p className="workspace-hero-text">
              {selectedTestSession
                ? `${selectedTestSession.venue} / ${selectedTestSession.session_type} / ${selectedTestSession.date || "No date"}`
                : "Go back to Event Sessions and choose the planned session you want to open."}
            </p>
          </div>
          <div className="workspace-hero-grid">
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Assigned drivers</p>
              <p className="workspace-kpi-value">{selectedTestSession ? selectedTestSession.drivers.length : 0}</p>
              <p className="workspace-kpi-detail">Drivers set up for this planned run.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Uploaded runs</p>
              <p className="workspace-kpi-value">{linkedUploadedSessions.length}</p>
              <p className="workspace-kpi-detail">Telemetry uploads already linked back to this plan.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Workflow state</p>
              <p className="workspace-kpi-value">{formatPlannedSessionStatus(sessionDraft.status)}</p>
              <p className="workspace-kpi-detail">Current operational state for this session.</p>
            </div>
          </div>
        </div>
        <div className="mt-5 profile-actions">
            <button className="workspace-ghost px-4 py-3 text-sm" onClick={onBack} type="button">Back to sessions</button>
            {selectedTestSession ? (
              <>
                <button className="workspace-primary px-4 py-3 text-sm text-white" onClick={() => onOpenUploadSession(selectedTestSession)} type="button">Upload data</button>
                <button className="workspace-ghost px-4 py-3 text-sm" onClick={() => onEditSession(selectedTestSession)} type="button">Edit session</button>
                <button
                  className="workspace-ghost px-4 py-3 text-sm"
                  disabled={(!setupDirty && !sessionDirty) || loading}
                  onClick={async () => {
                    if (sessionDirty) {
                      await handleSaveSessionDetails();
                    }
                    if (setupDirty) {
                      await handleSaveSetup();
                    }
                  }}
                  type="button"
                >
                  {loading ? "Saving..." : "Save setup"}
                </button>
                <button className="workspace-danger px-4 py-3 text-sm" onClick={() => onDeleteSession(selectedTestSession.id)} type="button">Delete session</button>
              </>
            ) : null}
          </div>
      </section>

      <article className="app-panel p-5">
        {selectedTestSession ? (
            <div className="mt-6 grid gap-4">
              <div className="workspace-hero-grid">
                <div className="workspace-kpi">
                  <p className="workspace-kpi-label">Assigned Drivers</p>
                  <p className="workspace-kpi-value">{selectedTestSession.drivers.length}</p>
                <p className="workspace-kpi-detail">Selected for this session</p>
              </div>
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">Venue</p>
                <p className="workspace-kpi-value text-[1.1rem]">{selectedTestSession.venue || "Not set"}</p>
                <p className="workspace-kpi-detail">Track / location</p>
              </div>
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">Session Type</p>
                <p className="workspace-kpi-value text-[1.1rem]">{selectedTestSession.session_type || "Not set"}</p>
                <p className="workspace-kpi-detail">Planned format</p>
              </div>
                <div className="workspace-kpi">
                  <p className="workspace-kpi-label">Date</p>
                  <p className="workspace-kpi-value text-[1.1rem]">{selectedTestSession.date || "No date"}</p>
                  <p className="workspace-kpi-detail">Scheduled day</p>
                </div>
                <div className="workspace-kpi">
                  <p className="workspace-kpi-label">Session Window</p>
                  <p className="workspace-kpi-value text-[1.1rem]">{formatSessionWindow(selectedTestSession)}</p>
                  <p className="workspace-kpi-detail">Focused weather window for this session</p>
                </div>
                <div className="workspace-kpi">
                  <p className="workspace-kpi-label">Uploaded Runs</p>
                  <p className="workspace-kpi-value text-[1.1rem]">{linkedUploadedSessions.length}</p>
                  <p className="workspace-kpi-detail">Telemetry uploads linked to this planned session</p>
                </div>
                <div className="workspace-kpi">
                  <p className="workspace-kpi-label">Session Status</p>
                  <p className="workspace-kpi-value text-[1.1rem]">{formatPlannedSessionStatus(sessionDraft.status)}</p>
                  <p className="workspace-kpi-detail">Operational workflow state</p>
                </div>
                <div className="workspace-kpi">
                  <p className="workspace-kpi-label">Reports</p>
                  <p className="workspace-kpi-value text-[1.1rem]">{selectedTestSession.report_count || 0}</p>
                  <p className="workspace-kpi-detail">Reports created from linked uploads</p>
                </div>
              </div>

              {plannedSessionMetrics.warnings.length ? (
                <div className="workflow-chip-grid">
                  {plannedSessionMetrics.warnings.map((warning) => (
                    <span key={`${selectedTestSession.id}-${warning}`} className="pill pill-warn">{warning}</span>
                  ))}
                </div>
              ) : (
                <div className="workflow-chip-grid">
                  <span className="pill">Session looks operationally tidy</span>
                </div>
              )}

              <div className="workspace-subtle-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="workspace-section-label">Conditions And Notes</p>
                    <h3 className="mt-2 text-xl font-semibold">Capture the real context around this run plan</h3>
                  </div>
                  <span className={`pill ${sessionDirty ? "" : "pill-neutral"}`}>{sessionDirty ? "Unsaved notes" : "Saved"}</span>
                </div>
                <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">Forecast snapshot</p>
                      <p className="mt-1 text-sm muted">
                        {forecast?.summary
                          ? `${forecast.summary} / ${forecast.location_name || selectedTestSession.venue} / ${forecast.forecast_date || selectedTestSession.date || "No date"}`
                          : "No forecast saved yet. Refresh the planned-session forecast once the date and venue are set."}
                      </p>
                    </div>
                    <div className="profile-actions">
                      {forecast?.refreshed_at ? <span className="pill pill-neutral">Updated {formatDateTimeLabel(forecast.refreshed_at)}</span> : null}
                      {forecast?.summary ? <span className={`pill ${forecastState.tone === "warn" ? "pill-warn" : "pill-neutral"}`}>{forecastState.label}</span> : null}
                      <button
                        className="workspace-ghost px-4 py-3 text-sm"
                        disabled={!selectedTestSession?.date || !selectedTestSession?.venue || loading}
                        onClick={() => onRefreshWeather?.(selectedTestSession.id)}
                        type="button"
                      >
                        {loading ? "Refreshing..." : "Refresh forecast"}
                      </button>
                    </div>
                  </div>
                  {forecast?.summary ? (
                    <>
                      <WeatherForecastVisual forecast={forecast} forecastState={forecastState} />
                      <HourlyForecastTimeline forecast={forecast} />
                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                        <ForecastMetric label="Conditions" value={forecast.weather_label || "-"} />
                        <ForecastMetric label="Temperature" value={formatTemperatureRange(forecast)} />
                        <ForecastMetric label="Rain Risk" value={formatPercent(forecast.rain_probability_pct)} />
                        <ForecastMetric label="Wind" value={formatWind(forecast.wind_kph)} />
                        <ForecastMetric label="Status" value={forecastState.label} />
                      </div>
                    </>
                  ) : null}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <KartSetupField label="Start Time">
                    <input className="workspace-field" type="time" value={sessionDraft.start_time || ""} onChange={(event) => { setSessionDraft((current) => ({ ...current, start_time: event.target.value })); setSessionDirty(true); }} />
                  </KartSetupField>
                  <KartSetupField label="End Time">
                    <input className="workspace-field" type="time" value={sessionDraft.end_time || ""} onChange={(event) => { setSessionDraft((current) => ({ ...current, end_time: event.target.value })); setSessionDirty(true); }} />
                  </KartSetupField>
                  <KartSetupField label="Session Status">
                    <select className="workspace-field" value={sessionDraft.status} onChange={(event) => { setSessionDraft((current) => ({ ...current, status: event.target.value })); setSessionDirty(true); }}>
                      {PLANNED_SESSION_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </KartSetupField>
                  <KartSetupField label="Weather">
                    <input className="workspace-field" placeholder="Dry, cold, windy..." value={sessionDraft.weather} onChange={(event) => { setSessionDraft((current) => ({ ...current, weather: event.target.value })); setSessionDirty(true); }} />
                  </KartSetupField>
                  <KartSetupField label="Track Condition">
                    <input className="workspace-field" placeholder="Green, rubbered in..." value={sessionDraft.track_condition} onChange={(event) => { setSessionDraft((current) => ({ ...current, track_condition: event.target.value })); setSessionDirty(true); }} />
                  </KartSetupField>
                  <KartSetupField label="Tyre Condition">
                    <input className="workspace-field" placeholder="Fresh, scrubbed, used..." value={sessionDraft.tyre_condition} onChange={(event) => { setSessionDraft((current) => ({ ...current, tyre_condition: event.target.value })); setSessionDirty(true); }} />
                  </KartSetupField>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <KartSetupField label="Mechanic Notes">
                    <textarea className="workspace-field min-h-[120px]" placeholder="Garage observations and changes between runs." value={sessionDraft.mechanic_notes} onChange={(event) => { setSessionDraft((current) => ({ ...current, mechanic_notes: event.target.value })); setSessionDirty(true); }} />
                  </KartSetupField>
                  <KartSetupField label="Coach Notes">
                    <textarea className="workspace-field min-h-[120px]" placeholder="Session goals, coaching notes, and debrief reminders." value={sessionDraft.coach_notes} onChange={(event) => { setSessionDraft((current) => ({ ...current, coach_notes: event.target.value })); setSessionDirty(true); }} />
                  </KartSetupField>
                </div>
                <div className="mt-4 flex justify-end">
                  <button className="workspace-primary px-4 py-3 text-sm text-white" disabled={!sessionDirty || loading} onClick={handleSaveSessionDetails} type="button">
                    {loading ? "Saving..." : "Save session details"}
                  </button>
                </div>
              </div>

              <div className="workspace-subtle-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="workspace-section-label">Uploaded Runs</p>
                    <h3 className="mt-2 text-xl font-semibold">Telemetry already uploaded into this session</h3>
                  </div>
                  <span className="pill pill-neutral">{linkedUploadedSessions.length} upload{linkedUploadedSessions.length === 1 ? "" : "s"}</span>
                </div>
                {linkedUploadedSessions.length ? (
                  <div className="mt-4 grid gap-3">
                    {linkedUploadedSessions.map((sessionRecord) => (
                      <div key={sessionRecord.id} className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                          <div>
                            <div className="mb-3">
                              <label className={`pill selection-pill ${selectedUploadIds.includes(sessionRecord.id) ? "is-selected" : "pill-neutral"} cursor-pointer`}>
                                <input
                                  className="hidden"
                                  checked={selectedUploadIds.includes(sessionRecord.id)}
                                  type="checkbox"
                                  onChange={(event) => {
                                    setSelectedUploadIds((current) => (
                                      event.target.checked
                                        ? [...current, sessionRecord.id]
                                        : current.filter((id) => id !== sessionRecord.id)
                                    ));
                                  }}
                                />
                                <span className="selection-pill-marker" aria-hidden="true">OK</span>
                                <span>Select for compare</span>
                              </label>
                            </div>
                            <p className="text-lg font-semibold text-white">{sessionRecord.event_round || sessionRecord.event_name || "Uploaded session"}</p>
                            <p className="mt-1 text-sm muted">
                              {[sessionRecord.event_name, sessionRecord.session_type, sessionRecord.created_at].filter(Boolean).join(" / ")}
                            </p>
                            <div className="workflow-chip-grid mt-3">
                              <span className="pill pill-neutral">{sessionRecord.driver_count || 0} drivers</span>
                              <span className="pill pill-neutral">{sessionRecord.status || "uploaded"}</span>
                              {sessionRecord.analysis_summary?.best_lap ? (
                                <span className="pill pill-neutral">Best {formatLap(sessionRecord.analysis_summary.best_lap)}</span>
                              ) : null}
                              {sessionRecord.analysis_summary?.fastest_driver ? (
                                <span className="pill pill-neutral">{sessionRecord.analysis_summary.fastest_driver}</span>
                              ) : null}
                              {(sessionRecord.uploaded_files || []).length ? (
                                <span className="pill pill-neutral">{sessionRecord.uploaded_files.length} file{sessionRecord.uploaded_files.length === 1 ? "" : "s"}</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="profile-actions">
                            <button
                              className="workspace-ghost px-4 py-3 text-sm"
                              onClick={() => onOpenUploadedSession(sessionRecord.id)}
                              type="button"
                            >
                              Open uploaded run
                            </button>
                            <button
                              className="workspace-danger px-4 py-3 text-sm"
                              onClick={() => onDeleteUploadedSession(sessionRecord)}
                              type="button"
                            >
                              Delete upload
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-slate-950/20 p-5">
                    <p className="text-sm font-medium text-white">No uploaded runs are linked to this session yet.</p>
                    <p className="mt-2 text-sm muted">Use <span className="text-white">Upload data</span> when the drivers come in, and every upload for this planned session will show up here.</p>
                  </div>
                )}
              </div>

              {selectedUploads.length ? (
                <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="workspace-subtle-card p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="workspace-section-label">Run Comparison</p>
                        <h3 className="mt-2 text-xl font-semibold">Compare pace across the selected uploads</h3>
                      </div>
                      <span className="pill pill-neutral">{selectedUploads.length} runs</span>
                    </div>
                    <div className="mt-4 grid gap-3">
                      {topRunImprovement ? (
                        <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4">
                          <p className="text-sm font-medium text-white">What changed and what improved</p>
                          <p className="mt-2 text-sm text-slate-200">{topRunImprovement.name}: {topRunImprovement.improvementLabel}. {topRunImprovement.averageLabel}</p>
                        </div>
                      ) : null}
                      {runComparisons.map((entry) => (
                        <div key={entry.id} className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-base font-semibold text-white">{entry.name}</p>
                              <p className="mt-1 text-sm muted">{entry.createdAt}</p>
                            </div>
                            <span className={`pill ${entry.deltaToFastest <= 0 ? "" : "pill-neutral"}`}>{entry.deltaLabel}</span>
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <div className="rounded-2xl border border-white/10 bg-slate-950/20 p-3">
                              <p className="workspace-kpi-label">Best Lap</p>
                              <p className="mt-2 text-lg font-semibold text-white">{formatLap(entry.bestLap)}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-slate-950/20 p-3">
                              <p className="workspace-kpi-label">Fastest Driver</p>
                              <p className="mt-2 text-sm font-medium text-white">{entry.fastestDriver || "Unknown"}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-slate-950/20 p-3">
                              <p className="workspace-kpi-label">Average Best Lap</p>
                              <p className="mt-2 text-lg font-semibold text-white">{formatLap(entry.averageBestLap)}</p>
                            </div>
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-white/10 bg-slate-950/20 p-3">
                              <p className="workspace-kpi-label">Pace Change</p>
                              <p className="mt-2 text-sm font-medium text-white">{entry.improvementLabel}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-slate-950/20 p-3">
                              <p className="workspace-kpi-label">Setup Delta Count</p>
                              <p className="mt-2 text-sm font-medium text-white">{entry.setupChangeCount} change{entry.setupChangeCount === 1 ? "" : "s"}</p>
                              <p className="mt-1 text-xs muted">{entry.averageLabel}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="workspace-subtle-card p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="workspace-section-label">Setup Change Tracking</p>
                        <h3 className="mt-2 text-xl font-semibold">What changed between the selected runs</h3>
                      </div>
                      <span className="pill pill-neutral">{setupDeltaGroups.length} drivers changed</span>
                    </div>
                    {setupDeltaGroups.length ? (
                      <div className="mt-4 grid gap-3">
                        {setupDeltaGroups.map((group) => (
                          <div key={group.driverId} className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                            <p className="text-base font-semibold text-white">{group.driverName}</p>
                            <div className="mt-3 grid gap-2">
                              {group.changes.map((change, index) => (
                                <div key={`${group.driverId}-${change.field}-${index}`} className="rounded-xl border border-white/10 bg-slate-950/20 px-3 py-2 text-sm text-slate-200">
                                  <span className="font-medium text-white">{change.label}:</span> {change.fromValue} {"->"} {change.toValue}
                                  <span className="muted"> ({change.fromRun} to {change.toRun})</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-slate-950/20 p-5 text-sm muted">
                        Select two or more uploads to track setup deltas across the day. New uploads keep a snapshot of the planned session setup at the moment they were saved.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {setupPerformanceCorrelations.length ? (
                <div className="workspace-subtle-card p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="workspace-section-label">Setup To Performance</p>
                      <h3 className="mt-2 text-xl font-semibold">What changed, and whether it helped</h3>
                    </div>
                    <span className="pill pill-neutral">{setupPerformanceCorrelations.length} correlations</span>
                  </div>
                  <div className="mt-4 grid gap-4">
                    {setupPerformanceCorrelations.map((correlation, index) => (
                      <div key={`${correlation.driverId}-${correlation.fromRun}-${correlation.toRun}-${index}`} className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-white">{correlation.driverName}</p>
                            <p className="mt-1 text-sm muted">{correlation.fromRun} {"->"} {correlation.toRun}</p>
                          </div>
                          <span className={`pill ${correlation.pace.delta !== null && correlation.pace.delta < -0.0005 ? "" : "pill-neutral"}`}>
                            {correlation.pace.summary}
                          </span>
                        </div>
                        <div className="mt-4 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4">
                          <p className="text-sm font-medium text-white">Coach summary</p>
                          <div className="mt-3 grid gap-2">
                            {(correlation.coachingSummary || []).map((line, lineIndex) => (
                              <p key={`${correlation.driverId}-summary-${lineIndex}`} className="text-sm text-slate-100">{line}</p>
                            ))}
                          </div>
                        </div>
                        <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                          <div className="rounded-2xl border border-white/10 bg-slate-950/20 p-4">
                            <p className="workspace-kpi-label">Setup Changes</p>
                            <div className="mt-3 grid gap-2">
                              {correlation.setupChanges.map((change) => (
                                <div key={`${correlation.driverId}-${change.field}`} className="rounded-xl border border-white/10 bg-slate-950/20 px-3 py-2 text-sm text-slate-200">
                                  <span className="font-medium text-white">{change.label}:</span> {change.fromValue} {"->"} {change.toValue}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="grid gap-4">
                            <div className="rounded-2xl border border-white/10 bg-slate-950/20 p-4">
                              <p className="workspace-kpi-label">Sector Movement</p>
                              <div className="mt-3 grid gap-2 md:grid-cols-2">
                                <div>
                                  <p className="text-sm font-medium text-white">Improved sectors</p>
                                  <div className="mt-2 grid gap-2">
                                    {correlation.sectorHighlights.improved.length ? correlation.sectorHighlights.improved.map((sector) => (
                                      <div key={`${correlation.driverId}-${sector.sectorName}-improved`} className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                                        {sector.sectorName}: {Math.abs(sector.delta).toFixed(3)}s quicker
                                      </div>
                                    )) : <p className="text-sm muted">No sector gains detected.</p>}
                                  </div>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-white">Worsened sectors</p>
                                  <div className="mt-2 grid gap-2">
                                    {correlation.sectorHighlights.worsened.length ? correlation.sectorHighlights.worsened.map((sector) => (
                                      <div key={`${correlation.driverId}-${sector.sectorName}-worsened`} className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                                        {sector.sectorName}: {sector.delta.toFixed(3)}s slower
                                      </div>
                                    )) : <p className="text-sm muted">No sector losses detected.</p>}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-slate-950/20 p-4">
                              <p className="workspace-kpi-label">Corner Movement</p>
                              <div className="mt-3 grid gap-2 md:grid-cols-2">
                                <div>
                                  <p className="text-sm font-medium text-white">Quicker corners</p>
                                  <div className="mt-2 grid gap-2">
                                    {correlation.cornerHighlights.timeImproved.length ? correlation.cornerHighlights.timeImproved.map((corner) => (
                                      <div key={`${correlation.driverId}-${corner.cornerKey}-time-improved`} className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                                        {corner.cornerName}: {Math.abs(corner.cornerTimeDelta).toFixed(3)}s quicker
                                      </div>
                                    )) : <p className="text-sm muted">No corner-time gains detected.</p>}
                                  </div>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-white">Lost time / speed</p>
                                  <div className="mt-2 grid gap-2">
                                    {correlation.cornerHighlights.timeWorsened.length ? correlation.cornerHighlights.timeWorsened.map((corner) => (
                                      <div key={`${correlation.driverId}-${corner.cornerKey}-time-worsened`} className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                                        {corner.cornerName}: {corner.cornerTimeDelta.toFixed(3)}s slower
                                      </div>
                                    )) : <p className="text-sm muted">No corner-time losses detected.</p>}
                                    {correlation.cornerHighlights.exitImproved.slice(0, 1).map((corner) => (
                                      <div key={`${correlation.driverId}-${corner.cornerKey}-exit`} className="rounded-xl border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-sm text-blue-100">
                                        {corner.cornerName}: +{corner.exitSpeedDelta.toFixed(2)} km/h exit speed
                                      </div>
                                    ))}
                                    {correlation.cornerHighlights.minimumImproved.slice(0, 1).map((corner) => (
                                      <div key={`${correlation.driverId}-${corner.cornerKey}-minimum`} className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
                                        {corner.cornerName}: +{corner.minimumSpeedDelta.toFixed(2)} km/h minimum speed
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="workspace-subtle-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="workspace-section-label">Driver List</p>
                    <h3 className="mt-2 text-xl font-semibold">Drivers assigned to this session</h3>
                </div>
                <span className="pill pill-neutral">{selectedTestSession.drivers.length} drivers</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                <div>
                  <p className="text-sm font-medium text-white">Kart setup workspace</p>
                  <p className="mt-1 text-sm muted">
                    Enter the setup against each driver here, then save it to this planned session.
                  </p>
                </div>
                <div className="profile-actions">
                  <span className={`pill ${setupDirty ? "" : "pill-neutral"}`}>
                    {setupDirty ? "Unsaved setup changes" : "Setup saved"}
                  </span>
                  <button
                    className="workspace-primary px-4 py-3 text-sm text-white"
                    disabled={!setupDirty || loading}
                    onClick={handleSaveSetup}
                    type="button"
                  >
                    {loading ? "Saving setup..." : "Save setup"}
                  </button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                <div>
                  <p className="text-sm font-medium text-white">Kart setup report</p>
                  <p className="mt-1 text-sm muted">Choose which drivers to include, then open the HTML report or export a PDF setup sheet.</p>
                </div>
                <div className="profile-actions">
                  <button className="workspace-ghost px-4 py-3 text-sm" disabled={!reportDriverIds.length} onClick={openSetupReport} type="button">Open report</button>
                  <button className="workspace-primary px-4 py-3 text-sm text-white" disabled={!reportDriverIds.length || loading} onClick={exportSetupReport} type="button">Export setup PDF</button>
                </div>
              </div>
              <div className="mt-4 workflow-chip-grid">
                {selectedTestSession.drivers.map((driver) => {
                  const checked = reportDriverIds.includes(driver.id);
                  return (
                    <label key={`${driver.id}-report`} className={`pill selection-pill ${checked ? "is-selected" : "pill-neutral"} cursor-pointer`}>
                      <input
                        className="hidden"
                        checked={checked}
                        type="checkbox"
                        onChange={(event) => {
                          setReportDriverIds((current) => (
                            event.target.checked
                              ? [...current, driver.id]
                              : current.filter((id) => id !== driver.id)
                          ));
                        }}
                      />
                      <span className="selection-pill-marker" aria-hidden="true">OK</span>
                      <span>{driver.name}</span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {selectedTestSession.drivers.map((driver) => (
                  <div key={driver.id} className="workspace-subtle-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-white">{driver.name}</p>
                        <p className="mt-1 text-sm muted">{driver.class_name || "No class"}</p>
                      </div>
                      <span className="pill pill-neutral">Session-specific setup</span>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <KartSetupField label="Front Sprocket">
                        <select
                          className="workspace-field"
                          value={normalizeDriverSetup(driverSetups?.[driver.id]).front_sprocket}
                          onChange={(event) => {
                            setDriverSetups((current) => ({
                              ...current,
                              [driver.id]: {
                                ...normalizeDriverSetup(current?.[driver.id]),
                                front_sprocket: event.target.value,
                              },
                            }));
                            setSetupDirty(true);
                          }}
                        >
                          <option value="">Select front sprocket</option>
                          {FRONT_SPROCKET_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </KartSetupField>
                      <KartSetupField label="Rear Sprocket">
                        <select
                          className="workspace-field"
                          value={normalizeDriverSetup(driverSetups?.[driver.id]).rear_sprocket}
                          onChange={(event) => {
                            setDriverSetups((current) => ({
                              ...current,
                              [driver.id]: {
                                ...normalizeDriverSetup(current?.[driver.id]),
                                rear_sprocket: event.target.value,
                              },
                            }));
                            setSetupDirty(true);
                          }}
                        >
                          <option value="">Select rear sprocket</option>
                          {REAR_SPROCKET_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </KartSetupField>
                      <KartSetupField label="Carb Jet">
                        <select
                          className="workspace-field"
                          value={normalizeDriverSetup(driverSetups?.[driver.id]).carb_jet}
                          onChange={(event) => {
                            setDriverSetups((current) => ({
                              ...current,
                              [driver.id]: {
                                ...normalizeDriverSetup(current?.[driver.id]),
                                carb_jet: event.target.value,
                              },
                            }));
                            setSetupDirty(true);
                          }}
                        >
                          <option value="">Select carb jet</option>
                          {CARB_JET_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </KartSetupField>
                      <KartSetupField label="Axle Length">
                        <select
                          className="workspace-field"
                          value={normalizeDriverSetup(driverSetups?.[driver.id]).axle_length}
                          onChange={(event) => {
                            setDriverSetups((current) => ({
                              ...current,
                              [driver.id]: {
                                ...normalizeDriverSetup(current?.[driver.id]),
                                axle_length: event.target.value,
                              },
                            }));
                            setSetupDirty(true);
                          }}
                        >
                          <option value="">Select axle length</option>
                          {AXLE_LENGTH_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </KartSetupField>
                      <KartSetupField label="Axle Type">
                        <input
                          className="workspace-field"
                          placeholder="Enter axle type"
                          value={normalizeDriverSetup(driverSetups?.[driver.id]).axle_type}
                          onChange={(event) => {
                            setDriverSetups((current) => ({
                              ...current,
                              [driver.id]: {
                                ...normalizeDriverSetup(current?.[driver.id]),
                                axle_type: event.target.value,
                              },
                            }));
                            setSetupDirty(true);
                          }}
                        />
                      </KartSetupField>
                      <KartSetupField label="Tyre Type">
                        <select
                          className="workspace-field"
                          value={normalizeDriverSetup(driverSetups?.[driver.id]).tyre_type}
                          onChange={(event) => {
                            setDriverSetups((current) => ({
                              ...current,
                              [driver.id]: {
                                ...normalizeDriverSetup(current?.[driver.id]),
                                tyre_type: event.target.value,
                              },
                            }));
                            setSetupDirty(true);
                          }}
                        >
                          <option value="">Select tyre type</option>
                          {TYRE_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </KartSetupField>
                      <KartSetupField label="Torsion Bar Type">
                        <select
                          className="workspace-field"
                          value={normalizeDriverSetup(driverSetups?.[driver.id]).torsion_bar_type}
                          onChange={(event) => {
                            setDriverSetups((current) => ({
                              ...current,
                              [driver.id]: {
                                ...normalizeDriverSetup(current?.[driver.id]),
                                torsion_bar_type: event.target.value,
                              },
                            }));
                            setSetupDirty(true);
                          }}
                        >
                          <option value="">Select torsion bar type</option>
                          {TORSION_BAR_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </KartSetupField>
                      <KartSetupField label="Caster Type">
                        <select
                          className="workspace-field"
                          value={normalizeDriverSetup(driverSetups?.[driver.id]).caster_type}
                          onChange={(event) => {
                            setDriverSetups((current) => ({
                              ...current,
                              [driver.id]: {
                                ...normalizeDriverSetup(current?.[driver.id]),
                                caster_type: event.target.value,
                              },
                            }));
                            setSetupDirty(true);
                          }}
                        >
                          <option value="">Select caster type</option>
                          {CASTER_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </KartSetupField>
                      <KartSetupField label="Ride Height">
                        <select
                          className="workspace-field"
                          value={normalizeDriverSetup(driverSetups?.[driver.id]).ride_height}
                          onChange={(event) => {
                            setDriverSetups((current) => ({
                              ...current,
                              [driver.id]: {
                                ...normalizeDriverSetup(current?.[driver.id]),
                                ride_height: event.target.value,
                              },
                            }));
                            setSetupDirty(true);
                          }}
                        >
                          <option value="">Select ride height</option>
                          {RIDE_HEIGHT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </KartSetupField>
                      <KartSetupField label="Front Tyre Pressure">
                        <input
                          className="workspace-field"
                          inputMode="decimal"
                          placeholder="Enter front tyre pressure"
                          type="number"
                          step="0.1"
                          value={normalizeDriverSetup(driverSetups?.[driver.id]).front_tyre_pressure}
                          onChange={(event) => {
                            setDriverSetups((current) => ({
                              ...current,
                              [driver.id]: {
                                ...normalizeDriverSetup(current?.[driver.id]),
                                front_tyre_pressure: event.target.value,
                              },
                            }));
                            setSetupDirty(true);
                          }}
                        />
                      </KartSetupField>
                      <KartSetupField label="Rear Tyre Pressure">
                        <input
                          className="workspace-field"
                          inputMode="decimal"
                          placeholder="Enter rear tyre pressure"
                          type="number"
                          step="0.1"
                          value={normalizeDriverSetup(driverSetups?.[driver.id]).rear_tyre_pressure}
                          onChange={(event) => {
                            setDriverSetups((current) => ({
                              ...current,
                              [driver.id]: {
                                ...normalizeDriverSetup(current?.[driver.id]),
                                rear_tyre_pressure: event.target.value,
                              },
                            }));
                            setSetupDirty(true);
                          }}
                        />
                      </KartSetupField>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                <div>
                  <p className="text-sm font-medium text-white">Finished entering setup?</p>
                  <p className="mt-1 text-sm muted">
                    Save the current setup values before moving on to uploads or generating the setup sheet.
                  </p>
                </div>
                <div className="profile-actions">
                  <span className={`pill ${setupDirty ? "" : "pill-neutral"}`}>
                    {setupDirty ? "Unsaved setup changes" : "Setup saved"}
                  </span>
                  <button
                    className="workspace-primary px-4 py-3 text-sm text-white"
                    disabled={!setupDirty || loading}
                    onClick={handleSaveSetup}
                    type="button"
                  >
                    {loading ? "Saving setup..." : "Save setup"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="workspace-subtle-card mt-6 p-6 text-sm muted">No planned session selected yet.</div>
        )}
      </article>
    </div>
  );
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

function ForecastMetric({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
      <p className="text-xs muted">{label}</p>
      <p className="mt-1 font-medium text-white">{value || "-"}</p>
    </div>
  );
}

function WeatherForecastVisual({ forecast, forecastState }) {
  const icon = getForecastIcon(forecast);
  const rainValue = Number(forecast?.rain_probability_pct || 0);
  const windValue = Number(forecast?.wind_kph || 0);
  const minTemp = Number.isFinite(Number(forecast?.temperature_min_c)) ? Number(forecast.temperature_min_c) : null;
  const maxTemp = Number.isFinite(Number(forecast?.temperature_max_c)) ? Number(forecast.temperature_max_c) : null;
  const tempSpread = minTemp != null && maxTemp != null ? Math.max(maxTemp - minTemp, 0) : 0;
  const temperatureFill = Math.max(18, Math.min(100, ((tempSpread + 4) / 18) * 100));

  return (
    <div className="weather-visual-card mt-4">
      <div className="weather-visual-hero">
        <div className="weather-visual-icon" aria-hidden="true">{icon}</div>
        <div>
          <p className="weather-visual-title">{forecast?.weather_label || "Forecast snapshot"}</p>
          <p className="weather-visual-summary">{forecast?.summary || "No forecast summary available."}</p>
        </div>
      </div>
      <div className="weather-visual-grid">
        <WeatherGauge label="Temperature band" value={formatTemperatureRange(forecast)} fill={temperatureFill} accent="temperature" />
        <WeatherGauge label="Rain chance" value={formatPercent(forecast?.rain_probability_pct)} fill={rainValue} accent="rain" />
        <WeatherGauge label="Wind" value={formatWind(forecast?.wind_kph)} fill={Math.min(100, windValue * 2.5)} accent="wind" />
        <div className={`weather-visual-status ${forecastState?.tone === "warn" ? "is-warn" : ""}`}>
          <p className="weather-visual-status-label">Readiness</p>
          <p className="weather-visual-status-value">{forecastState?.label || "Unknown"}</p>
        </div>
      </div>
    </div>
  );
}

function HourlyForecastTimeline({ forecast }) {
  const points = Array.isArray(forecast?.hourly_forecast) ? forecast.hourly_forecast : [];
  if (!points.length) {
    return null;
  }
  const selectedPoints = selectSessionWindowPoints(points, forecast);
  const hasSessionWindow = Boolean(String(forecast?.session_start_time || "").trim() || String(forecast?.session_end_time || "").trim());
  const filtered = hasSessionWindow ? selectedPoints : selectedPoints.filter((_, index) => index % 2 === 0);
  return (
    <div className="hourly-forecast-card mt-4">
      <div className="hourly-forecast-head">
        <div>
          <p className="workspace-section-label">Hourly Outlook</p>
          <h4 className="mt-2 text-lg font-semibold">How the session day is likely to evolve</h4>
        </div>
        <span className="pill pill-neutral">{filtered.length} checkpoints</span>
      </div>
      <div className="hourly-forecast-strip">
        {filtered.map((point) => (
          <div key={point.time} className={`hourly-forecast-point ${point.inSessionWindow ? "is-focus" : ""}`}>
            <p className="hourly-forecast-time">{point.hour}</p>
            <div className="hourly-forecast-icon" aria-hidden="true">{getForecastIcon(point)}</div>
            <p className="hourly-forecast-temp">{formatPointTemperature(point.temperature_c)}</p>
            <p className="hourly-forecast-rain">Rain {formatPercent(point.rain_probability_pct)}</p>
            <p className="hourly-forecast-wind">Wind {formatWind(point.wind_kph)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeatherGauge({ label, value, fill, accent }) {
  return (
    <div className={`weather-gauge weather-gauge-${accent}`}>
      <div className="weather-gauge-head">
        <span className="weather-gauge-label">{label}</span>
        <span className="weather-gauge-value">{value || "-"}</span>
      </div>
      <div className="weather-gauge-track">
        <span className="weather-gauge-fill" style={{ width: `${Math.max(0, Math.min(100, fill || 0))}%` }} />
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

function formatPointTemperature(value) {
  return value == null ? "-" : `${Number(value).toFixed(0)}C`;
}

function selectSessionWindowPoints(points, forecast) {
  const startTime = String(forecast?.session_start_time || "").trim();
  const endTime = String(forecast?.session_end_time || "").trim();
  if (!startTime && !endTime) {
    return points;
  }
  const withWindow = points.map((point) => ({
    ...point,
    inSessionWindow: isPointInSessionWindow(point.hour, startTime, endTime),
  }));
  const focused = withWindow.filter((point) => point.inSessionWindow);
  if (focused.length) {
    const startIndex = withWindow.findIndex((point) => point.inSessionWindow);
    const endIndex = withWindow.length - 1 - [...withWindow].reverse().findIndex((point) => point.inSessionWindow);
    return withWindow.slice(Math.max(0, startIndex - 1), Math.min(withWindow.length, endIndex + 2));
  }
  const fallbackIndex = findNearestWindowPointIndex(withWindow, startTime, endTime);
  if (fallbackIndex >= 0) {
    return withWindow.slice(Math.max(0, fallbackIndex - 1), Math.min(withWindow.length, fallbackIndex + 2));
  }
  return withWindow.slice(0, Math.min(withWindow.length, 3));
}

function isPointInSessionWindow(hour, startTime, endTime) {
  const hourMinutes = toMinutes(hour);
  const startMinutes = toMinutes(startTime);
  const endMinutes = toMinutes(endTime);
  if (hourMinutes == null) return false;
  if (startMinutes == null && endMinutes == null) return false;
  const bucketStart = hourMinutes;
  const bucketEnd = hourMinutes + 60;
  if (startMinutes != null && endMinutes != null) {
    return startMinutes < bucketEnd && endMinutes >= bucketStart;
  }
  if (startMinutes != null) return bucketEnd > startMinutes;
  return bucketStart <= endMinutes;
}

function toMinutes(value) {
  if (!value || !String(value).includes(":")) return null;
  const [hour, minute] = String(value).split(":").map((item) => Number(item));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function findNearestWindowPointIndex(points, startTime, endTime) {
  const startMinutes = toMinutes(startTime);
  const endMinutes = toMinutes(endTime);
  const targetMinutes = startMinutes != null && endMinutes != null
    ? (startMinutes + endMinutes) / 2
    : startMinutes != null
      ? startMinutes
      : endMinutes != null
        ? endMinutes
        : null;
  if (targetMinutes == null) return -1;
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  points.forEach((point, index) => {
    const pointMinutes = toMinutes(point.hour);
    if (pointMinutes == null) return;
    const distance = Math.abs(pointMinutes - targetMinutes);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function formatSessionWindow(session = {}) {
  const start = session.start_time || "";
  const end = session.end_time || "";
  if (start && end) return `${start} to ${end}`;
  if (start) return `Starts ${start}`;
  if (end) return `Until ${end}`;
  return "Not set";
}

function formatTemperatureRange(forecast = {}) {
  const min = forecast.temperature_min_c;
  const max = forecast.temperature_max_c;
  if (min == null && max == null) return "-";
  if (min == null) return `${max.toFixed(0)}C`;
  if (max == null) return `${min.toFixed(0)}C`;
  return `${min.toFixed(0)}C to ${max.toFixed(0)}C`;
}

function formatPercent(value) {
  return value == null ? "-" : `${Number(value).toFixed(0)}%`;
}

function formatWind(value) {
  return value == null ? "-" : `${Number(value).toFixed(0)} km/h`;
}

function formatDateTimeLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
