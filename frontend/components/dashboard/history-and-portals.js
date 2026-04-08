import { useEffect, useMemo, useState } from "react";
import { SavedReportsPanel } from "@/components/dashboard/analysis-panels";
import { DistancePlaybackChart, CustomLapMetricChart, LapMetricBarChart } from "@/components/dashboard/telemetry-charts";
import { convertSpeedValue, formatMetric, formatSpeed, getSpeedUnitLabel, normalizeSpeedUnit } from "@/lib/dashboard-utils";
import { buildGoogleStaticMapUrl, findTrackByName, getStaticMapViewport, getTrackMapCalibration, projectTracePointsToStage, projectTraceToStage } from "@/lib/tracks";

function buildSetupSummary(setup = {}) {
  return [
    ["Front Sprocket", setup.front_sprocket || "Not set"],
    ["Rear Sprocket", setup.rear_sprocket || "Not set"],
    ["Carb Jet", setup.carb_jet || "Not set"],
    ["Axle Length", setup.axle_length || "Not set"],
    ["Axle Type", setup.axle_type || "Not set"],
    ["Front Tyre Pressure", setup.front_tyre_pressure === "" || setup.front_tyre_pressure == null ? "Not set" : `${setup.front_tyre_pressure}`],
    ["Rear Tyre Pressure", setup.rear_tyre_pressure === "" || setup.rear_tyre_pressure == null ? "Not set" : `${setup.rear_tyre_pressure}`],
    ["Torsion Bar Type", setup.torsion_bar_type || "Not set"],
    ["Caster Type", setup.caster_type || "Not set"],
    ["Ride Height", setup.ride_height || "Not set"],
  ];
}

function setupHasValues(setup = {}) {
  return Object.values(setup || {}).some((value) => value !== "" && value != null);
}

function formatPortalTimestamp(value) {
  if (!value) return "No date yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildSetupReportHref(testSessionId, driverIds = []) {
  if (!testSessionId || !driverIds.length) return "";
  const params = new URLSearchParams({
    testSessionId,
    reportType: "setup",
    driverIds: driverIds.join(","),
  });
  return `/report-template?${params.toString()}`;
}

function openSetupReportWindow(testSessionId, driverIds = []) {
  const href = buildSetupReportHref(testSessionId, driverIds);
  if (!href || typeof window === "undefined") return;
  window.open(href, "_blank", "noopener,noreferrer");
}

function formatDisplaySpeed(value, speedUnit = "kmh", decimals = 2) {
  return formatSpeed(value, speedUnit, decimals);
}

function convertDisplaySpeed(value, speedUnit = "kmh") {
  return convertSpeedValue(value, speedUnit);
}

function getDisplaySpeedUnit(speedUnit = "kmh") {
  return getSpeedUnitLabel(speedUnit);
}

function portalReportAudienceLabel(audience) {
  if (audience === "driver") return "Driver debrief";
  if (audience === "parent") return "Parent summary";
  return "Coach report";
}

function portalPublishedLabel(entry) {
  if (entry.visible_to_parent) return "Shared with parents";
  if (entry.visible_to_driver) return "Shared with drivers";
  if (entry.status === "reviewed") return "Reviewed internally";
  if (entry.status === "draft") return "Draft report";
  return "Published report";
}

function portalVisibilityBadges(entry) {
  const badges = [entry.status || "draft"];
  if (entry.visible_to_driver) badges.push("Driver visible");
  if (entry.visible_to_parent) badges.push("Parent visible");
  if (!entry.visible_to_driver && !entry.visible_to_parent && entry.status === "reviewed") {
    badges.push("Internal only");
  }
  return badges;
}

function sessionPublishConfig(audience) {
  if (audience === "driver") {
    return {
      title: "Driver debrief",
      publishLabel: "Publish to driver",
      unpublishLabel: "Unpublish driver report",
      publishPayload: { status: "published", visible_to_driver: true, visible_to_parent: false },
      unpublishPayload: { status: "reviewed", visible_to_driver: false, visible_to_parent: false },
    };
  }
  if (audience === "parent") {
    return {
      title: "Parent summary",
      publishLabel: "Publish to parent",
      unpublishLabel: "Unpublish parent report",
      publishPayload: { status: "published", visible_to_driver: false, visible_to_parent: true },
      unpublishPayload: { status: "reviewed", visible_to_driver: false, visible_to_parent: false },
    };
  }
  return {
    title: "Coach report",
    publishLabel: "Mark reviewed",
    unpublishLabel: "Return to draft",
    publishPayload: { status: "reviewed", visible_to_driver: false, visible_to_parent: false },
    unpublishPayload: { status: "draft", visible_to_driver: false, visible_to_parent: false },
  };
}

function isNewPortalItem(createdAt, seenAt) {
  if (!createdAt) return false;
  if (!seenAt) return true;
  return new Date(createdAt).getTime() > new Date(seenAt).getTime();
}

function renderPortalReportCard(entry, onOpenSession, lastSeenReportAt = "") {
  const isNew = isNewPortalItem(entry.created_at, lastSeenReportAt);
  return (
    <div key={`${entry.id}-${entry.created_at}`} className="workspace-subtle-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{entry.report.title || portalReportAudienceLabel(entry.audience)}</p>
          <p className="text-sm muted">{portalPublishedLabel(entry)} / {formatPortalTimestamp(entry.created_at)}</p>
        </div>
        <div className="chip-row">
          {isNew ? <span className="pill">New</span> : null}
          <span className="badge">{entry.report.confidence_rating}</span>
          {portalVisibilityBadges(entry).map((badge) => (
            <span key={`${entry.id}-${badge}`} className="pill pill-neutral">{badge}</span>
          ))}
        </div>
      </div>
      <p className="mt-3 text-sm">{entry.report.overall_summary}</p>
      {(entry.report.action_points || []).length ? (
        <ul className="mt-3 space-y-1 text-sm muted">
          {entry.report.action_points.slice(0, 3).map((item) => <li key={`${entry.id}-${item}`}>- {item}</li>)}
        </ul>
      ) : null}
      <div className="portal-action-row mt-4">
        <button className="workspace-ghost px-4 py-3 text-sm" onClick={() => onOpenSession(entry.session_id)} type="button">
          Open session
        </button>
      </div>
    </div>
  );
}

export function HistoryPanel({ sessions, selectedSessionId, selectedSessionDetail, onSelectSession, onOpenSession, onDeleteSession }) {
  const latestSession = sessions[0] || null;
  return (
    <div className="workspace-page">
      <section className="workspace-hero workspace-hero-premium">
        <div className="workspace-hero-premium-grid">
          <div className="workspace-hero-copy max-w-3xl">
            <p className="workspace-section-label">Session Library</p>
            <h2 className="workspace-hero-title">Use History like a debrief archive, not a record list.</h2>
            <p className="workspace-hero-text">Jump into the latest uploaded run, reopen saved reports, and move back into detailed session analysis without digging through operational tables.</p>
          </div>
          <div className="workspace-hero-grid">
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Saved sessions</p>
              <p className="workspace-kpi-value">{sessions.length}</p>
              <p className="workspace-kpi-detail">Uploaded sessions available in the archive.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Latest upload</p>
              <p className="workspace-kpi-value text-[1.1rem]">{latestSession?.event_round || "None yet"}</p>
              <p className="workspace-kpi-detail">{latestSession ? latestSession.created_at : "Upload your first session to start the archive."}</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Saved reports</p>
              <p className="workspace-kpi-value">{selectedSessionDetail?.reports?.length || 0}</p>
              <p className="workspace-kpi-detail">Reports linked to the currently selected upload.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="results-command-grid">
        <article className="app-panel results-command-card p-5">
          <p className="workspace-section-label">Latest Debrief</p>
          <h3 className="mt-2 text-2xl font-semibold">{latestSession?.event_round || "No session selected yet"}</h3>
          <p className="mt-3 text-sm muted">
            {latestSession
              ? `${latestSession.event_name} / ${latestSession.session_type}. Reopen it from the archive list to continue with comparison, corner analysis, or publishing.`
              : "As soon as a session is uploaded it will become the top of the archive and the easiest place to resume work."}
          </p>
        </article>
        <article className="app-panel results-command-card p-5">
          <p className="workspace-section-label">Archive Use</p>
          <h3 className="mt-2 text-2xl font-semibold">How to work from History</h3>
          <div className="home-steps mt-4">
            {[
              "Pick the uploaded session from the archive list",
              "Check the right-hand debrief summary and saved reports",
              "Open the full session view when you want detailed analysis",
              "Return here to compare another upload quickly"
            ].map((item, index) => (
              <div key={item} className="home-step">
                <span className="home-step-index">{index + 1}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="app-panel p-5">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="workspace-section-label">History</p>
              <h3 className="mt-2 text-2xl font-semibold">Recent sessions</h3>
            </div>
            <span className="pill pill-neutral">{sessions.length} items</span>
          </div>
          <div className="library-list mt-5">
            {sessions.length ? sessions.map((session) => (
              <article key={session.id} className={`library-item ${selectedSessionId === session.id ? "active" : ""}`}>
                <button
                  className="library-item-main"
                  onClick={() => onSelectSession(session.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{session.event_round || session.name}</p>
                      <p className="mt-1 text-sm muted">{session.event_name} / {session.session_type}</p>
                    </div>
                    <div className="chip-row">
                      <span className="pill">{session.status || "uploaded"}</span>
                      <span className="pill pill-neutral">{session.analysis?.drivers?.length || session.driver_count || 0} drivers</span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs muted">{session.created_at}</p>
                </button>
                <div className="library-item-actions">
                  <button
                    className="workspace-ghost px-3 py-2 text-sm font-medium"
                    onClick={() => onOpenSession(session.id)}
                    type="button"
                  >
                    Open
                  </button>
                  <button
                    className="workspace-danger px-3 py-2 text-sm font-medium"
                    onClick={() => onDeleteSession?.(session)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </article>
            )) : <p className="muted">No saved sessions yet.</p>}
          </div>
        </article>
        <article className="app-panel p-5">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="workspace-section-label">Session Detail</p>
              <h3 className="mt-2 text-2xl font-semibold">{selectedSessionDetail?.session ? selectedSessionDetail.session.event_round : "Open a session"}</h3>
            </div>
            {selectedSessionDetail?.reports?.length ? <span className="pill">{selectedSessionDetail.reports.length} saved reports</span> : null}
          </div>
          {selectedSessionDetail?.session ? (
            <div className="detail-stack mt-5">
              <div className="workspace-subtle-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold">{selectedSessionDetail.session.event_round}</h3>
                    <p className="mt-1 text-sm muted">
                      {selectedSessionDetail.session.event_name} / {selectedSessionDetail.session.session_type} / {selectedSessionDetail.session.created_at}
                    </p>
                  </div>
                  <div className="workspace-action-cluster">
                    <button
                      className="workspace-ghost px-4 py-2 text-sm font-medium"
                      onClick={() => onOpenSession(selectedSessionDetail.session.id)}
                      type="button"
                    >
                      Open session
                    </button>
                    <button
                      className="workspace-danger px-4 py-2 text-sm font-medium"
                      onClick={() => onDeleteSession?.(selectedSessionDetail.session)}
                      type="button"
                    >
                      Delete uploaded data
                    </button>
                  </div>
                </div>
              </div>
              <SavedReportsPanel reports={selectedSessionDetail.reports} />
            </div>
          ) : <p className="mt-4 muted">Select a saved session to open the detail view.</p>}
        </article>
      </div>
    </div>
  );
}

export function DriverPortalPanel({ portal, selectedSessionDetail, lastSeenSessionAt = "", lastSeenReportAt = "", onOpenSession, speedUnit = "kmh" }) {
  if (!portal) {
    return (
      <article className="app-panel p-5">
        <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Driver Portal</p>
        <p className="mt-4 muted">No driver portal data loaded yet.</p>
      </article>
    );
  }

  const latestSession = portal.sessions?.[0] || null;
  const latestReport = portal.reports?.[0] || null;
  const sessionsWithSetup = (portal.sessions || []).filter((session) => setupHasValues(session.setup));
  const whatsNew = [];

  if (latestReport) {
    whatsNew.push({
      title: "Fresh coaching feedback",
      detail: `${latestReport.report.canonical_driver_name || latestReport.report.driver_name || "Your driver"} has a new ${latestReport.audience} report from ${formatPortalTimestamp(latestReport.created_at)}.`,
    });
  }
  if (latestSession) {
    whatsNew.push({
      title: "Latest uploaded run",
      detail: `${latestSession.event_round} is the newest uploaded session in your portal, saved ${formatPortalTimestamp(latestSession.created_at)}.`,
    });
  }
  if (sessionsWithSetup.length) {
    whatsNew.push({
      title: "Setup sheets available",
      detail: `${sessionsWithSetup.length} uploaded session${sessionsWithSetup.length === 1 ? "" : "s"} include saved kart setup you can reopen as a setup sheet.`,
    });
  }

  return (
    <div className="grid gap-5">
      <section className="portal-home-grid">
        <article className="app-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <p className="workspace-section-label">Driver Portal</p>
              <h2 className="mt-2 text-3xl font-semibold">{portal.driver?.name || "Driver portal"}</h2>
              <p className="mt-2 text-sm muted">Everything most relevant to your driving day is surfaced here first, so you can jump into the newest run or latest feedback without digging.</p>
            </div>
            <div className="chip-row">
              <span className="pill">{portal.sessions.length} sessions</span>
              <span className="pill pill-neutral">{portal.reports.length} published reports</span>
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Latest Session</p>
              <p className="workspace-kpi-value text-[1.1rem]">{latestSession?.event_round || "No uploads yet"}</p>
              <p className="workspace-kpi-detail">{latestSession ? formatPortalTimestamp(latestSession.created_at) : "As soon as a session is uploaded it will appear here."}</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Latest Report</p>
              <p className="workspace-kpi-value text-[1.1rem]">{latestReport ? portalReportAudienceLabel(latestReport.audience) : "No feedback yet"}</p>
              <p className="workspace-kpi-detail">{latestReport ? `${portalPublishedLabel(latestReport)} / ${formatPortalTimestamp(latestReport.created_at)}` : "Shared feedback will appear here once published."}</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Setup Sheets</p>
              <p className="workspace-kpi-value text-[1.1rem]">{sessionsWithSetup.length}</p>
              <p className="workspace-kpi-detail">Uploaded sessions with saved setup available to reopen.</p>
            </div>
          </div>
        </article>
        <article className="app-panel p-5">
          <p className="workspace-section-label">What&apos;s New</p>
          <div className="mt-4 grid gap-3">
            {whatsNew.length ? whatsNew.map((item) => (
              <div key={item.title} className="workspace-subtle-card p-4">
                <p className="font-medium">{item.title}</p>
                <p className="mt-2 text-sm muted">{item.detail}</p>
              </div>
            )) : (
              <div className="workspace-subtle-card p-4">
                <p className="font-medium">Portal ready</p>
                <p className="mt-2 text-sm muted">Once uploads and reports are shared to your portal, the latest activity will appear here.</p>
              </div>
            )}
            {latestSession ? (
              <div className="portal-action-row">
                <button className="workspace-primary px-4 py-3 text-sm text-white" onClick={() => onOpenSession(latestSession.id)} type="button">
                  Open latest session
                </button>
                {latestSession.test_session_id && setupHasValues(latestSession.setup) ? (
                  <button
                    className="workspace-ghost px-4 py-3 text-sm"
                    onClick={() => openSetupReportWindow(latestSession.test_session_id, [portal.driver?.id])}
                    type="button"
                  >
                    Open setup sheet
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </article>
      </section>
      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
      <article className="app-panel p-5">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="workspace-section-label">My Sessions</p>
            <h3 className="mt-2 text-2xl font-semibold">Latest runs first</h3>
          </div>
          <span className="pill">{portal.sessions.length} sessions</span>
        </div>
        <div className="library-list mt-5">
          {portal.sessions.map((session) => (
            <button key={session.id} className="library-item" onClick={() => onOpenSession(session.id)} type="button">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{session.event_round}</p>
                  <p className="mt-1 text-sm muted">{session.event_name} / {session.session_type}</p>
                </div>
                <div className="chip-row">
                  {isNewPortalItem(session.created_at, lastSeenSessionAt) ? <span className="pill">New</span> : null}
                  <span className="pill pill-neutral">{formatPortalTimestamp(session.created_at)}</span>
                  {setupHasValues(session.setup) ? <span className="pill">Setup saved</span> : null}
                </div>
              </div>
              {session.driver_analysis ? (
                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <PortalMetric label="Best Lap" value={formatMetric(session.driver_analysis.best_lap)} />
                  <PortalMetric label="Rank" value={session.driver_analysis.session_rank} />
                  <PortalMetric label="Delta" value={formatMetric(session.driver_analysis.lap_delta_to_fastest)} />
                  <PortalMetric label={`Top Speed (${getDisplaySpeedUnit(speedUnit)})`} value={formatDisplaySpeed(session.driver_analysis.top_speed, speedUnit)} />
                </div>
              ) : null}
              {setupHasValues(session.setup) ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {buildSetupSummary(session.setup).slice(0, 4).map(([label, value]) => (
                    <span key={label} className="pill pill-neutral">{label}: {value}</span>
                  ))}
                </div>
              ) : null}
            </button>
          ))}
        </div>
      </article>
      <article className="app-panel p-5">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="workspace-section-label">My Feedback</p>
            <h3 className="mt-2 text-2xl font-semibold">Latest coaching notes</h3>
          </div>
          <span className="pill pill-neutral">{portal.reports.length} reports</span>
        </div>
        <div className="mt-4 grid gap-4">
          {portal.reports.length ? portal.reports.slice(0, 2).map((entry) => renderPortalReportCard(entry, onOpenSession, lastSeenReportAt)) : <p className="muted">No feedback has been generated for this driver yet.</p>}
          {selectedSessionDetail?.session ? (
            <div className="workspace-subtle-card p-4">
              <p className="text-sm font-medium">Latest opened session</p>
              <p className="mt-2 text-sm muted">{selectedSessionDetail.session.event_round}</p>
            </div>
          ) : null}
        </div>
      </article>
      </div>
      <article className="app-panel p-5">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="workspace-section-label">Published Reports</p>
            <h3 className="mt-2 text-2xl font-semibold">Report shelf</h3>
          </div>
          <span className="pill pill-neutral">{portal.reports.length} available</span>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {portal.reports.length ? portal.reports.map((entry) => renderPortalReportCard(entry, onOpenSession, lastSeenReportAt)) : (
            <div className="workspace-subtle-card p-5">
              <p className="font-medium">No published reports yet</p>
              <p className="mt-2 text-sm muted">When a debrief or summary is published for this driver, it will appear here in one place.</p>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

export function ParentPortalPanel({ portal, lastSeenSessionAt = "", lastSeenReportAt = "", onOpenSession, speedUnit = "kmh" }) {
  if (!portal) {
    return (
      <article className="app-panel p-5">
        <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Parent Portal</p>
        <p className="mt-4 muted">No parent portal data loaded yet.</p>
      </article>
    );
  }

  const allSessions = (portal.drivers || [])
    .flatMap((entry) => (entry.sessions || []).map((session) => ({ ...session, driver: entry.driver })))
    .sort((left, right) => `${right.created_at || ""}`.localeCompare(`${left.created_at || ""}`));
  const allReports = (portal.drivers || [])
    .flatMap((entry) => (entry.reports || []).map((report) => ({ ...report, driver: entry.driver })))
    .sort((left, right) => `${right.created_at || ""}`.localeCompare(`${left.created_at || ""}`));
  const latestSession = allSessions[0] || null;
  const latestReport = allReports[0] || null;
  const setupSheetCount = allSessions.filter((session) => setupHasValues(session.setup)).length;
  const needsAttentionCount = (portal.drivers || []).filter((entry) => !(entry.reports || []).length).length;

  return (
    <div className="grid gap-5">
      <section className="portal-home-grid">
        <article className="app-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <p className="workspace-section-label">Parent Portal</p>
              <h2 className="mt-2 text-3xl font-semibold">{portal.account?.name || "Parent portal"}</h2>
              <p className="mt-2 text-sm muted">Latest uploads, shared feedback, and available setup sheets are surfaced first so you can see what changed without opening every session individually.</p>
            </div>
            <div className="chip-row">
              <span className="pill">{portal.drivers?.length || 0} drivers</span>
              <span className="pill pill-neutral">{allReports.length} published reports</span>
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Latest Session</p>
              <p className="workspace-kpi-value text-[1.1rem]">{latestSession?.event_round || "No uploads yet"}</p>
              <p className="workspace-kpi-detail">{latestSession ? `${latestSession.driver?.name} - ${formatPortalTimestamp(latestSession.created_at)}` : "The newest uploaded run will appear here."}</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Latest Report</p>
              <p className="workspace-kpi-value text-[1.1rem]">{latestReport?.driver?.name || "Nothing shared yet"}</p>
              <p className="workspace-kpi-detail">{latestReport ? `${portalPublishedLabel(latestReport)} / ${formatPortalTimestamp(latestReport.created_at)}` : "Shared driver reports will appear here."}</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Setup Sheets</p>
              <p className="workspace-kpi-value text-[1.1rem]">{setupSheetCount}</p>
              <p className="workspace-kpi-detail">Uploaded runs with setup sheets available to reopen.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">What&apos;s Missing</p>
              <p className="workspace-kpi-value text-[1.1rem]">{needsAttentionCount}</p>
              <p className="workspace-kpi-detail">Assigned drivers without a shared report yet.</p>
            </div>
          </div>
        </article>
        <article className="app-panel p-5">
          <p className="workspace-section-label">What&apos;s New</p>
          <div className="mt-4 grid gap-3">
            <div className="workspace-subtle-card p-4">
              <p className="font-medium">Latest session uploaded</p>
              <p className="mt-2 text-sm muted">
                {latestSession
                  ? `${latestSession.driver?.name} most recently ran ${latestSession.event_round} on ${formatPortalTimestamp(latestSession.created_at)}.`
                  : "No sessions have been uploaded to this portal yet."}
              </p>
            </div>
            <div className="workspace-subtle-card p-4">
              <p className="font-medium">Latest report shared</p>
              <p className="mt-2 text-sm muted">
                {latestReport
                  ? `${latestReport.driver?.name} has a new ${portalReportAudienceLabel(latestReport.audience).toLowerCase()} shared from ${formatPortalTimestamp(latestReport.created_at)}.`
                  : "No reports have been shared yet."}
              </p>
            </div>
            {latestSession ? (
              <div className="portal-action-row">
                <button className="workspace-primary px-4 py-3 text-sm text-white" onClick={() => onOpenSession(latestSession.id)} type="button">
                  Open latest session
                </button>
                {latestSession.test_session_id && setupHasValues(latestSession.setup) ? (
                  <button
                    className="workspace-ghost px-4 py-3 text-sm"
                    onClick={() => openSetupReportWindow(latestSession.test_session_id, [latestSession.driver?.id])}
                    type="button"
                  >
                    Open latest setup sheet
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </article>
      </section>
      <article className="app-panel p-5">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="workspace-section-label">Published Reports</p>
            <h3 className="mt-2 text-2xl font-semibold">Family report shelf</h3>
          </div>
          <span className="pill pill-neutral">{allReports.length} available</span>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {allReports.length ? allReports.map((reportEntry) => (
            <div key={`${reportEntry.id}-${reportEntry.created_at}-${reportEntry.driver?.id || "driver"}`} className="workspace-subtle-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{reportEntry.driver?.name} - {reportEntry.report.title || portalReportAudienceLabel(reportEntry.audience)}</p>
                    <p className="text-sm muted">{portalPublishedLabel(reportEntry)} / {formatPortalTimestamp(reportEntry.created_at)}</p>
                  </div>
                <div className="chip-row">
                  {isNewPortalItem(reportEntry.created_at, lastSeenReportAt) ? <span className="pill">New</span> : null}
                  <span className="badge">{reportEntry.report.confidence_rating}</span>
                </div>
                </div>
              <p className="mt-3 text-sm">{reportEntry.report.overall_summary}</p>
              {(reportEntry.report.action_points || []).length ? (
                <ul className="mt-3 space-y-1 text-sm muted">
                  {reportEntry.report.action_points.slice(0, 3).map((item) => <li key={`${reportEntry.id}-${item}`}>- {item}</li>)}
                </ul>
              ) : null}
              <div className="portal-action-row mt-4">
                <button className="workspace-ghost px-4 py-3 text-sm" onClick={() => onOpenSession(reportEntry.session_id)} type="button">
                  Open session
                </button>
              </div>
            </div>
          )) : (
            <div className="workspace-subtle-card p-5">
              <p className="font-medium">No published reports yet</p>
              <p className="mt-2 text-sm muted">Published summaries for all assigned drivers will collect here, so parents do not need to hunt through each driver card.</p>
            </div>
          )}
        </div>
      </article>
      {(portal.drivers || []).map((entry) => (
        <article key={entry.driver?.id || entry.driver?.name} className="app-panel p-5">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="workspace-section-label">Assigned Driver</p>
              <h2 className="mt-1 text-2xl font-semibold">{entry.driver?.name || "Unknown driver"}</h2>
            </div>
            <span className="badge">{entry.driver?.class_name || "No class"}</span>
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="library-list">
              {entry.sessions?.[0] ? (
                <div className="workspace-subtle-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">Latest uploaded run</p>
                      <p className="mt-1 text-sm muted">{entry.sessions[0].event_round}</p>
                    </div>
                    <div className="chip-row">
                      {isNewPortalItem(entry.sessions[0].created_at, lastSeenSessionAt) ? <span className="pill">New</span> : null}
                      <span className="pill pill-neutral">{formatPortalTimestamp(entry.sessions[0].created_at)}</span>
                    </div>
                  </div>
                  <div className="portal-action-row mt-4">
                    <button className="workspace-primary px-4 py-3 text-sm text-white" onClick={() => onOpenSession(entry.sessions[0].id)} type="button">
                      Open latest run
                    </button>
                    {entry.sessions[0].test_session_id && setupHasValues(entry.sessions[0].setup) ? (
                      <button
                        className="workspace-ghost px-4 py-3 text-sm"
                        onClick={() => openSetupReportWindow(entry.sessions[0].test_session_id, [entry.driver?.id])}
                        type="button"
                      >
                        Setup sheet
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {(entry.sessions || []).map((session) => (
                <button key={session.id} className="library-item" onClick={() => onOpenSession(session.id)} type="button">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{session.event_round}</p>
                      <p className="mt-1 text-sm muted">{session.event_name} / {session.session_type}</p>
                    </div>
                    <div className="chip-row">
                      {isNewPortalItem(session.created_at, lastSeenSessionAt) ? <span className="pill">New</span> : null}
                      <span className="pill pill-neutral">{formatPortalTimestamp(session.created_at)}</span>
                      {setupHasValues(session.setup) ? <span className="pill">Setup saved</span> : null}
                    </div>
                  </div>
                  {session.driver_analysis ? (
                    <p className="mt-2 text-sm muted">Best lap {formatMetric(session.driver_analysis.best_lap)} / Top speed {formatDisplaySpeed(session.driver_analysis.top_speed, speedUnit)} {getDisplaySpeedUnit(speedUnit)} / Rank {session.driver_analysis.session_rank}</p>
                  ) : null}
                </button>
              ))}
            </div>
            <div className="grid gap-3">
              {!(entry.reports || []).length ? (
                <div className="workspace-subtle-card p-4">
                  <p className="font-medium">No report shared yet</p>
                  <p className="mt-2 text-sm muted">As soon as a report is published for {entry.driver?.name}, it will appear here at the top of their portal.</p>
                </div>
              ) : null}
              {(entry.reports || []).slice(0, 2).map((reportEntry) => renderPortalReportCard(reportEntry, onOpenSession, lastSeenReportAt))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function SessionResultsPage({
  selectedSessionDetail,
  loading,
  tracks = [],
  mapsApiKey = "",
  speedUnit = "kmh",
  onBack,
  onDeleteSession,
  onGenerateFeedback,
  onExportPdf,
  onSessionStatusChange,
  onPublishReport,
  onOpenReportStudio,
  onSavePreset,
  onDeletePreset,
  onSaveCoachingNote,
  onDeleteCoachingNote,
  onSaveTrackMarkerDefaults,
}) {
  const session = selectedSessionDetail?.session;
  const reports = selectedSessionDetail?.reports || [];
  const presets = selectedSessionDetail?.presets || [];
  const coachingNotes = selectedSessionDetail?.notes || [];
  const plannedSession = session?.planned_session || null;
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedDrivers, setSelectedDrivers] = useState([]);
  const [selectedLapMetric, setSelectedLapMetric] = useState("time");
  const [selectedLapsByDriver, setSelectedLapsByDriver] = useState({});
  const [selectedTraceChannel, setSelectedTraceChannel] = useState("speed");
  const [hoveredTraceDistance, setHoveredTraceDistance] = useState(null);
  const [traceZoomWindow, setTraceZoomWindow] = useState({ min: 0, max: 1 });
  const [expandedTraceDrivers, setExpandedTraceDrivers] = useState({});
  const [cornerLapByDriver, setCornerLapByDriver] = useState({});
  const [mapCalibrationDraft, setMapCalibrationDraft] = useState({
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: 0,
    rotationDeg: 0,
  });
  const [calibrationSaved, setCalibrationSaved] = useState(true);
  const [cornerMarkerOffsets, setCornerMarkerOffsets] = useState({});
  const [cornerMarkersSaved, setCornerMarkersSaved] = useState(true);
  const [cornerMarkerNotice, setCornerMarkerNotice] = useState("");
  const [cornerMarkerEditorOpen, setCornerMarkerEditorOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [noteDraft, setNoteDraft] = useState({ driver_id: "", title: "", body: "", next_actions: "" });
  const [hoveredCornerId, setHoveredCornerId] = useState(null);

  const track = useMemo(() => findTrackByName(tracks, session?.event_name || ""), [tracks, session?.event_name]);
  const drivers = session?.analysis?.drivers || [];
  const overlayBounds = session?.analysis?.overlay_bounds || {};
  const cornerAnalysis = session?.analysis?.corner_analysis || [];
  const sectorAnalysis = session?.analysis?.sector_analysis || [];
  const mapCalibration = useMemo(() => getTrackMapCalibration(track), [track]);
  const mapViewport = useMemo(
    () => getStaticMapViewport(track, overlayBounds),
    [track, overlayBounds],
  );
  const telemetryReadiness = useMemo(() => {
    if (session?.analysis?.telemetry_readiness) {
      return {
        ...session.analysis.telemetry_readiness,
        cornerDatabase: Boolean(track?.cornerDefinitions?.length || track?.cornerNotes?.length),
      };
    }
    const gpsKeys = ["gps_points", "trace_points", "latitude", "longitude", "latitudes", "longitudes"];
    const speedKeys = ["speed_trace", "speed_points", "speed"];
    const brakeKeys = ["brake_trace", "brake_points", "brake"];
    const throttleKeys = ["throttle_trace", "throttle_points", "throttle"];
    const hasKey = (keys) => drivers.some((driver) => keys.some((key) => driver?.[key] !== undefined && driver?.[key] !== null && driver?.[key] !== ""));
    return {
      gps: hasKey(gpsKeys),
      speed: hasKey(speedKeys),
      brake: hasKey(brakeKeys),
      throttle: hasKey(throttleKeys),
      cornerDatabase: Boolean(track?.cornerNotes?.length),
    };
  }, [drivers, track]);

  useEffect(() => {
    setSelectedDrivers([]);
    setSelectedLapsByDriver({});
    setSelectedLapMetric("time");
    setSelectedTraceChannel("speed");
    setHoveredTraceDistance(null);
    setTraceZoomWindow({ min: 0, max: 1 });
    setExpandedTraceDrivers({});
    setCornerLapByDriver({});
    setPresetName("");
    setNoteDraft({ driver_id: "", title: "", body: "", next_actions: "" });
    setCalibrationSaved(true);
    setCornerMarkerOffsets({});
    setCornerMarkersSaved(true);
    setCornerMarkerNotice("");
    setCornerMarkerEditorOpen(false);
    setHoveredCornerId(null);
  }, [session?.id]);

  useEffect(() => {
    if (!track?.id || typeof window === "undefined") {
      return;
    }
    const storageKey = `track-map-calibration:v4:${track.id}`;
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        setMapCalibrationDraft({ ...mapCalibrationDraft, ...JSON.parse(saved) });
        setCalibrationSaved(true);
        return;
      } catch {}
    }
    setMapCalibrationDraft({
      scaleX: mapCalibration?.scaleX ?? 1,
      scaleY: mapCalibration?.scaleY ?? 1,
      offsetX: mapCalibration?.offsetX ?? 0,
      offsetY: mapCalibration?.offsetY ?? 0,
      rotationDeg: mapCalibration?.rotationDeg ?? 0,
    });
    setCalibrationSaved(true);
  }, [track?.id]);

  useEffect(() => {
    if (!track?.id || typeof window === "undefined") {
      setCornerMarkerOffsets({});
      setCornerMarkersSaved(true);
      return;
    }
    const storageKey = `corner-marker-offsets:v1:${track.id}`;
    const saved = window.localStorage.getItem(storageKey);
    const trackDefaults = track?.cornerMarkerOffsets || {};
    if (saved) {
      try {
        setCornerMarkerOffsets({ ...trackDefaults, ...JSON.parse(saved) });
        setCornerMarkersSaved(true);
        setCornerMarkerNotice("");
        setCornerMarkerEditorOpen(false);
        return;
      } catch {}
    }
    setCornerMarkerOffsets(trackDefaults);
    setCornerMarkersSaved(true);
    setCornerMarkerNotice("");
    setCornerMarkerEditorOpen(false);
  }, [track?.id, track?.cornerMarkerOffsets]);

  const trackMapUrl = track ? buildGoogleStaticMapUrl(track, mapsApiKey, overlayBounds) : "";
  const driverOverlayRows = drivers.map((driver, index) => ({
    id: driver.driver_id || driver.driver_name || `driver-${index}`,
    name: driver.canonical_driver_name || driver.driver_name || `Driver ${index + 1}`,
    colour: DRIVER_TRACE_COLOURS[index % DRIVER_TRACE_COLOURS.length],
    trace: driver.best_lap_trace || [],
  }));
  const selectedOverlayDrivers = selectedDrivers.length ? selectedDrivers : driverOverlayRows.map((driver) => driver.id);
  const activeOverlayDrivers = driverOverlayRows.filter((driver) => selectedOverlayDrivers.includes(driver.id));
  const projectedTraces = activeOverlayDrivers.map((driver) => ({
    ...driver,
    points: projectTraceToStage(driver.trace, mapViewport, 1000, 600, mapCalibrationDraft),
  })).filter((driver) => driver.points);
  const focusedDriverId = selectedOverlayDrivers[0] || driverOverlayRows[0]?.id || "";
  const focusedDriver = drivers.find((driver, index) => (
    (driver.driver_id || driver.driver_name || `driver-${index}`) === focusedDriverId
  )) || drivers[0];
  const telemetryDriverRows = useMemo(() => (
    drivers.map((driver, index) => {
      const id = driver.driver_id || driver.driver_name || `driver-${index}`;
      const lapRows = buildLapRows(driver.lap_table || []);
      const consistency = calculateConsistency(lapRows);
      const topSpeed = driver.top_speed ?? maxLapField(lapRows, "topSpeed") ?? driver.channel_summary?.max_speed_average ?? driver.channel_summary?.speed_trace_average;
      const maxRpm = driver.max_rpm ?? driver.rpm_extremes?.max ?? maxLapField(lapRows, "maxRpm");
      return {
        id,
        name: driver.canonical_driver_name || driver.driver_name,
        colour: DRIVER_TRACE_COLOURS[index % DRIVER_TRACE_COLOURS.length],
        bestLap: driver.best_lap,
        averageLap: calculateAverageLap(driver.lap_table || []),
        topSpeed,
        maxRpm,
        consistency,
        lapCount: lapRows.length || driver.lap_count || 0,
        lapRows,
        bestLapTrace: driver.best_lap_trace || [],
        time_loss_hint: driver.time_loss_hint,
        detected_track: driver.detected_track,
        session_date: driver.session_date,
        detected_session_type: driver.detected_session_type,
        lapTraces: (driver.lap_traces || []).map((lapTrace) => ({
          lapNumber: lapTrace.lap_number,
          lapLabel: `L${lapTrace.lap_number}`,
          lapTime: lapTrace.lap_time,
          trace: lapTrace.trace || [],
        })),
      };
    })
  ), [drivers]);
  const activeTelemetryDrivers = telemetryDriverRows.filter((driver) => selectedOverlayDrivers.includes(driver.id));
  const chartReadyDrivers = (activeTelemetryDrivers.length ? activeTelemetryDrivers : telemetryDriverRows)
    .map((driver) => filterDriverBySelectedLaps(driver, selectedLapsByDriver[driver.id] || []))
    .filter((driver) => driver.lapRows.length > 0);
  const overviewDrivers = useMemo(
    () => (
      (activeTelemetryDrivers.length ? activeTelemetryDrivers : telemetryDriverRows)
        .map((driver) => applySelectedLapSelection(driver, selectedLapsByDriver[driver.id] || []))
        .filter((driver) => driver.lapRows.length > 0)
    ),
    [activeTelemetryDrivers, telemetryDriverRows, selectedLapsByDriver],
  );
  const overviewDriverIds = overviewDrivers.map((driver) => driver.id);
  const overviewFocusedDriver = overviewDrivers.find((driver) => driver.id === focusedDriverId) || overviewDrivers[0] || null;
  const overviewLeader = overviewDrivers.reduce((best, driver) => {
    if (!best || (driver.bestLap ?? Infinity) < (best.bestLap ?? Infinity)) {
      return driver;
    }
    return best;
  }, null);
  const filteredSectorAnalysis = useMemo(
    () => filterSectorAnalysisForDrivers(sectorAnalysis, overviewDriverIds),
    [sectorAnalysis, overviewDriverIds],
  );
  const selectedTraceEntries = useMemo(
    () => buildSelectedTraceEntries(activeTelemetryDrivers.length ? activeTelemetryDrivers : telemetryDriverRows, selectedLapsByDriver),
    [activeTelemetryDrivers, telemetryDriverRows, selectedLapsByDriver],
  );
  const playbackChannelSeries = useMemo(
    () => buildTraceMetricSeries(selectedTraceEntries, selectedTraceChannel),
    [selectedTraceEntries, selectedTraceChannel],
  );
  const referenceTraceEntry = useMemo(
    () => resolveReferenceTraceEntry(selectedTraceEntries),
    [selectedTraceEntries],
  );
  const playbackDeltaSeries = useMemo(
    () => buildTraceDeltaSeries(selectedTraceEntries, referenceTraceEntry),
    [selectedTraceEntries, referenceTraceEntry],
  );
  const playbackMarkers = useMemo(
    () => buildPlaybackMarkers(selectedTraceEntries, hoveredTraceDistance, mapViewport, mapCalibrationDraft),
    [selectedTraceEntries, hoveredTraceDistance, mapViewport, mapCalibrationDraft],
  );
  const normalizedSpeedUnit = normalizeSpeedUnit(speedUnit);
  const speedUnitLabel = getDisplaySpeedUnit(normalizedSpeedUnit);
  const formatSessionSpeed = (value, decimals = 2) => formatDisplaySpeed(value, normalizedSpeedUnit, decimals);

  function updateMapCalibration(patch) {
    setMapCalibrationDraft((current) => ({ ...current, ...patch }));
    setCalibrationSaved(false);
  }

  function saveMapCalibration() {
    if (!track?.id || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(`track-map-calibration:v4:${track.id}`, JSON.stringify(mapCalibrationDraft));
    setCalibrationSaved(true);
  }

  function resetMapCalibration() {
    setMapCalibrationDraft({
      scaleX: mapCalibration?.scaleX ?? 1,
      scaleY: mapCalibration?.scaleY ?? 1,
      offsetX: mapCalibration?.offsetX ?? 0,
      offsetY: mapCalibration?.offsetY ?? 0,
      rotationDeg: mapCalibration?.rotationDeg ?? 0,
    });
    setCalibrationSaved(false);
  }

  function nudgeCornerMarker(cornerId, delta) {
    if (!cornerId) return;
    setCornerMarkerOffsets((current) => {
      const nextValue = Number(((current[cornerId] || 0) + delta).toFixed(4));
      const next = { ...current };
      if (Math.abs(nextValue) < 0.0001) {
        delete next[cornerId];
      } else {
        next[cornerId] = nextValue;
      }
      return next;
    });
    setCornerMarkersSaved(false);
    setCornerMarkerNotice("");
  }

  function resetCornerMarker(cornerId) {
    if (!cornerId) return;
    setCornerMarkerOffsets((current) => {
      const next = { ...current };
      const defaultValue = track?.cornerMarkerOffsets?.[cornerId];
      if (Number.isFinite(defaultValue)) {
        next[cornerId] = defaultValue;
      } else {
        delete next[cornerId];
      }
      return next;
    });
    setCornerMarkersSaved(false);
    setCornerMarkerNotice("");
  }

  function saveCornerMarkers() {
    if (!track?.id || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(`corner-marker-offsets:v1:${track.id}`, JSON.stringify(cornerMarkerOffsets));
    setCornerMarkersSaved(true);
    setCornerMarkerNotice(`Saved locally for ${track.name || "this track"}.`);
  }

  async function saveCornerMarkersToTrackDefaults() {
    if (!track?.id || !onSaveTrackMarkerDefaults) {
      return;
    }
    await onSaveTrackMarkerDefaults(track, cornerMarkerOffsets);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`corner-marker-offsets:v1:${track.id}`, JSON.stringify(cornerMarkerOffsets));
    }
    setCornerMarkersSaved(true);
    setCornerMarkerNotice(`Track defaults saved for ${track.name || "this track"}.`);
  }

  function resetAllCornerMarkers() {
    setCornerMarkerOffsets(track?.cornerMarkerOffsets || {});
    if (track?.id && typeof window !== "undefined") {
      window.localStorage.removeItem(`corner-marker-offsets:v1:${track.id}`);
    }
    setCornerMarkersSaved(true);
    setCornerMarkerNotice(`Marker offsets reset to saved defaults for ${track?.name || "this track"}.`);
  }

  const playbackReadout = useMemo(
    () => buildPlaybackReadout(selectedTraceEntries, hoveredTraceDistance, selectedTraceChannel, referenceTraceEntry, normalizedSpeedUnit),
    [selectedTraceEntries, hoveredTraceDistance, selectedTraceChannel, referenceTraceEntry, normalizedSpeedUnit],
  );
  const lapMetricConfig = LAP_METRIC_CHANNELS.find((channel) => channel.id === selectedLapMetric) || LAP_METRIC_CHANNELS[0];
  const traceChannelConfig = TRACE_CHANNELS.find((channel) => channel.id === selectedTraceChannel) || TRACE_CHANNELS[0];
  const lapMetricDisplayConfig = lapMetricConfig.id === "topSpeed"
    ? { ...lapMetricConfig, unit: speedUnitLabel }
    : lapMetricConfig;
  const traceChannelDisplayConfig = traceChannelConfig.id === "speed"
    ? { ...traceChannelConfig, unit: speedUnitLabel }
    : traceChannelConfig;
  const comparisonLeader = telemetryDriverRows.reduce((best, driver) => {
    if (!best || (driver.bestLap ?? Infinity) < (best.bestLap ?? Infinity)) {
      return driver;
    }
    return best;
  }, null);
  const cornerRows = useMemo(() => {
    if (!cornerAnalysis.length) {
      return (track?.cornerDefinitions || []).map((corner, index) => ({
        id: `${track?.id || "track"}-corner-${index + 1}`,
        name: corner.name || `Corner ${index + 1}`,
        note: corner.note || "",
        metrics: [],
        summary: "",
      }));
    }
    return cornerAnalysis.map((corner, index) => {
      const definition = track?.cornerDefinitions?.[index];
      return {
        id: `${track?.id || "track"}-corner-${corner.corner_number}`,
        name: definition?.name || `Corner ${corner.corner_number}`,
        note: definition?.note || "",
        metrics: corner.driver_metrics || [],
        summary: corner.summary || "",
        referenceDistance: corner.reference_distance,
        markerDistance: corner.reference_distance,
        referenceEntrySpeed: corner.reference_entry_speed,
        referenceMinimumSpeed: corner.reference_minimum_speed,
        referenceExitSpeed: corner.reference_exit_speed,
      };
    });
  }, [cornerAnalysis, track]);
  const sessionBestRows = useMemo(
    () => telemetryDriverRows
      .filter((driver) => driver.bestLap !== null && driver.bestLap !== undefined)
      .sort((a, b) => a.bestLap - b.bestLap),
    [telemetryDriverRows],
  );
  const cornerSelectableDrivers = useMemo(
    () => (activeTelemetryDrivers.length ? activeTelemetryDrivers : telemetryDriverRows).filter((driver) => (driver.lapTraces || []).length),
    [activeTelemetryDrivers, telemetryDriverRows],
  );
  const cornerTraceEntries = useMemo(
    () => buildCornerTraceEntries(cornerSelectableDrivers, cornerLapByDriver),
    [cornerSelectableDrivers, cornerLapByDriver],
  );
  const dynamicCornerRows = useMemo(
    () => buildDynamicCornerRows(cornerRows, cornerTraceEntries),
    [cornerRows, cornerTraceEntries],
  );
  const displayedCornerRows = useMemo(() => {
    const sourceRows = dynamicCornerRows.length ? dynamicCornerRows : cornerRows;
    return sourceRows.map((corner) => ({
      ...corner,
      markerDistance: applyCornerMarkerOffset(corner.referenceDistance, cornerMarkerOffsets[corner.id]),
    }));
  }, [dynamicCornerRows, cornerRows, cornerMarkerOffsets]);
  const cornerMapTrace = useMemo(
    () => resolveCornerMapTrace(cornerTraceEntries, sessionBestRows),
    [cornerTraceEntries, sessionBestRows],
  );
  const cornerMapModel = useMemo(
    () => buildCornerTrackMapModel(cornerMapTrace, displayedCornerRows, hoveredCornerId),
    [cornerMapTrace, displayedCornerRows, hoveredCornerId],
  );
  const hoveredCorner = useMemo(
    () => displayedCornerRows.find((corner) => corner.id === hoveredCornerId) || displayedCornerRows[0] || null,
    [displayedCornerRows, hoveredCornerId],
  );

  function applyPreset(preset) {
    if (!preset) return;
    setSelectedDrivers(preset.selectedDrivers || []);
    setSelectedLapsByDriver(preset.selectedLapsByDriver || {});
    setSelectedLapMetric(preset.selectedLapMetric || "time");
    setSelectedTraceChannel(preset.selectedTraceChannel || "speed");
    setActiveTab(preset.activeTab || "overview");
  }

  async function handlePresetSave() {
    if (!session?.id || !presetName.trim() || !onSavePreset) return;
    await onSavePreset({
      name: presetName.trim(),
      preset: {
        selectedDrivers,
        selectedLapsByDriver,
        selectedLapMetric,
        selectedTraceChannel,
        activeTab,
      },
    });
    setPresetName("");
  }

  async function handleNoteSave() {
    if (!session?.id || !noteDraft.title.trim() || !noteDraft.body.trim() || !onSaveCoachingNote) return;
    await onSaveCoachingNote({
      driver_id: noteDraft.driver_id,
      title: noteDraft.title.trim(),
      body: noteDraft.body.trim(),
      next_actions: noteDraft.next_actions.split("\n").map((item) => item.trim()).filter(Boolean),
    });
    setNoteDraft({ driver_id: "", title: "", body: "", next_actions: "" });
  }

  if (!session) {
    return (
      <article className="app-panel p-5">
        <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Session Results</p>
        <p className="mt-4 muted">Open a saved session from History to review the overview, comparison detail, and report publishing workflow.</p>
      </article>
    );
  }

  return (
    <div className="workspace-page">
      <section className="workspace-hero workspace-hero-premium">
        <div className="workspace-hero-premium-grid">
          <div className="workspace-hero-copy max-w-3xl">
            <p className="workspace-section-label">Session Results</p>
            <h2 className="workspace-hero-title">{session.event_round}</h2>
            <p className="workspace-hero-text">{session.event_name} / {session.session_type} / {session.created_at}</p>
          </div>
          <div className="workspace-hero-grid">
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Session state</p>
              <p className="workspace-kpi-value">{session.status || "uploaded"}</p>
              <p className="workspace-kpi-detail">Current workflow state for this uploaded session.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Drivers loaded</p>
              <p className="workspace-kpi-value">{session.driver_count || session.analysis?.drivers?.length || 0}</p>
              <p className="workspace-kpi-detail">Drivers present in the uploaded analysis pack.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Saved reports</p>
              <p className="workspace-kpi-value">{reports.length}</p>
              <p className="workspace-kpi-detail">{plannedSession ? "Linked to planned-session setup context." : "Standalone uploaded session view."}</p>
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="workspace-ghost px-4 py-3 text-sm" onClick={onBack} type="button">Back to history</button>
          <button className="workspace-danger px-4 py-3 text-sm" onClick={() => onDeleteSession?.(session)} type="button">Delete upload</button>
          {["uploaded", "analysed", "reviewed", "shared"].map((item) => (
            <button key={item} className={`workspace-ghost px-4 py-3 text-sm ${session.status === item ? "border-blue-400/30 bg-blue-500/10 text-white" : ""}`} onClick={() => onSessionStatusChange(item)} type="button">
              Mark {item}
            </button>
          ))}
        </div>
      </section>

      <section className="results-command-grid">
        <article className="app-panel results-command-card p-5">
          <p className="workspace-section-label">Session Brief</p>
          <h3 className="mt-2 text-2xl font-semibold">What this upload is ready for</h3>
          <p className="mt-3 text-sm muted">
            {overviewLeader
              ? `${overviewLeader.name} currently sets the best lap benchmark for this upload. Use the tabs below to move from session picture to lap comparison, corner work, and report publishing.`
              : "Review the session picture first, then step into lap comparison, corner work, and report publishing from the tabs below."}
          </p>
          <div className="mt-4 chip-row">
            {track?.name ? <span className="pill pill-neutral">{track.name}</span> : null}
            {plannedSession ? <span className="pill pill-neutral">Setup linked</span> : null}
            {reports.length ? <span className="pill pill-neutral">{reports.length} reports saved</span> : null}
          </div>
        </article>

        <article className="app-panel results-command-card p-5">
          <p className="workspace-section-label">Analysis Focus</p>
          <h3 className="mt-2 text-2xl font-semibold">Current coaching posture</h3>
          <div className="mt-4 grid gap-3">
            <div className="session-debrief-row">
              <span>Telemetry readiness</span>
              <span>{[telemetryReadiness.gps, telemetryReadiness.speed, telemetryReadiness.brake, telemetryReadiness.throttle].filter(Boolean).length}/4 core streams</span>
            </div>
            <div className="session-debrief-row">
              <span>Corner database</span>
              <span>{telemetryReadiness.cornerDatabase ? "Track corners mapped" : "Definitions still missing"}</span>
            </div>
            <div className="session-debrief-row">
              <span>Publishing workflow</span>
              <span>{reports.length ? "Reports available to review" : "Generate first report"}</span>
            </div>
          </div>
        </article>
      </section>

      <div className="telemetry-readiness-grid">
        <TelemetryStatusCard label="GPS trace overlay" ready={telemetryReadiness.gps} detail={telemetryReadiness.gps ? "GPS channels detected and ready for overlay rendering." : "Waiting for UniPro exports that include GPS latitude / longitude or trace points."} />
        <TelemetryStatusCard label="Speed comparison" ready={telemetryReadiness.speed} detail={telemetryReadiness.speed ? "Speed-derived overlays can be computed for corner entry and exit." : "No speed trace channels detected in the current session payload."} />
        <TelemetryStatusCard label="Brake / throttle timing" ready={telemetryReadiness.brake && telemetryReadiness.throttle} detail={telemetryReadiness.brake && telemetryReadiness.throttle ? "Brake and throttle timing comparisons are available for corner analysis." : "Brake and throttle traces are not yet present in the uploaded data."} />
        <TelemetryStatusCard label="Corner database" ready={telemetryReadiness.cornerDatabase} detail={telemetryReadiness.cornerDatabase ? "Track corner notes are available and can anchor future automated analysis." : "No corner definitions were found for this track yet."} />
      </div>

      <div className="results-tab-row mt-5">
        {[ 
            ["overview", "Overview"],
            ["lap-times", "Lap Times"],
            ["speed-traces", "Speed Traces"],
            ["track-map", "Track Map"],
            ["debrief", "Debrief"],
            ["corner-analysis", "Corner Analysis"],
            ["reports", "Publishing"],
        ].map(([id, label]) => (
          <button key={id} className={`results-tab ${activeTab === id ? "active" : ""}`} onClick={() => setActiveTab(id)} type="button">
            {label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <div className="telemetry-workspace-grid telemetry-overview-page">
          <aside className="app-panel p-4 telemetry-rail">
            <p className="workspace-section-label">Drivers</p>
            <div className="mt-4 grid gap-3">
              {telemetryDriverRows.map((driver) => {
                const active = (selectedDrivers.length ? selectedDrivers : telemetryDriverRows.map((item) => item.id)).includes(driver.id);
                const selectedLapCount = (selectedLapsByDriver[driver.id] || []).length;
                return (
                  <button
                    key={driver.id}
                    className={`telemetry-driver-card ${active ? "active" : ""}`}
                    onClick={() => setSelectedDrivers((current) => toggleSelection(current, driver.id, driverOverlayRows.map((item) => item.id)))}
                    type="button"
                  >
                    <div className="flex items-center gap-3">
                      <span className="overlay-driver-swatch" style={{ background: driver.colour }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{driver.name}</p>
                          <span className={`pill text-[10px] ${active ? "" : "pill-neutral"}`}>{active ? "Selected" : "Hidden"}</span>
                        </div>
                        <p className="text-xs muted">
                          {selectedLapCount ? `${selectedLapCount} selected` : `${driver.lapCount} laps`} · best {formatMetric(driver.bestLap)}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-6">
              <p className="workspace-section-label">Compare Laps</p>
              <p className="mt-3 text-xs muted">Choose the laps you want included in the custom charts. If no laps are selected for a driver, all of that driver's laps stay on the graph.</p>
              <div className="mt-4 grid gap-4">
                {telemetryDriverRows.map((driver) => (
                  <div key={`${driver.id}-laps`} className="telemetry-lap-group">
                    <p className="text-xs font-medium tracking-[0.16em] text-slate-300 uppercase">{driver.name}</p>
                    <div className="mt-3 telemetry-lap-chip-grid">
                      {driver.lapRows.slice(0, 12).map((lap) => (
                        <button
                          key={`${driver.id}-${lap.label}`}
                          className={`telemetry-lap-chip ${(selectedLapsByDriver[driver.id] || []).includes(lap.label) ? "active" : lap.isBest ? "is-best" : ""}`}
                          onClick={() => setSelectedLapsByDriver((current) => ({
                            ...current,
                            [driver.id]: toggleSelection(current[driver.id] || [], lap.label, driver.lapRows.map((item) => item.label)),
                          }))}
                          type="button"
                        >
                          {lap.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6">
              <p className="workspace-section-label">Chart Channel</p>
              <p className="mt-3 text-xs muted">Pick the lap metric you want the custom charts to plot.</p>
              <div className="mt-3 grid gap-2">
                {LAP_METRIC_CHANNELS.map((channel) => (
                  <button
                    key={channel.id}
                    className={`telemetry-channel-chip ${selectedLapMetric === channel.id ? "active" : ""}`}
                    onClick={() => setSelectedLapMetric(channel.id)}
                    type="button"
                  >
                    {channel.label}
                  </button>
                ))}
              </div>
            </div>
          </aside>

            <div className="telemetry-overview-stack">
            <article className="app-panel p-5">
                <p className="workspace-section-label">Session Overview</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm muted">
                    {overviewDrivers.length
                      ? `Overview is currently showing ${overviewDrivers.length} driver${overviewDrivers.length === 1 ? "" : "s"} using the lap choices from the control deck.`
                      : "Pick at least one lap to bring the overview charts and comparisons to life."}
                  </p>
                  {overviewLeader ? <span className="pill">{overviewLeader.name} currently leads</span> : null}
                </div>
                <div className="mt-4 telemetry-summary-grid">
                  {overviewDrivers.map((driver) => (
                    <div key={`${driver.id}-summary`} className="telemetry-driver-summary">
                      <div className="telemetry-summary-card">
                        <p className="telemetry-summary-label">{driver.name}</p>
                      <p className="telemetry-summary-value telemetry-summary-accent">{formatMetric(driver.bestLap)}</p>
                      <p className="telemetry-summary-detail">Best Lap</p>
                    </div>
                      <div className="telemetry-summary-card">
                        <p className="telemetry-summary-label">Avg Lap</p>
                        <p className="telemetry-summary-value">{formatMetric(driver.averageLap, 3)}</p>
                        <p className="telemetry-summary-detail">{driver.lapCount} displayed laps</p>
                      </div>
                    <div className="telemetry-summary-card">
                      <p className="telemetry-summary-label">Top Speed</p>
                      <p className="telemetry-summary-value telemetry-summary-speed">{formatSessionSpeed(driver.topSpeed)}</p>
                      <p className="telemetry-summary-detail">{speedUnitLabel}</p>
                    </div>
                    <div className="telemetry-summary-card">
                      <p className="telemetry-summary-label">Max RPM</p>
                      <p className="telemetry-summary-value">{formatMetric(driver.maxRpm)}</p>
                      <p className="telemetry-summary-detail">rpm</p>
                    </div>
                    <div className="telemetry-summary-card">
                      <p className="telemetry-summary-label">Consistency</p>
                      <p className="telemetry-summary-value">{formatMetric(driver.consistency, 3)}</p>
                      <p className="telemetry-summary-detail">lap time sigma</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            {plannedSession?.drivers?.length ? (
              <article className="app-panel p-5">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <p className="workspace-section-label">Kart Setup</p>
                    <h3 className="mt-2 text-2xl font-semibold">Session setup alongside telemetry</h3>
                  </div>
                  <span className="pill pill-neutral">{plannedSession.drivers.length} setup sheets</span>
                </div>
                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  {plannedSession.drivers.map((driver) => (
                    <div key={`${driver.id}-uploaded-setup`} className="workspace-subtle-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-white">{driver.name}</p>
                          <p className="mt-1 text-sm muted">{driver.class_name || "No class"}</p>
                        </div>
                        <span className="pill pill-neutral">Session-specific setup</span>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {buildSetupSummary(driver.setup).map(([label, value]) => (
                          <div key={`${driver.id}-${label}`} className="workspace-kpi">
                            <p className="workspace-kpi-label">{label}</p>
                            <p className="workspace-kpi-detail mt-2">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}

            <article className="app-panel p-5">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <p className="workspace-section-label">Best Lap Comparison</p>
                  <h3 className="mt-2 text-2xl font-semibold">Session pace overview</h3>
                </div>
                {comparisonLeader ? <span className="pill">{comparisonLeader.name} leads</span> : null}
              </div>
                <div className="mt-5 grid gap-4">
                  {overviewDrivers.map((driver) => {
                    const percent = overviewLeader?.bestLap ? Math.max(20, (overviewLeader.bestLap / (driver.bestLap || overviewLeader.bestLap)) * 100) : 100;
                    const delta = overviewLeader?.bestLap && driver.bestLap ? driver.bestLap - overviewLeader.bestLap : null;
                    return (
                      <div key={`${driver.id}-bar`} className="telemetry-comparison-row">
                        <div className="telemetry-comparison-label" style={{ color: driver.colour }}>{driver.name}</div>
                      <div className="telemetry-comparison-bar">
                        <div className="telemetry-comparison-fill" style={{ width: `${percent}%`, background: driver.colour }} />
                        <span className="telemetry-comparison-value">{formatMetric(driver.bestLap)}</span>
                      </div>
                        <div className="telemetry-comparison-delta">{Number.isFinite(delta) && delta > 0 ? `+${delta.toFixed(3)}s` : "-"}</div>
                      </div>
                    );
                  })}
                </div>
              </article>

              <div className="telemetry-overview-chart-grid">
                <CustomLapMetricChart
                  drivers={overviewDrivers}
                  metricKey={lapMetricDisplayConfig.id}
                  title={lapMetricDisplayConfig.chartTitle}
                  description={`Live chart from the currently selected laps and visible drivers. Channel: ${lapMetricDisplayConfig.label}.`}
                  unit={lapMetricDisplayConfig.unit}
                  valueTransform={lapMetricDisplayConfig.id === "topSpeed" ? (value) => convertDisplaySpeed(value, normalizedSpeedUnit) : undefined}
                  mode="line"
                />
                <CustomLapMetricChart
                  drivers={overviewDrivers}
                  metricKey={lapMetricDisplayConfig.id}
                  title={`${lapMetricDisplayConfig.chartTitle} Snapshot`}
                  description="Bar view of the same current selection so gains and losses are easier to spot."
                  unit={lapMetricDisplayConfig.unit}
                  valueTransform={lapMetricDisplayConfig.id === "topSpeed" ? (value) => convertDisplaySpeed(value, normalizedSpeedUnit) : undefined}
                  mode="bar"
                />
              </div>

              <div className="telemetry-overview-lower-grid">
                <article className="app-panel p-5">
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                    <div>
                    <p className="workspace-section-label">Sector Analysis</p>
                    <h3 className="mt-2 text-2xl font-semibold">Named best-lap sector splits</h3>
                  </div>
                    <span className="pill pill-neutral">{filteredSectorAnalysis.length || 0} sectors</span>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {filteredSectorAnalysis.length ? filteredSectorAnalysis.map((sector) => (
                      <div key={sector.sector_name} className="workspace-subtle-card p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                          <p className="font-medium">{sector.sector_name}</p>
                          <p className="text-sm muted">{sector.fastest_driver ? `${sector.fastest_driver} quickest in this full-lap sector at ${formatMetric(sector.fastest_time, 3)}s` : "No sector timing available"}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2">
                          {sector.drivers.map((item) => (
                            <div key={`${sector.sector_name}-${item.driver_name}`} className="session-debrief-row">
                              <span>{item.driver_name}</span>
                              <span>{formatMetric(item.time, 3)}{item.delta_to_fastest ? ` (${item.delta_to_fastest > 0 ? "+" : ""}${item.delta_to_fastest.toFixed(3)}s)` : item.delta_to_fastest === 0 ? " (best)" : ""}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    )) : <p className="muted">Sector timing will appear here once continuous full-lap sector windows are available for the selected track.</p>}
                </div>
              </article>

              <article className="app-panel p-5">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <p className="workspace-section-label">Saved Views</p>
                    <h3 className="mt-2 text-2xl font-semibold">Comparison presets</h3>
                  </div>
                  <span className="pill pill-neutral">{presets.length} saved</span>
                </div>
                <div className="mt-4 grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <input
                      className="workspace-input"
                      placeholder="Save current chart layout"
                      value={presetName}
                      onChange={(event) => setPresetName(event.target.value)}
                    />
                    <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" type="button" onClick={handlePresetSave}>Save preset</button>
                  </div>
                  {presets.length ? presets.map((preset) => (
                    <div key={preset.id} className="workspace-subtle-card p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{preset.name}</p>
                          <p className="text-sm muted">{preset.updated_at || preset.created_at}</p>
                        </div>
                        <div className="chip-row">
                          <button className="workspace-ghost px-3 py-2 text-xs" type="button" onClick={() => applyPreset(preset.preset)}>Load</button>
                          <button className="workspace-ghost px-3 py-2 text-xs" type="button" onClick={() => onDeletePreset?.(preset.id)}>Delete</button>
                        </div>
                      </div>
                    </div>
                  )) : <p className="muted">Save a preset for things like Oliver vs Jacob vs Zac with your preferred laps and chart channel.</p>}
                </div>
              </article>
            </div>

              <article className="app-panel p-5">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <p className="workspace-section-label">Focused Driver</p>
                    <h3 className="mt-2 text-2xl font-semibold">{overviewFocusedDriver ? overviewFocusedDriver.name : "Select a driver"}</h3>
                  </div>
                  {overviewFocusedDriver ? <span className="pill pill-neutral">{overviewFocusedDriver.lapCount} displayed laps</span> : null}
                </div>
                {overviewFocusedDriver ? (
                  <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
                    <div className="overflow-x-auto">
                      <table className="telemetry-table min-w-full">
                      <thead>
                        <tr>
                          <th>Lap</th>
                          <th>Time</th>
                          <th>Delta</th>
                          <th>Top Speed ({speedUnitLabel})</th>
                          <th>Max RPM</th>
                        </tr>
                        </thead>
                        <tbody>
                          {overviewFocusedDriver.lapRows.map((lap) => (
                            <tr
                              key={lap.label}
                              className={lap.isBest ? "is-best" : ""}
                              onClick={() => setSelectedLapsByDriver((current) => ({
                                ...current,
                                [overviewFocusedDriver.id]: toggleSelection(current[overviewFocusedDriver.id] || [], lap.label, overviewFocusedDriver.lapRows.map((item) => item.label)),
                              }))}
                              style={{ cursor: "pointer" }}
                            >
                              <td>{lap.label}</td>
                              <td>{formatMetric(lap.time)}</td>
                              <td>{lap.delta === 0 ? "-" : `+${lap.delta.toFixed(3)}s`}</td>
                            <td>{formatSessionSpeed(lap.topSpeed)}</td>
                            <td>{formatMetric(lap.maxRpm)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                    <div className="grid gap-4">
                      <div className="workspace-subtle-card p-4">
                        <p className="text-sm font-medium">Telemetry Status</p>
                        <p className="mt-3 text-sm muted">{overviewFocusedDriver.bestLapTrace?.length ? `${overviewFocusedDriver.bestLapTrace.length} GPS trace points captured on the best lap.` : "No GPS trace points stored for this driver yet."}</p>
                      </div>
                      <div className="workspace-subtle-card p-4">
                        <p className="text-sm font-medium">Time Loss Hint</p>
                        <p className="mt-3 text-sm muted">{overviewFocusedDriver.time_loss_hint || "Use the lap table and charts above to isolate where time is being gained or lost."}</p>
                      </div>
                      <div className="workspace-subtle-card p-4">
                        <p className="text-sm font-medium">Session Context</p>
                        <p className="mt-3 text-sm muted">{overviewFocusedDriver.detected_track} / {overviewFocusedDriver.session_date || "Unknown date"} / {overviewFocusedDriver.detected_session_type}</p>
                      </div>
                    </div>
                  </div>
              ) : null}
            </article>
          </div>
        </div>
      ) : null}

      {activeTab === "lap-times" ? (
        <div className="grid gap-5">
          <div className="telemetry-chart-grid">
            <LapMetricBarChart
              drivers={chartReadyDrivers}
              metricKey="topSpeed"
              title="Per-Lap Top Speed"
              description="Compare the top speed reached on each lap for every selected driver."
              unit={speedUnitLabel}
              valueTransform={lapMetricDisplayConfig.id === "topSpeed" ? (value) => convertDisplaySpeed(value, normalizedSpeedUnit) : undefined}
            />
            <LapMetricBarChart
              drivers={chartReadyDrivers}
              metricKey="maxRpm"
              title="Per-Lap Max RPM"
              description="Compare peak RPM reached on each lap for every selected driver."
              unit="rpm"
            />
          </div>
          {telemetryDriverRows.map((driver) => (
            <article key={`${driver.id}-laps-panel`} className="app-panel p-5">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <p className="workspace-section-label">{driver.name}</p>
                  <h3 className="mt-2 text-2xl font-semibold">All laps</h3>
                </div>
                <div className="chip-row">
                  <span className="pill pill-neutral">{driver.lapCount} laps</span>
                  <span className="pill">{formatMetric(driver.bestLap)} best</span>
                  <span className="pill pill-neutral">{formatMetric(driver.consistency, 3)} sigma</span>
                </div>
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="telemetry-table min-w-full">
                  <thead>
                    <tr>
                      <th>Lap</th>
                      <th>Time</th>
                      <th>Delta</th>
                      <th>Top Speed ({speedUnitLabel})</th>
                      <th>Max RPM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driver.lapRows.map((lap) => (
                      <tr key={`${driver.id}-${lap.label}`} className={lap.isBest ? "is-best" : ""}>
                        <td>{lap.label}</td>
                        <td>{formatMetric(lap.time)}</td>
                        <td>{lap.delta === 0 ? "-" : `+${lap.delta.toFixed(3)}s`}</td>
                        <td>{formatSessionSpeed(lap.topSpeed)}</td>
                        <td>{formatMetric(lap.maxRpm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {activeTab === "speed-traces" ? (
        <div className="grid gap-5">
            <article className="app-panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <p className="workspace-section-label">Speed Traces</p>
                  <h3 className="mt-2 text-2xl font-semibold">Telemetry playback, live delta, and track position</h3>
                  <p className="mt-3 text-sm muted">Pick multiple drivers and laps, scrub the telemetry, and follow each kart around the lap with live channel values and real-time delta build-up.</p>
                </div>
                <div className="chip-row">
                  <span className="pill pill-neutral">{selectedTraceEntries.length} lap{selectedTraceEntries.length === 1 ? "" : "s"} selected</span>
                  {TRACE_CHANNELS.map((channel) => (
                    <button
                      key={`trace-tab-${channel.id}`}
                    className={`telemetry-channel-chip ${selectedTraceChannel === channel.id ? "active" : ""}`}
                    onClick={() => setSelectedTraceChannel(channel.id)}
                    type="button"
                  >
                    {channel.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5 workspace-subtle-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="workspace-section-label">Trace Selection</p>
                  <p className="mt-2 text-sm muted">Choose the drivers and specific laps you want overlaid on the speed trace and delta charts.</p>
                </div>
                  <span className="pill pill-neutral">{activeOverlayDrivers.length} active drivers</span>
                </div>
                <div className="mt-4 telemetry-trace-toolbar">
                {telemetryDriverRows.map((driver) => {
                  const driverSelected = selectedOverlayDrivers.includes(driver.id);
                  const selectedLapLabels = selectedLapsByDriver[driver.id] || [];
                  const isExpanded = expandedTraceDrivers[driver.id] ?? false;
                  return (
                    <div key={`trace-select-${driver.id}`} className="telemetry-trace-dropdown">
                      <div className="telemetry-trace-dropdown-head">
                        <button
                          className={`telemetry-driver-card ${driverSelected ? "active" : ""}`}
                          onClick={() => setSelectedDrivers((current) => toggleSelection(current, driver.id, driverOverlayRows.map((item) => item.id)))}
                          type="button"
                        >
                          <div className="flex items-center gap-3">
                            <span className="overlay-driver-swatch" style={{ background: driver.colour }} />
                            <div className="min-w-0">
                              <p className="font-medium">{driver.name}</p>
                              <p className="text-xs muted">
                                {selectedLapLabels.length
                                  ? `${selectedLapLabels.length} lap${selectedLapLabels.length === 1 ? "" : "s"} selected`
                                  : `${driver.lapCount} laps available`}
                              </p>
                            </div>
                          </div>
                        </button>
                        <button
                          className={`telemetry-trace-toggle ${isExpanded ? "active" : ""}`}
                          onClick={() => setExpandedTraceDrivers((current) => ({ ...current, [driver.id]: !isExpanded }))}
                          type="button"
                        >
                          {isExpanded ? "Close" : "Choose laps"}
                        </button>
                      </div>
                      {driverSelected && isExpanded ? (
                        <div className="telemetry-trace-dropdown-menu">
                          <div className="telemetry-lap-chip-grid telemetry-lap-chip-grid-compact">
                            {driver.lapRows.map((lap) => (
                              <button
                                key={`speed-trace-${driver.id}-${lap.label}`}
                                className={`telemetry-lap-chip ${selectedLapLabels.includes(lap.label) ? "active" : lap.isBest ? "is-best" : ""}`}
                                onClick={() => setSelectedLapsByDriver((current) => ({
                                  ...current,
                                  [driver.id]: toggleSelection(current[driver.id] || [], lap.label, driver.lapRows.map((item) => item.label)),
                                }))}
                                type="button"
                              >
                                {lap.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 telemetry-speed-layout">
              <article className="app-panel p-5 telemetry-map-panel telemetry-speed-map-panel">
                <p className="workspace-section-label">Synchronized Track Position</p>
                <h3 className="mt-2 text-2xl font-semibold">{track?.name || session.event_name || "Track map"}</h3>
                <div className="telemetry-map-stage mt-5">
                  {trackMapUrl ? <img alt={`${track?.name || session.event_name} map`} className="telemetry-map-image" src={trackMapUrl} /> : <div className="telemetry-map-placeholder"><p className="font-medium">{track?.name || session.event_name}</p><p className="mt-2 text-sm muted">{mapsApiKey ? "Map image unavailable for this track right now." : "Add a Google Static Maps key in Settings to show the track background."}</p></div>}
                  <div className="telemetry-map-overlay">
                    {selectedTraceEntries.length ? (
                      <svg className="telemetry-trace-svg" viewBox="0 0 1000 600" preserveAspectRatio="none">
                        {selectedTraceEntries.map((entry) => {
                          const points = projectTraceToStage(entry.trace, mapViewport, 1000, 600, mapCalibrationDraft);
                          return (
                            <polyline
                              key={entry.id}
                              fill="none"
                              points={points}
                              stroke={entry.colour}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeOpacity="0.64"
                              strokeWidth="4"
                            />
                          );
                        })}
                        {playbackMarkers.map((marker) => (
                          <g key={`marker-${marker.id}`}>
                            <circle cx={marker.x} cy={marker.y} r="9" fill="rgba(8,14,24,0.85)" stroke={marker.colour} strokeWidth="3" />
                            <circle cx={marker.x} cy={marker.y} r="4.5" fill={marker.colour} />
                          </g>
                        ))}
                      </svg>
                    ) : (
                      <div className="telemetry-overlay-watermark">Select at least one driver and lap to start synced telemetry playback.</div>
                    )}
                  </div>
                </div>
              </article>

              <div className="telemetry-speed-side">
                <div className="workspace-subtle-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="workspace-section-label">Live Hover Readout</p>
                      <p className="mt-2 text-sm muted">
                        {hoveredTraceDistance === null
                          ? "Hover the chart or drag the scrubber to inspect the lap live."
                          : `Current position ${Math.round(hoveredTraceDistance * 100)}% around the lap`}
                      </p>
                    </div>
                  </div>
              <div className="mt-4 telemetry-readout-list">
                    <div className="telemetry-calibration-banner">
                      <div>
                        <p className="font-medium">Track calibration</p>
                        <p className="mt-1 text-sm muted">
                          {calibrationSaved
                            ? "Using the saved Track Map calibration for this track."
                            : "Calibration changes are unsaved. Open Track Map to save them for reuse here."}
                        </p>
                      </div>
                      <button
                        className="workspace-ghost px-3 py-2 text-sm"
                        onClick={() => setActiveTab("track-map")}
                        type="button"
                      >
                        Open Track Map
                      </button>
                    </div>
                    {playbackReadout.length ? playbackReadout.map((item) => (
                      <div key={`readout-${item.id}`} className="telemetry-readout-row">
                        <div className="flex items-center gap-3">
                          <span className="overlay-driver-swatch" style={{ background: item.colour }} />
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-xs muted">{item.lapLabel}</p>
                          </div>
                        </div>
                        <div className="telemetry-readout-metrics">
                          <div>
                            <span className="telemetry-readout-label">{traceChannelDisplayConfig.label}</span>
                            <strong>{item.channelValueText}</strong>
                          </div>
                          <div>
                            <span className="telemetry-readout-label">Elapsed</span>
                            <strong>{item.elapsedText}</strong>
                          </div>
                          <div>
                            <span className="telemetry-readout-label">Delta</span>
                            <strong>{item.deltaText}</strong>
                          </div>
                        </div>
                      </div>
                    )) : <p className="muted">No playback point selected yet.</p>}
                  </div>
                </div>
              </div>

              <div className="telemetry-speed-chart-wrap">
                    <DistancePlaybackChart
                      series={playbackChannelSeries}
                      title={`${traceChannelDisplayConfig.label} Trace`}
                      description="Move across the graph to scrub the lap and update the kart position on the map."
                      yAxisLabel={traceChannelDisplayConfig.label}
                      valueFormatter={(value) => {
                        const displayValue = traceChannelDisplayConfig.id === "speed"
                          ? convertDisplaySpeed(value, normalizedSpeedUnit)
                          : value;
                        return `${formatMetric(displayValue, 3)}${traceChannelDisplayConfig.unit ? ` ${traceChannelDisplayConfig.unit}` : ""}`;
                      }}
                      hoveredDistance={hoveredTraceDistance}
                      onHoverDistanceChange={setHoveredTraceDistance}
                      zoomWindow={traceZoomWindow}
                      onZoomWindowChange={setTraceZoomWindow}
                      scrubberValue={hoveredTraceDistance}
                      onScrubberValueChange={setHoveredTraceDistance}
                      onResetScrubber={() => setHoveredTraceDistance(null)}
                      compact
                />
              </div>

              <div className="telemetry-speed-chart-wrap">
                    <DistancePlaybackChart
                      series={playbackDeltaSeries}
                      title="Live Delta"
                      description="Watch the time loss or gain build in real time as you move through the lap against the first selected lap."
                      yAxisLabel="Delta"
                      valueFormatter={(value) => `${value >= 0 ? "+" : ""}${formatMetric(value, 3)}s`}
                      hoveredDistance={hoveredTraceDistance}
                      onHoverDistanceChange={setHoveredTraceDistance}
                      zoomWindow={traceZoomWindow}
                      onZoomWindowChange={setTraceZoomWindow}
                      scrubberValue={hoveredTraceDistance}
                      onScrubberValueChange={setHoveredTraceDistance}
                      onResetScrubber={() => setHoveredTraceDistance(null)}
                      compact
                />
              </div>
            </div>
          </article>
        </div>
      ) : null}

      {activeTab === "track-map" ? (
        <div className="grid gap-5">
          <article className="app-panel p-5 telemetry-map-panel">
            <p className="workspace-section-label">Track Map</p>
            <h3 className="mt-2 text-2xl font-semibold">{track?.name || session.event_name || "Track map"}</h3>
            <div className="telemetry-map-stage mt-5">
              {trackMapUrl ? <img alt={`${track.name} map`} className="telemetry-map-image" src={trackMapUrl} /> : <div className="telemetry-map-placeholder"><p className="font-medium">{track?.name || session.event_name}</p><p className="mt-2 text-sm muted">{mapsApiKey ? "Map image unavailable for this track right now." : "Add a Google Static Maps key in Settings to show the track background."}</p></div>}
              <div className="telemetry-map-overlay">
                {projectedTraces.length ? (
                  <svg className="telemetry-trace-svg" viewBox="0 0 1000 600" preserveAspectRatio="none">
                    {projectedTraces.map((driver) => (
                      <polyline
                        key={driver.id}
                        fill="none"
                        points={driver.points}
                        stroke={driver.colour}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeOpacity="0.92"
                        strokeWidth="5"
                      />
                    ))}
                  </svg>
                ) : (
                  <div className="telemetry-overlay-watermark">
                    {telemetryReadiness.gps ? "GPS traces are available, but no driver is selected for overlay." : "Overlay framework ready. Waiting for GPS traces from UniPro exports."}
                  </div>
                )}
              </div>
            </div>
          </article>
          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <article className="app-panel p-5">
              <p className="workspace-section-label">Overlay Controls</p>
              <h3 className="mt-2 text-2xl font-semibold">Driver trace selection</h3>
              <p className="mt-3 text-sm muted">These controls are ready for multi-driver lap overlays. When GPS traces arrive, each selected driver will render on the shared map canvas.</p>
              <div className="mt-5 grid gap-3">
                {driverOverlayRows.length ? driverOverlayRows.map((driver) => {
                  const active = selectedOverlayDrivers.includes(driver.id);
                  return (
                    <button
                      key={driver.id}
                      className={`overlay-driver-row ${active ? "active" : ""}`}
                      onClick={() => setSelectedDrivers((current) => current.includes(driver.id) ? current.filter((item) => item !== driver.id) : [...current, driver.id])}
                      type="button"
                    >
                      <span className="overlay-driver-swatch" style={{ background: driver.colour }} />
                      <span className="font-medium">{driver.name}</span>
                      <span className="pill pill-neutral">{active ? "Selected" : "Hidden"}</span>
                    </button>
                  );
                }) : <p className="muted">No drivers loaded for this session yet.</p>}
              </div>
            </article>
            <article className="app-panel p-5">
              <p className="workspace-section-label">Overlay Calibration</p>
              <h3 className="mt-2 text-2xl font-semibold">Fine-tune the map alignment</h3>
              <p className="mt-3 text-sm muted">UniPro-style GPS overlays usually need a track-specific calibration layer. These controls update the trace live for this track on this browser.</p>
              <div className="mt-5 grid gap-4">
                <CalibrationSlider
                  label="Scale X"
                  min={0.8}
                  max={2.4}
                  step={0.01}
                  value={mapCalibrationDraft.scaleX}
                  onChange={(value) => updateMapCalibration({ scaleX: value })}
                />
                <CalibrationSlider
                  label="Scale Y"
                  min={0.8}
                  max={2.4}
                  step={0.01}
                  value={mapCalibrationDraft.scaleY}
                  onChange={(value) => updateMapCalibration({ scaleY: value })}
                />
                <CalibrationSlider
                  label="Offset X"
                  min={-0.2}
                  max={0.2}
                  step={0.001}
                  value={mapCalibrationDraft.offsetX}
                  onChange={(value) => updateMapCalibration({ offsetX: value })}
                />
                <CalibrationSlider
                  label="Offset Y"
                  min={-0.2}
                  max={0.2}
                  step={0.001}
                  value={mapCalibrationDraft.offsetY}
                  onChange={(value) => updateMapCalibration({ offsetY: value })}
                />
                <CalibrationSlider
                  label="Rotation"
                  min={-12}
                  max={12}
                  step={0.1}
                  value={mapCalibrationDraft.rotationDeg}
                  onChange={(value) => updateMapCalibration({ rotationDeg: value })}
                />
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  className="rounded-xl bg-blue-500 px-4 py-3 text-sm font-medium text-white"
                  onClick={saveMapCalibration}
                  type="button"
                >
                  {calibrationSaved ? "Calibration saved" : "Save calibration"}
                </button>
                <button
                  className="workspace-ghost px-4 py-3 text-sm"
                  onClick={resetMapCalibration}
                  type="button"
                >
                  Reset to default
                </button>
              </div>
              <p className="mt-3 text-sm muted">The saved calibration from this tab is reused by the Speed Traces map.</p>
              <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                <p className="text-sm font-medium">Planned overlay analysis</p>
                <ul className="mt-3 grid gap-2 text-sm muted">
                  <li>- Multi-driver lap traces</li>
                  <li>- Corner entry / apex / exit deltas</li>
                  <li>- Earlier / later braking point detection</li>
                  <li>- Speed-based braking inference and minimum-speed comparison</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                <p className="text-sm font-medium">Selected drivers</p>
                <div className="mt-3 chip-row">
                  {selectedOverlayDrivers.length ? driverOverlayRows.filter((driver) => selectedOverlayDrivers.includes(driver.id)).map((driver) => (
                    <span key={driver.id} className="pill pill-neutral">{driver.name}</span>
                  )) : <span className="pill pill-warn">No drivers selected</span>}
                </div>
              </div>
            </article>
          </div>
        </div>
      ) : null}

      {activeTab === "corner-analysis" ? (
        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <article className="app-panel p-5">
            <p className="workspace-section-label">Corner Framework</p>
            <h3 className="mt-2 text-2xl font-semibold">Corner-by-corner comparison</h3>
            {cornerSelectableDrivers.length ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Corner lap selection</p>
                    <p className="mt-1 text-sm muted">Choose one lap per driver for the corner map and phase comparison.</p>
                  </div>
                  <span className="pill pill-neutral">{cornerTraceEntries.length} lap{cornerTraceEntries.length === 1 ? "" : "s"} loaded</span>
                </div>
                <div className="mt-4 grid gap-4">
                  {cornerSelectableDrivers.map((driver) => {
                    const currentLap = cornerLapByDriver[driver.id] || driver.lapRows.find((lap) => lap.isBest)?.label || driver.lapTraces[0]?.lapLabel || "";
                    return (
                      <div key={`corner-laps-${driver.id}`} className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="overlay-driver-swatch" style={{ background: driver.colour }} />
                            <p className="font-medium text-white">{driver.name}</p>
                          </div>
                          <span className="pill pill-neutral">{currentLap || "No lap selected"}</span>
                        </div>
                        <div className="mt-3 telemetry-lap-chip-grid telemetry-lap-chip-grid-compact">
                          {driver.lapRows.map((lap) => (
                            <button
                              key={`corner-${driver.id}-${lap.label}`}
                              className={`telemetry-lap-chip ${currentLap === lap.label ? "active" : lap.isBest ? "is-best" : ""}`}
                              onClick={() => setCornerLapByDriver((current) => ({ ...current, [driver.id]: lap.label }))}
                              type="button"
                            >
                              {lap.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="mt-5 grid gap-3">
              {displayedCornerRows.length ? displayedCornerRows.map((corner) => (
                <div key={corner.id} className="corner-analysis-row">
                  <div>
                    <p className="font-medium">{corner.name}</p>
                    <p className="mt-1 text-sm muted">
                      {[corner.sector_name, corner.note || "Telemetry-derived comparison from the uploaded PF session traces."].filter(Boolean).join(" / ")}
                    </p>
                    {(corner.referenceEntrySpeed !== null && corner.referenceEntrySpeed !== undefined)
                      || (corner.referenceMinimumSpeed !== null && corner.referenceMinimumSpeed !== undefined)
                      || (corner.referenceExitSpeed !== null && corner.referenceExitSpeed !== undefined) ? (
                        <p className="mt-2 text-xs muted">
                          Reference: {buildCornerReferenceText(corner, normalizedSpeedUnit)}
                        </p>
                      ) : null}
                    {corner.summary ? <p className="mt-3 text-sm text-slate-200">{corner.summary}</p> : null}
                  </div>
                  <div className="corner-analysis-metrics">
                    {corner.metrics.length ? (() => {
                      const winners = buildCornerMetricWinners(corner.metrics);
                      const deltas = buildCornerMetricDeltas(corner.metrics, winners, normalizedSpeedUnit);
                      return corner.metrics.map((metric) => (
                      <CornerPhaseMetricCard
                        key={`${corner.id}-${metric.driver_name}`}
                        metric={metric}
                        winners={winners}
                        deltas={deltas}
                        speedUnit={normalizedSpeedUnit}
                      />
                    ));
                    })() : (
                      <>
                        <CornerMetric label="Entry / apex / exit" value={telemetryReadiness.speed ? "Speed trace ready for phase comparison" : "Awaiting speed trace"} />
                        <CornerMetric label="Brake timing" value={telemetryReadiness.speed ? "Speed-derived brake timing can be inferred" : "Awaiting speed trace"} />
                        <CornerMetric label="Throttle pickup" value={telemetryReadiness.throttle ? "Ready to compare" : "Awaiting throttle trace"} />
                      </>
                    )}
                  </div>
                </div>
              )) : <p className="muted">This track does not have corner entries saved yet. Add corner definitions to the track database to support corner-level analysis.</p>}
            </div>
          </article>
          <article className="app-panel p-5">
            <p className="workspace-section-label">Circuit Map</p>
            <h3 className="mt-2 text-2xl font-semibold">Corner locations on the lap trace</h3>
            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              {cornerMapModel ? (
                <>
                  <div className="corner-track-map">
                    <svg viewBox="0 0 1000 700" className="corner-track-map-svg" role="img" aria-label="Circuit outline built from best lap GPS trace">
                      <path d={cornerMapModel.path} className="corner-track-outline" />
                      {cornerMapModel.markers.map((marker) => (
                        <g
                          key={marker.id}
                          transform={`translate(${marker.x} ${marker.y})`}
                          onMouseEnter={() => setHoveredCornerId(marker.id)}
                          onFocus={() => setHoveredCornerId(marker.id)}
                        >
                          <circle r="18" className={`corner-track-hit ${marker.isActive ? "is-active" : ""}`} />
                          <circle r="8" className={`corner-track-marker ${marker.isActive ? "is-active" : ""}`} />
                          <text y="-20" textAnchor="middle" className="corner-track-label">{marker.shortLabel}</text>
                        </g>
                      ))}
                    </svg>
                  </div>
                  {hoveredCorner ? (
                    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{hoveredCorner.name}</p>
                          <span className="pill pill-neutral">
                            {hoveredCorner.markerDistance !== null && hoveredCorner.markerDistance !== undefined
                              ? `${Math.round(hoveredCorner.markerDistance * 100)}% lap distance`
                              : hoveredCorner.referenceDistance !== null && hoveredCorner.referenceDistance !== undefined
                                ? `${Math.round(hoveredCorner.referenceDistance * 100)}% lap distance`
                                : "Corner marker"}
                          </span>
                        </div>
                        <div className="chip-row">
                          <span className={`pill ${cornerMarkersSaved ? "pill-neutral" : ""}`}>
                            {cornerMarkersSaved ? "Markers saved" : "Unsaved marker changes"}
                          </span>
                          <button className="workspace-ghost px-3 py-2 text-xs" type="button" onClick={saveCornerMarkers}>
                            Save locally
                          </button>
                          <button className="workspace-primary px-3 py-2 text-xs font-medium text-white" type="button" onClick={saveCornerMarkersToTrackDefaults}>
                            Save to track defaults
                          </button>
                          <button className="workspace-ghost px-3 py-2 text-xs" type="button" onClick={resetAllCornerMarkers}>
                            Reset all
                          </button>
                        </div>
                      </div>
                      {hoveredCorner.note ? <p className="mt-2 text-sm muted">{hoveredCorner.note}</p> : null}
                      {hoveredCorner.summary ? <p className="mt-3 text-sm text-slate-200">{hoveredCorner.summary}</p> : null}
                      <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/30 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">Marker adjustment</p>
                            <p className="mt-1 text-xs muted">Nudge this corner earlier or later around the lap, then save the marker layout for this track.</p>
                          </div>
                          <div className="chip-row">
                            <span className="pill pill-neutral">Offset {formatCornerMarkerOffset(cornerMarkerOffsets[hoveredCorner.id] || 0)}</span>
                            <button
                              className="workspace-ghost px-3 py-2 text-xs"
                              type="button"
                              onClick={() => setCornerMarkerEditorOpen((current) => !current)}
                            >
                              {cornerMarkerEditorOpen ? "Hide adjustment" : "Adjust marker"}
                            </button>
                          </div>
                        </div>
                        {cornerMarkerEditorOpen ? (
                          <div className="mt-3 corner-marker-adjust-grid">
                            <button className="workspace-ghost px-3 py-2 text-sm" type="button" onClick={() => nudgeCornerMarker(hoveredCorner.id, -0.01)}>
                              Earlier 1.0%
                            </button>
                            <button className="workspace-ghost px-3 py-2 text-sm" type="button" onClick={() => nudgeCornerMarker(hoveredCorner.id, -0.0025)}>
                              Earlier 0.25%
                            </button>
                            <button className="workspace-ghost px-3 py-2 text-sm" type="button" onClick={() => nudgeCornerMarker(hoveredCorner.id, 0.0025)}>
                              Later 0.25%
                            </button>
                            <button className="workspace-ghost px-3 py-2 text-sm" type="button" onClick={() => nudgeCornerMarker(hoveredCorner.id, 0.01)}>
                              Later 1.0%
                            </button>
                            <button className="workspace-ghost px-3 py-2 text-sm" type="button" onClick={() => resetCornerMarker(hoveredCorner.id)}>
                              Reset this corner
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {cornerMarkerNotice ? <p className="mt-3 text-sm text-emerald-300">{cornerMarkerNotice}</p> : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {hoveredCorner.referenceEntrySpeed !== null && hoveredCorner.referenceEntrySpeed !== undefined ? <span className="pill pill-neutral">Entry {formatSessionSpeed(hoveredCorner.referenceEntrySpeed)}</span> : null}
                        {hoveredCorner.referenceMinimumSpeed !== null && hoveredCorner.referenceMinimumSpeed !== undefined ? <span className="pill pill-neutral">Min {formatSessionSpeed(hoveredCorner.referenceMinimumSpeed)}</span> : null}
                        {hoveredCorner.referenceExitSpeed !== null && hoveredCorner.referenceExitSpeed !== undefined ? <span className="pill pill-neutral">Exit {formatSessionSpeed(hoveredCorner.referenceExitSpeed)}</span> : null}
                      </div>
                      {hoveredCorner.metrics?.length ? (
                        <div className="mt-4 grid gap-3">
                          {hoveredCorner.metrics.map((metric) => (
                            <div key={`${hoveredCorner.id}-${metric.driver_name}`} className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                              <p className="text-sm font-medium text-white">{metric.driver_name}</p>
                              {metric.lap_label ? <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{metric.lap_label}</p> : null}
                              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                <div className="rounded-lg bg-white/5 px-3 py-2">
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Entry</p>
                                  <p className="mt-1 font-semibold text-slate-100">
                                    {metric.entry_speed !== null && metric.entry_speed !== undefined ? formatSessionSpeed(metric.entry_speed) : "n/a"}
                                  </p>
                                </div>
                                <div className="rounded-lg bg-white/5 px-3 py-2">
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Minimum</p>
                                  <p className="mt-1 font-semibold text-slate-100">
                                    {metric.minimum_speed !== null && metric.minimum_speed !== undefined ? formatSessionSpeed(metric.minimum_speed) : "n/a"}
                                  </p>
                                </div>
                                <div className="rounded-lg bg-white/5 px-3 py-2">
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Exit</p>
                                  <p className="mt-1 font-semibold text-slate-100">
                                    {metric.exit_speed !== null && metric.exit_speed !== undefined ? formatSessionSpeed(metric.exit_speed) : "n/a"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-medium">Track outline unavailable</p>
                  <p className="mt-2 text-sm muted">
                    {telemetryReadiness.gps
                      ? "GPS trace data exists, but there is not yet a usable best-lap outline for this session."
                      : "Upload a UniPro session with GPS trace data to build the circuit outline and corner markers."}
                  </p>
                </div>
              )}
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-medium">Current readiness</p>
              <p className="mt-2 text-sm muted">
                {cornerAnalysis.length
                  ? "This session includes speed-based corner detection and inferred braking-onset comparison from the uploaded UniPro traces."
                  : telemetryReadiness.gps || telemetryReadiness.speed || telemetryReadiness.brake || telemetryReadiness.throttle
                  ? "Some telemetry channels are present, so this session is partially ready for deeper corner analysis."
                  : "This session currently only supports structural preparation. Upload GPS and time-series telemetry data to activate real corner deltas and braking-point comparison."}
              </p>
            </div>
          </article>
        </div>
      ) : null}

      {activeTab === "debrief" ? (
        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="app-panel p-5 printable-debrief-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="workspace-section-label">Session Debrief</p>
                <h3 className="mt-2 text-2xl font-semibold">Printable coaching summary</h3>
              </div>
              <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" type="button" onClick={() => window.print()}>
                Print debrief
              </button>
            </div>
            <div className="mt-5 grid gap-5">
              <div className="workspace-subtle-card p-4">
                <p className="text-sm font-medium">Best lap summary</p>
                <div className="mt-3 grid gap-2">
                  {sessionBestRows.map((driver, index) => (
                    <div key={`${driver.id}-debrief-best`} className="session-debrief-row">
                      <span>{index + 1}. {driver.name}</span>
                      <span>{formatMetric(driver.bestLap, 3)}{index > 0 ? ` (${driver.bestLap && sessionBestRows[0]?.bestLap ? `+${(driver.bestLap - sessionBestRows[0].bestLap).toFixed(3)}s` : ""})` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="workspace-subtle-card p-4">
                <p className="text-sm font-medium">Sector delta summary</p>
                <div className="mt-3 grid gap-2">
                  {sectorAnalysis.map((sector) => (
                    <div key={`${sector.sector_name}-debrief`} className="session-debrief-row">
                      <span>{sector.sector_name}</span>
                      <span>{sector.fastest_driver ? `${sector.fastest_driver} ${formatMetric(sector.fastest_time, 3)}s` : "-"}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="workspace-subtle-card p-4">
                <p className="text-sm font-medium">Coach notes</p>
                <div className="mt-3 grid gap-3">
                  {coachingNotes.length ? coachingNotes.map((note) => (
                    <div key={note.id} className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{note.title}</p>
                          <p className="text-sm muted">{note.driver_name || "Whole session"} / {note.updated_at || note.created_at}</p>
                        </div>
                        <button className="workspace-ghost px-3 py-2 text-xs" type="button" onClick={() => onDeleteCoachingNote?.(note.id)}>Delete</button>
                      </div>
                      <p className="mt-3 text-sm">{note.body}</p>
                      {note.next_actions?.length ? (
                        <ul className="mt-3 grid gap-2 text-sm muted">
                          {note.next_actions.map((item) => <li key={`${note.id}-${item}`}>- {item}</li>)}
                        </ul>
                      ) : null}
                    </div>
                  )) : <p className="muted">No manual coaching notes added yet.</p>}
                </div>
              </div>

              <div className="workspace-subtle-card p-4">
                <p className="text-sm font-medium">Next actions from AI reports</p>
                <div className="mt-3 grid gap-3">
                  {reports.length ? reports.flatMap((entry) => entry.reports || []).slice(0, 4).map((report, index) => (
                    <div key={`debrief-report-${index}`} className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                      <p className="font-medium">{report.canonical_driver_name || report.driver_name}</p>
                      <p className="mt-2 text-sm">{report.overall_summary}</p>
                      <ul className="mt-3 grid gap-2 text-sm muted">
                        {(report.action_points || []).slice(0, 3).map((item) => <li key={`${report.driver_name}-${item}`}>- {item}</li>)}
                      </ul>
                    </div>
                  )) : <p className="muted">Generate feedback to pull AI action points into the debrief page.</p>}
                </div>
              </div>
            </div>
          </article>

          <article className="app-panel p-5">
            <p className="workspace-section-label">Manual Coaching Notes</p>
            <h3 className="mt-2 text-2xl font-semibold">Add notes to the session or a driver</h3>
            <div className="mt-5 grid gap-3">
              <select className="workspace-select" value={noteDraft.driver_id} onChange={(event) => setNoteDraft((current) => ({ ...current, driver_id: event.target.value }))}>
                <option value="">Whole session</option>
                {telemetryDriverRows.map((driver) => (
                  <option key={`note-driver-${driver.id}`} value={driver.id}>{driver.name}</option>
                ))}
              </select>
              <input
                className="workspace-input"
                placeholder="Note title"
                value={noteDraft.title}
                onChange={(event) => setNoteDraft((current) => ({ ...current, title: event.target.value }))}
              />
              <textarea
                className="workspace-textarea"
                placeholder="Coaching note"
                rows={6}
                value={noteDraft.body}
                onChange={(event) => setNoteDraft((current) => ({ ...current, body: event.target.value }))}
              />
              <textarea
                className="workspace-textarea"
                placeholder={"Next actions, one per line"}
                rows={4}
                value={noteDraft.next_actions}
                onChange={(event) => setNoteDraft((current) => ({ ...current, next_actions: event.target.value }))}
              />
              <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" type="button" onClick={handleNoteSave}>
                Save coaching note
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {activeTab === "reports" ? (
        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="app-panel p-5">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="workspace-section-label">Publishing</p>
                <h3 className="mt-2 text-2xl font-semibold">Session publishing and sharing</h3>
              </div>
              <div className="chip-row">
                <button className="workspace-ghost px-4 py-3 text-sm" onClick={onOpenReportStudio} type="button">
                  Open report studio
                </button>
                <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" onClick={onExportPdf} type="button" disabled={loading}>
                  Export PDF
                </button>
              </div>
            </div>
            <div className="mt-5 grid gap-4">
              {reports.length ? reports.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  {(() => {
                    const publishConfig = sessionPublishConfig(entry.audience);
                    return (
                      <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{publishConfig.title}</p>
                      <p className="text-sm muted">{formatPortalTimestamp(entry.created_at)} / {entry.provider} / {entry.model}</p>
                    </div>
                    <div className="chip-row">
                      <span className="pill">{entry.status || "draft"}</span>
                      {entry.visible_to_driver ? <span className="pill pill-neutral">Driver visible</span> : null}
                      {entry.visible_to_parent ? <span className="pill pill-neutral">Parent visible</span> : null}
                      {!entry.visible_to_driver && !entry.visible_to_parent && entry.status === "reviewed" ? <span className="pill pill-neutral">Internal only</span> : null}
                      {entry.reviewed_at ? <span className="pill pill-neutral">Reviewed {formatPortalTimestamp(entry.reviewed_at)}</span> : null}
                      {entry.published_at ? <span className="pill pill-neutral">Published {formatPortalTimestamp(entry.published_at)}</span> : null}
                    </div>
                  </div>
                  {entry.review_note ? (
                    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm font-medium">Review note</p>
                      <p className="mt-2 text-sm muted">{entry.review_note}</p>
                    </div>
                  ) : null}
                  <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/30 p-4">
                    <p className="text-sm font-medium">Workflow actions</p>
                    <p className="mt-2 text-sm muted">
                      {entry.audience === "coach"
                        ? "Keep this internal until the coach version is signed off."
                        : entry.audience === "driver"
                          ? "Share this only when the driver-facing wording and actions are ready."
                          : "Share this only when the parent-facing summary is ready for family viewing."}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        className="workspace-primary px-4 py-3 text-sm font-medium text-white"
                        onClick={() => onPublishReport(entry.id, { ...publishConfig.publishPayload, review_note: entry.review_note || "" })}
                        type="button"
                      >
                        {publishConfig.publishLabel}
                      </button>
                      {(entry.audience === "coach"
                        || (entry.audience === "driver" && (entry.visible_to_driver || entry.status === "published"))
                        || (entry.audience === "parent" && (entry.visible_to_parent || entry.status === "published"))) ? (
                        <button
                          className="workspace-ghost px-4 py-3 text-sm"
                          onClick={() => onPublishReport(entry.id, { ...publishConfig.unpublishPayload, review_note: entry.review_note || "" })}
                          type="button"
                        >
                          {publishConfig.unpublishLabel}
                        </button>
                      ) : null}
                      </div>
                    </div>
                      </>
                    );
                  })()}
                </div>
              )) : (
                <div className="workspace-subtle-card p-5">
                  <p className="font-medium">No reports generated yet.</p>
                  <p className="mt-2 text-sm muted">Generate feedback here for a quick session report, or open Report Studio for the full builder workspace.</p>
                </div>
              )}
            </div>
          </article>
          <div className="grid gap-5">
            <article className="app-panel p-5">
              <p className="workspace-section-label">AI Debrief</p>
              <h3 className="mt-2 text-2xl font-semibold">Feedback generation</h3>
              <p className="mt-3 text-sm muted">Use the current local Ollama model to generate coach, driver, and parent-facing feedback once the deterministic analysis is in place.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" onClick={onGenerateFeedback} type="button" disabled={loading}>
                  {loading ? "Generating..." : "Generate feedback"}
                </button>
                <button className="workspace-ghost px-4 py-3 text-sm" onClick={onExportPdf} type="button" disabled={loading}>Export PDF</button>
              </div>
            </article>
            {reports.length ? <SavedReportsPanel reports={reports} /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PortalMetric({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
      <p className="text-xs muted">{label}</p>
      <p className="mt-1 font-medium">{value ?? "-"}</p>
    </div>
  );
}

function TelemetryStatusCard({ label, ready, detail }) {
  return (
    <div className={`telemetry-status-card ${ready ? "ready" : "pending"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">{label}</p>
        <span className={`pill ${ready ? "" : "pill-warn"}`}>{ready ? "Ready" : "Waiting"}</span>
      </div>
      <p className="mt-2 text-sm muted">{detail}</p>
    </div>
  );
}

function CornerMetric({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
      <p className="text-xs muted">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function CornerPhaseMetricCard({ metric, winners = {}, deltas = {}, speedUnit = "kmh" }) {
  const rows = [
    { key: "entry_speed", label: "Entry", value: metric.entry_speed !== null && metric.entry_speed !== undefined ? formatDisplaySpeed(metric.entry_speed, speedUnit) : "n/a" },
    { key: "minimum_speed", label: "Min", value: metric.minimum_speed !== null && metric.minimum_speed !== undefined ? formatDisplaySpeed(metric.minimum_speed, speedUnit) : "n/a" },
    { key: "exit_speed", label: "Exit", value: metric.exit_speed !== null && metric.exit_speed !== undefined ? formatDisplaySpeed(metric.exit_speed, speedUnit) : "n/a" },
    { key: "brake_start_distance", label: "Brake", value: metric.brake_start_distance !== null && metric.brake_start_distance !== undefined ? (metric.braking_relative || "Inferred") : "Not inferred" },
    { key: "corner_time", label: "Corner Time", value: metric.corner_time !== null && metric.corner_time !== undefined ? `${formatMetric(metric.corner_time, 3)}s` : "n/a" },
    { key: "speed_drop", label: "Speed Drop", value: metric.speed_drop !== null && metric.speed_drop !== undefined ? formatDisplaySpeed(metric.speed_drop, speedUnit) : "n/a" },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
      <p className="text-xs muted">{metric.driver_name}</p>
      <div className="mt-2 grid gap-2">
        {rows.map((row) => (
          <div key={row.label} className={`flex items-center justify-between gap-3 text-sm ${winners[row.key] === metric.driver_name ? "corner-metric-best" : ""}`}>
            <span className="muted">{row.label}</span>
            <span className="font-medium text-right">{row.value}</span>
          </div>
        ))}
      </div>
      {deltas[metric.driver_name]?.length ? (
        <div className="mt-3 rounded-lg bg-white/5 p-2 text-xs text-slate-200">
          {deltas[metric.driver_name].map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function buildCornerReferenceText(corner, speedUnit = "kmh") {
  const parts = [];
  if (corner.referenceEntrySpeed !== null && corner.referenceEntrySpeed !== undefined) {
    parts.push(`Entry ${formatDisplaySpeed(corner.referenceEntrySpeed, speedUnit)}`);
  }
  if (corner.referenceMinimumSpeed !== null && corner.referenceMinimumSpeed !== undefined) {
    parts.push(`Min ${formatDisplaySpeed(corner.referenceMinimumSpeed, speedUnit)}`);
  }
  if (corner.referenceExitSpeed !== null && corner.referenceExitSpeed !== undefined) {
    parts.push(`Exit ${formatDisplaySpeed(corner.referenceExitSpeed, speedUnit)}`);
  }
  return parts.join(" / ");
}

function buildCornerMetricWinners(metrics) {
  return {
    entry_speed: selectCornerMetricWinner(metrics, "entry_speed", "max"),
    minimum_speed: selectCornerMetricWinner(metrics, "minimum_speed", "max"),
    exit_speed: selectCornerMetricWinner(metrics, "exit_speed", "max"),
    brake_start_distance: selectCornerMetricWinner(metrics, "brake_start_distance", "max"),
    corner_time: selectCornerMetricWinner(metrics, "corner_time", "min"),
    speed_drop: selectCornerMetricWinner(metrics, "speed_drop", "min"),
  };
}

function selectCornerMetricWinner(metrics, field, mode) {
  const valid = metrics.filter((metric) => Number.isFinite(metric?.[field]));
  if (!valid.length) return null;
  const winner = valid.reduce((best, metric) => {
    if (!best) return metric;
    return mode === "min"
      ? metric[field] < best[field] ? metric : best
      : metric[field] > best[field] ? metric : best;
  }, null);
  return winner?.driver_name || null;
}

function buildCornerMetricDeltas(metrics, winners, speedUnit = "kmh") {
  const byName = Object.fromEntries(metrics.map((metric) => [metric.driver_name, metric]));
  return Object.fromEntries(metrics.map((metric) => {
    const lines = [];
    const exitWinnerName = winners.exit_speed;
    const timeWinnerName = winners.corner_time;
    const minWinnerName = winners.minimum_speed;

    if (exitWinnerName && exitWinnerName !== metric.driver_name) {
      const winner = byName[exitWinnerName];
      if (Number.isFinite(metric.exit_speed) && Number.isFinite(winner?.exit_speed)) {
        const delta = metric.exit_speed - winner.exit_speed;
        lines.push(`${delta >= 0 ? "+" : ""}${formatDisplaySpeed(delta, speedUnit, 2)} ${getDisplaySpeedUnit(speedUnit)} on exit vs ${exitWinnerName}`);
      }
    }

    if (timeWinnerName && timeWinnerName !== metric.driver_name) {
      const winner = byName[timeWinnerName];
      if (Number.isFinite(metric.corner_time) && Number.isFinite(winner?.corner_time)) {
        const delta = metric.corner_time - winner.corner_time;
        lines.push(`${delta >= 0 ? "+" : ""}${formatMetric(delta, 3)}s through this corner vs ${timeWinnerName}`);
      }
    }

    if (minWinnerName && minWinnerName !== metric.driver_name) {
      const winner = byName[minWinnerName];
      if (Number.isFinite(metric.minimum_speed) && Number.isFinite(winner?.minimum_speed)) {
        const delta = metric.minimum_speed - winner.minimum_speed;
        lines.push(`${delta >= 0 ? "+" : ""}${formatDisplaySpeed(delta, speedUnit, 2)} ${getDisplaySpeedUnit(speedUnit)} at minimum speed vs ${minWinnerName}`);
      }
    }

    return [metric.driver_name, lines.slice(0, 2)];
  }));
}

function buildCornerTrackMapModel(trace, cornerRows, hoveredCornerId) {
  if (!trace?.length) return null;
  const points = trace
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon))
    .map((point) => ({ lat: point.lat, lon: point.lon, normalized_distance: point.normalized_distance }));
  if (points.length < 8) return null;

  const viewWidth = 1000;
  const viewHeight = 700;
  const padding = 70;
  const minLat = Math.min(...points.map((point) => point.lat));
  const maxLat = Math.max(...points.map((point) => point.lat));
  const minLon = Math.min(...points.map((point) => point.lon));
  const maxLon = Math.max(...points.map((point) => point.lon));
  const lonSpan = Math.max(maxLon - minLon, 0.000001);
  const latSpan = Math.max(maxLat - minLat, 0.000001);
  const scale = Math.min((viewWidth - (padding * 2)) / lonSpan, (viewHeight - (padding * 2)) / latSpan);

  const rawProjected = points.map((point) => ({
    x: padding + ((point.lon - minLon) * scale),
    y: viewHeight - padding - ((point.lat - minLat) * scale),
    normalized_distance: point.normalized_distance,
  }));
  const projected = fitProjectedTrackToView(rawProjected, viewWidth, viewHeight);
  const path = projected.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const markers = cornerRows
    .filter((corner) => Number.isFinite(corner.markerDistance ?? corner.referenceDistance))
    .map((corner, index) => {
      const point = interpolateOutlinePoint(projected, corner.markerDistance ?? corner.referenceDistance);
      if (!point) return null;
      return {
        id: corner.id,
        x: point.x,
        y: point.y,
        shortLabel: `${index + 1}`,
        isActive: corner.id === hoveredCornerId,
      };
    })
    .filter(Boolean);

  return { path, markers };
}

function applyCornerMarkerOffset(referenceDistance, offset = 0) {
  if (!Number.isFinite(referenceDistance)) return null;
  const numericOffset = Number.isFinite(offset) ? offset : 0;
  return Math.max(0, Math.min(1, Number((referenceDistance + numericOffset).toFixed(6))));
}

function formatCornerMarkerOffset(offset = 0) {
  const percent = (offset || 0) * 100;
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`;
}

function fitProjectedTrackToView(points, viewWidth, viewHeight) {
  if (!points?.length) return [];
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const targetPadding = 28;
  const scale = Math.min((viewWidth - (targetPadding * 2)) / width, (viewHeight - (targetPadding * 2)) / height);
  const offsetX = ((viewWidth - (width * scale)) / 2) - (minX * scale);
  const offsetY = ((viewHeight - (height * scale)) / 2) - (minY * scale);
  return points.map((point) => ({
    ...point,
    x: point.x * scale + offsetX,
    y: point.y * scale + offsetY,
  }));
}

function interpolateOutlinePoint(trace, distance) {
  if (!trace?.length || !Number.isFinite(distance)) return null;
  if (distance <= (trace[0].normalized_distance ?? 0)) return trace[0];
  const last = trace[trace.length - 1];
  if (distance >= (last.normalized_distance ?? 1)) return last;
  for (let index = 1; index < trace.length; index += 1) {
    const previous = trace[index - 1];
    const next = trace[index];
    if (distance <= next.normalized_distance) {
      const span = Math.max((next.normalized_distance ?? 0) - (previous.normalized_distance ?? 0), 1e-9);
      const ratio = (distance - previous.normalized_distance) / span;
      return {
        x: previous.x + ((next.x - previous.x) * ratio),
        y: previous.y + ((next.y - previous.y) * ratio),
        normalized_distance: distance,
      };
    }
  }
  return last;
}

function buildCornerTraceEntries(drivers, cornerLapByDriver) {
  return drivers
    .map((driver) => {
      const available = driver.lapTraces || [];
      if (!available.length) return null;
      const requestedLabel = cornerLapByDriver[driver.id] || driver.lapRows.find((lap) => lap.isBest)?.label || available[0]?.lapLabel;
      const lap = available.find((item) => item.lapLabel === requestedLabel) || available[0];
      if (!lap?.trace?.length) return null;
      return {
        id: `${driver.id}-${lap.lapLabel}`,
        driverId: driver.id,
        driverName: driver.name,
        colour: driver.colour,
        lapLabel: lap.lapLabel,
        lapTime: lap.lapTime,
        trace: lap.trace,
      };
    })
    .filter(Boolean);
}

function resolveCornerMapTrace(cornerTraceEntries, sessionBestRows) {
  if (cornerTraceEntries.length) {
    const bestEntry = [...cornerTraceEntries]
      .filter((entry) => Number.isFinite(entry.lapTime))
      .sort((a, b) => a.lapTime - b.lapTime)[0];
    return bestEntry?.trace || cornerTraceEntries[0]?.trace || [];
  }
  return sessionBestRows.find((driver) => (driver.bestLapTrace || []).length > 10)?.bestLapTrace || [];
}

function buildDynamicCornerRows(baseRows, cornerTraceEntries) {
  if (!baseRows.length || !cornerTraceEntries.length) return [];
  const referenceEntry = [...cornerTraceEntries]
    .filter((entry) => Number.isFinite(entry.lapTime))
    .sort((left, right) => left.lapTime - right.lapTime)[0] || cornerTraceEntries[0] || null;
  return baseRows.map((corner) => {
    if (!Number.isFinite(corner.referenceDistance)) {
      return corner;
    }
    const metrics = cornerTraceEntries
      .map((entry) => buildCornerMetricFromTrace(entry, corner.referenceDistance))
      .filter(Boolean);
    const referenceMetric = referenceEntry
      ? metrics.find((metric) => metric.driver_name === referenceEntry.driverName && metric.lap_label === referenceEntry.lapLabel)
      : null;
    return {
      ...corner,
      metrics,
      markerDistance: corner.referenceDistance,
      summary: metrics.length ? buildCornerSummary(metrics) : corner.summary,
    };
  });
}

function buildCornerMetricFromTrace(entry, referenceDistance) {
  const trace = entry.trace || [];
  const points = trace.filter((point) => Number.isFinite(point?.speed) && Number.isFinite(point?.normalized_distance));
  if (points.length < 20) return null;
  const nearby = points
    .map((point, index) => ({ ...point, index }))
    .filter((point) => Math.abs(point.normalized_distance - referenceDistance) <= 0.035);
  if (!nearby.length) return null;
  const apex = nearby.reduce((best, point) => (point.speed < best.speed ? point : best), nearby[0]);
  const phaseWindow = inferCornerPhaseWindow(points, apex);
  return {
    driver_name: entry.driverName,
    lap_label: entry.lapLabel,
    entry_speed: phaseWindow.entry_speed,
    minimum_speed: Number.isFinite(apex.speed) ? Number(apex.speed) : null,
    exit_speed: phaseWindow.exit_speed,
    brake_start_distance: phaseWindow.brake_start_distance,
    corner_time: phaseWindow.corner_time,
    speed_drop: phaseWindow.speed_drop,
    braking_relative: phaseWindow.brake_start_distance !== null && phaseWindow.brake_start_distance !== undefined ? "Inferred" : null,
  };
}

function inferCornerPhaseWindow(points, apex) {
  const apexIndex = points.findIndex((point) => point.normalized_distance === apex.normalized_distance && point.speed === apex.speed);
  if (apexIndex < 0) {
    return {};
  }
  const entrySlice = points.slice(Math.max(0, apexIndex - 22), apexIndex + 1);
  const exitSlice = points.slice(apexIndex, Math.min(points.length, apexIndex + 23));
  if (!entrySlice.length || !exitSlice.length) {
    return {};
  }
  const entryPoint = entrySlice.reduce((best, point) => (point.speed > best.speed ? point : best), entrySlice[0]);
  const exitThreshold = apex.speed + Math.max(3, (entryPoint.speed - apex.speed) * 0.45);
  let exitPoint = exitSlice.find((point, index) => index > 0 && point.speed >= exitThreshold) || null;
  if (!exitPoint) {
    exitPoint = exitSlice.reduce((best, point) => (point.speed > best.speed ? point : best), exitSlice[0]);
  }
  const brakeStartDistance = inferBrakeStartDistance(points, apex);
  const cornerTime = Number.isFinite(entryPoint.elapsed) && Number.isFinite(exitPoint.elapsed) && exitPoint.elapsed >= entryPoint.elapsed
    ? Number((exitPoint.elapsed - entryPoint.elapsed).toFixed(4))
    : null;
  return {
    entry_speed: Number.isFinite(entryPoint.speed) ? Number(entryPoint.speed) : null,
    exit_speed: Number.isFinite(exitPoint.speed) ? Number(exitPoint.speed) : null,
    brake_start_distance: brakeStartDistance,
    corner_time: cornerTime,
    speed_drop: Number.isFinite(entryPoint.speed) && Number.isFinite(apex.speed) ? Number((entryPoint.speed - apex.speed).toFixed(3)) : null,
  };
}

function inferBrakeStartDistance(points, apex) {
  const apexIndex = points.findIndex((point) => point.normalized_distance === apex.normalized_distance && point.speed === apex.speed);
  if (apexIndex < 3) return null;
  const lookback = points.slice(Math.max(0, apexIndex - 18), apexIndex + 1);
  if (lookback.length < 4) return null;
  const peakSpeed = Math.max(...lookback.map((point) => point.speed));
  const threshold = Math.max(2.5, peakSpeed * 0.035);
  const brakePoint = lookback.find((point) => peakSpeed - point.speed >= threshold);
  return brakePoint ? Number(brakePoint.normalized_distance.toFixed(6)) : Number(lookback[0].normalized_distance.toFixed(6));
}

function buildCornerSummary(metrics) {
  if (!metrics.length) return "";
  const laterBraker = metrics.filter((metric) => Number.isFinite(metric.brake_start_distance)).sort((a, b) => b.brake_start_distance - a.brake_start_distance)[0];
  const higherMin = metrics.filter((metric) => Number.isFinite(metric.minimum_speed)).sort((a, b) => b.minimum_speed - a.minimum_speed)[0];
  const strongerExit = metrics.filter((metric) => Number.isFinite(metric.exit_speed)).sort((a, b) => b.exit_speed - a.exit_speed)[0];
  const parts = [];
  if (laterBraker) parts.push(`${laterBraker.driver_name} brakes latest`);
  if (higherMin) parts.push(`${higherMin.driver_name} carries the best minimum speed`);
  if (strongerExit && strongerExit.driver_name !== higherMin?.driver_name) parts.push(`${strongerExit.driver_name} has the strongest exit`);
  return parts.join(". ") + (parts.length ? "." : "");
}

function CalibrationSlider({ label, min, max, step, value, onChange }) {
  return (
    <label className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-white">{label}</span>
        <span className="text-xs muted">{Number(value).toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : 1)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function buildLapRows(lapTable) {
  const validRows = (lapTable || [])
    .map((lap, index) => ({
      lapNumber: lap.lap_number || index + 1,
      time: typeof lap.lap_time === "number" ? lap.lap_time : Number(lap.lap_time),
      topSpeed: typeof lap.top_speed === "number" ? lap.top_speed : Number(lap.top_speed),
      maxRpm: typeof lap.max_rpm === "number" ? lap.max_rpm : Number(lap.max_rpm),
    }))
    .filter((lap) => Number.isFinite(lap.time));

  const bestLap = validRows.reduce((best, lap) => Math.min(best, lap.time), Number.POSITIVE_INFINITY);
  return validRows.map((lap) => ({
    label: `L${lap.lapNumber}`,
    lapNumber: lap.lapNumber,
    time: lap.time,
    delta: lap.time - bestLap,
    isBest: lap.time === bestLap,
    topSpeed: Number.isFinite(lap.topSpeed) ? lap.topSpeed : null,
    maxRpm: Number.isFinite(lap.maxRpm) ? lap.maxRpm : null,
  }));
}

function calculateAverageLap(lapTable) {
  const rows = buildLapRows(lapTable);
  if (!rows.length) {
    return null;
  }
  return rows.reduce((sum, lap) => sum + lap.time, 0) / rows.length;
}

function calculateConsistency(lapRows) {
  if (!lapRows?.length || lapRows.length < 2) {
    return 0;
  }
  const average = lapRows.reduce((sum, lap) => sum + lap.time, 0) / lapRows.length;
  const variance = lapRows.reduce((sum, lap) => sum + ((lap.time - average) ** 2), 0) / lapRows.length;
  return Math.sqrt(variance);
}

function maxLapField(lapRows, field) {
  const values = (lapRows || [])
    .map((lap) => lap[field])
    .filter((value) => Number.isFinite(value));
  if (!values.length) {
    return null;
  }
  return Math.max(...values);
}

function toggleSelection(currentItems, item, allItems) {
  if (currentItems.includes(item)) {
    const next = currentItems.filter((entry) => entry !== item);
    return next.length === allItems.length ? [] : next;
  }
  const next = [...currentItems, item];
  return next.length === allItems.length ? [] : next;
}

function filterDriverBySelectedLaps(driver, selectedLapLabels) {
  if (!selectedLapLabels?.length) {
    return driver;
  }
  return {
    ...driver,
    lapRows: driver.lapRows.filter((lap) => selectedLapLabels.includes(lap.label)),
  };
}

function applySelectedLapSelection(driver, selectedLapLabels) {
  const filtered = filterDriverBySelectedLaps(driver, selectedLapLabels);
  const lapRows = filtered.lapRows || [];
  const bestLap = lapRows.length ? Math.min(...lapRows.map((lap) => lap.time)) : driver.bestLap;
  return {
    ...filtered,
    bestLap,
    averageLap: lapRows.length ? lapRows.reduce((sum, lap) => sum + lap.time, 0) / lapRows.length : null,
    topSpeed: maxLapField(lapRows, "topSpeed") ?? driver.topSpeed,
    maxRpm: maxLapField(lapRows, "maxRpm") ?? driver.maxRpm,
    consistency: calculateConsistency(lapRows),
    lapCount: lapRows.length,
  };
}

function filterSectorAnalysisForDrivers(sectors, driverIds) {
  if (!driverIds?.length) {
    return sectors || [];
  }
  return (sectors || [])
    .map((sector) => {
      const drivers = (sector.drivers || []).filter((driver) => driverIds.includes(driver.driver_id || driver.driver_name));
      if (!drivers.length) {
        return null;
      }
      const fastestTime = Math.min(...drivers.map((driver) => driver.time));
      const fastest = drivers.find((driver) => driver.time === fastestTime);
      return {
        ...sector,
        fastest_driver: fastest?.driver_name || sector.fastest_driver,
        fastest_time: fastestTime,
        drivers: drivers.map((driver) => ({
          ...driver,
          delta_to_fastest: driver.time - fastestTime,
        })),
      };
    })
    .filter(Boolean);
}

function buildSelectedTraceEntries(drivers, selectedLapsByDriver) {
  return drivers.flatMap((driver) => {
    const available = driver.lapTraces || [];
    if (!available.length) {
      return [];
    }
    const selected = selectedLapsByDriver[driver.id] || [];
    const chosen = selected.length
      ? available.filter((lap) => selected.includes(lap.lapLabel))
      : [];
    return chosen.map((lap) => ({
      id: `${driver.id}-${lap.lapLabel}`,
      driverId: driver.id,
      name: `${driver.name} ${lap.lapLabel}`,
      colour: driver.colour,
      lapLabel: lap.lapLabel,
      lapTime: lap.lapTime,
      trace: lap.trace || [],
    }));
  });
}

function buildTraceMetricSeries(entries, channelKey) {
  return entries
    .map((entry) => ({
      id: entry.id,
      label: entry.name,
      colour: entry.colour,
      points: (entry.trace || [])
        .filter((point) => Number.isFinite(point?.normalized_distance) && Number.isFinite(point?.[channelKey]))
        .map((point) => ({
          x: point.normalized_distance,
          y: point[channelKey],
        })),
    }))
    .filter((entry) => entry.points.length > 1);
}

function resolveReferenceTraceEntry(entries) {
  if (!entries.length) {
    return null;
  }
  return entries[0];
}

function buildTraceDeltaSeries(entries, reference) {
  if (!entries.length || !reference?.trace?.length) {
    return [];
  }

  const distances = Array.from({ length: 161 }, (_, index) => index / 160);
  return entries.map((entry) => ({
    id: entry.id,
    label: entry.name,
    colour: entry.colour,
    points: distances.map((distance) => {
      const referenceElapsed = interpolateTraceValue(reference.trace, "elapsed", distance);
      const elapsed = interpolateTraceValue(entry.trace, "elapsed", distance);
      if (!Number.isFinite(referenceElapsed) || !Number.isFinite(elapsed)) {
        return null;
      }
      return {
        x: distance,
        y: elapsed - referenceElapsed,
      };
    }).filter(Boolean),
  })).filter((entry) => entry.points.length > 1);
}

function buildPlaybackReadout(entries, distance, channelKey, reference, speedUnit = "kmh") {
  if (distance === null || distance === undefined) {
    return [];
  }
  const referenceElapsed = reference ? interpolateTraceValue(reference.trace, "elapsed", distance) : null;
  return entries.map((entry) => {
    const channelValue = interpolateTraceValue(entry.trace, channelKey, distance);
    const elapsed = interpolateTraceValue(entry.trace, "elapsed", distance);
    const delta = Number.isFinite(referenceElapsed) && Number.isFinite(elapsed) ? elapsed - referenceElapsed : null;
    return {
      id: entry.id,
      name: entry.name,
      colour: entry.colour,
      lapLabel: entry.lapLabel,
      channelValueText: Number.isFinite(channelValue)
        ? (
          channelKey === "speed"
            ? `${formatDisplaySpeed(channelValue, speedUnit, 3)} ${getDisplaySpeedUnit(speedUnit)}`
            : formatMetric(channelValue, 3)
        )
        : "n/a",
      elapsedText: Number.isFinite(elapsed) ? `${formatMetric(elapsed, 3)}s` : "n/a",
      deltaText: Number.isFinite(delta) ? `${delta >= 0 ? "+" : ""}${formatMetric(delta, 3)}s` : "ref",
    };
  });
}

function buildPlaybackMarkers(entries, distance, viewport, calibration) {
  if (distance === null || distance === undefined) {
    return [];
  }
  return entries
    .map((entry) => {
      const point = interpolateTracePoint(entry.trace, distance);
      if (!point) {
        return null;
      }
      const projected = projectTracePointsToStage([point], viewport, 1000, 600, calibration)[0];
      if (!projected) {
        return null;
      }
      return {
        id: entry.id,
        colour: entry.colour,
        x: projected.x,
        y: projected.y,
      };
    })
    .filter(Boolean);
}

function interpolateTracePoint(trace, distance) {
  if (!trace?.length) {
    return null;
  }
  if (distance <= trace[0].normalized_distance) {
    return trace[0];
  }
  if (distance >= trace[trace.length - 1].normalized_distance) {
    return trace[trace.length - 1];
  }
  for (let index = 1; index < trace.length; index += 1) {
    const previous = trace[index - 1];
    const next = trace[index];
    if (distance <= next.normalized_distance) {
      const span = Math.max(next.normalized_distance - previous.normalized_distance, 1e-9);
      const ratio = (distance - previous.normalized_distance) / span;
      return {
        normalized_distance: distance,
        lat: previous.lat + ((next.lat - previous.lat) * ratio),
        lon: previous.lon + ((next.lon - previous.lon) * ratio),
        speed: interpolateNumber(previous.speed, next.speed, ratio),
        rpm: interpolateNumber(previous.rpm, next.rpm, ratio),
        steering: interpolateNumber(previous.steering, next.steering, ratio),
        lateral_g: interpolateNumber(previous.lateral_g, next.lateral_g, ratio),
        longitudinal_g: interpolateNumber(previous.longitudinal_g, next.longitudinal_g, ratio),
        elapsed: interpolateNumber(previous.elapsed, next.elapsed, ratio),
      };
    }
  }
  return trace[trace.length - 1];
}

function interpolateTraceValue(trace, field, distance) {
  const point = interpolateTracePoint(trace, distance);
  return point ? point[field] : null;
}

function interpolateNumber(previous, next, ratio) {
  if (!Number.isFinite(previous) && !Number.isFinite(next)) {
    return null;
  }
  if (!Number.isFinite(previous)) {
    return next;
  }
  if (!Number.isFinite(next)) {
    return previous;
  }
  return previous + ((next - previous) * ratio);
}

const DRIVER_TRACE_COLOURS = ["#5d8fff", "#55d6be", "#ffd447", "#ff7b72", "#a78bfa", "#60a5fa"];
const LAP_METRIC_CHANNELS = [
  {
    id: "time",
    label: "Lap Time",
    chartTitle: "Lap Time Graph",
    description: "Plot the selected laps by lap time.",
    unit: "s",
  },
  {
    id: "delta",
    label: "Lap Delta",
    chartTitle: "Lap Delta Graph",
    description: "Plot how far the selected laps sit away from each driver's best lap.",
    unit: "s",
  },
  {
    id: "topSpeed",
    label: "Top Speed",
    chartTitle: "Top Speed Graph",
    description: "Plot the selected laps by per-lap top speed.",
    unit: "km/h",
  },
  {
    id: "maxRpm",
    label: "Max RPM",
    chartTitle: "Max RPM Graph",
    description: "Plot the selected laps by per-lap maximum RPM.",
    unit: "rpm",
  },
];
const TRACE_CHANNELS = [
  { id: "speed", label: "GPS Speed", unit: "km/h" },
  { id: "rpm", label: "RPM", unit: "rpm" },
  { id: "steering", label: "Steering", unit: "deg" },
  { id: "lateral_g", label: "Lateral G", unit: "g" },
  { id: "longitudinal_g", label: "Longitudinal G", unit: "g" },
];
