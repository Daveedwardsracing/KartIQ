import { formatDateLabel } from "@/lib/dashboard-utils";

export default function HomeDashboard({
  driversStore,
  eventsStore,
  homeStats,
  reportsStore,
  sessionsStore,
  testSessionsStore,
  onOpenDrivers,
  onOpenEvents,
  onOpenHistory,
  onOpenReports,
  onOpenTracks
}) {
  const upcomingEventLabel = homeStats.nextEvent
    ? `${homeStats.nextEvent.venue || "Track"} / ${homeStats.nextEvent.name || "Event"}`
    : "No event scheduled yet";
  const nextStepSessions = testSessionsStore
    .filter((item) => !item.uploaded_session_id)
    .slice(0, 3);
  const readinessCards = [
    {
      label: "Drivers ready",
      value: driversStore.length,
      detail: "Active profiles available for planning, uploads, and portals.",
      onClick: onOpenDrivers,
    },
    {
      label: "Planned sessions",
      value: homeStats.totalPlannedSessions,
      detail: `${homeStats.uploadReadySessions} still waiting for telemetry uploads.`,
      onClick: onOpenEvents,
    },
    {
      label: "Published reports",
      value: reportsStore.length,
      detail: homeStats.latestReport ? `Latest: ${homeStats.latestReport.audience || "coach"} report` : "No reports generated yet.",
      onClick: onOpenReports,
    },
  ];

  return (
    <div className="workspace-page">
      <section className="workspace-hero workspace-hero-premium">
        <div className="workspace-hero-premium-grid">
          <div className="workspace-hero-copy">
            <p className="workspace-section-label">Home</p>
            <h2 className="workspace-hero-title">Run the race weekend like a briefing room, not an admin console.</h2>
            <p className="workspace-hero-text">Plan the event, line up the next sessions, keep the roster ready, and move into upload and debrief only when the team is prepared for it.</p>
            <div className="workspace-action-cluster mt-6">
              <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" onClick={onOpenEvents} type="button">Open race planning</button>
              <button className="workspace-ghost px-4 py-3 text-sm" onClick={onOpenReports} type="button">Open report studio</button>
            </div>
          </div>

          <button className="home-briefing-card" onClick={onOpenEvents} type="button">
            <p className="home-briefing-label">Next event</p>
            <h3 className="home-briefing-title">{homeStats.nextEvent?.name || "Create your next event"}</h3>
            <p className="home-briefing-detail">{upcomingEventLabel}</p>
            <div className="home-briefing-meta">
              <span>{homeStats.nextEvent?.date ? formatDateLabel(homeStats.nextEvent.date) : "Start inside Events"}</span>
              <span>{homeStats.uploadReadySessions} upload-ready sessions</span>
            </div>
          </button>
        </div>
      </section>

      <section className="home-readiness-grid">
        {readinessCards.map((card) => (
          <button key={card.label} className="home-readiness-card" onClick={card.onClick} type="button">
            <p className="home-readiness-label">{card.label}</p>
            <p className="home-readiness-value">{card.value}</p>
            <p className="home-readiness-detail">{card.detail}</p>
          </button>
        ))}
      </section>

      <section className="home-overview-grid">
        <article className="app-panel home-panel">
          <div className="home-panel-header">
            <div>
              <p className="workspace-section-label">Race Weekend Flow</p>
              <h3 className="mt-2 text-2xl font-semibold">Recommended workflow</h3>
            </div>
            <span className="pill pill-neutral">Session-led</span>
          </div>
          <div className="home-steps">
            {[
              "Create or open an event",
              "Build the sessions inside that event",
              "Assign the event drivers to each session",
              "Upload telemetry only from the chosen session"
            ].map((item, index) => (
              <div key={item} className="home-step">
                <span className="home-step-index">{index + 1}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
          <div className="workspace-action-cluster mt-6">
            <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" onClick={onOpenEvents} type="button">Open event planning</button>
            <button className="workspace-ghost px-4 py-3 text-sm" onClick={onOpenDrivers} type="button">Manage drivers</button>
          </div>
        </article>

        <article className="app-panel home-panel">
          <div className="home-panel-header">
            <div>
              <p className="workspace-section-label">On Deck</p>
              <h3 className="mt-2 text-2xl font-semibold">Sessions waiting for data</h3>
            </div>
            <span className="pill">{homeStats.uploadReadySessions}</span>
          </div>
          <div className="home-list">
            {nextStepSessions.length ? nextStepSessions.map((item) => (
              <div key={item.id} className="home-list-row">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="mt-1 text-sm muted">{[item.venue, item.session_type, item.date && formatDateLabel(item.date)].filter(Boolean).join(" / ")}</p>
                </div>
                <span className="pill pill-neutral">{(item.drivers || []).length} drivers</span>
              </div>
            )) : (
              <div className="home-empty">
                <p className="font-medium">No sessions are queued for upload yet.</p>
                <p className="mt-2 text-sm muted">Create an event and add planned sessions first, then upload from inside that session flow.</p>
              </div>
            )}
          </div>
        </article>

        <article className="app-panel home-panel">
          <div className="home-panel-header">
            <div>
              <p className="workspace-section-label">Latest Activity</p>
              <h3 className="mt-2 text-2xl font-semibold">Most recent uploads and reports</h3>
            </div>
            <span className="pill pill-neutral">Live</span>
          </div>
          <div className="home-list">
            <button className="home-list-row home-list-row-button" onClick={onOpenHistory} type="button">
              <div>
                <p className="font-medium">Latest upload</p>
                <p className="mt-1 text-sm muted">
                  {homeStats.latestUpload
                    ? `${homeStats.latestUpload.event_round || homeStats.latestUpload.event_name || "Session"} ready in the archive`
                    : "No uploaded sessions stored yet."}
                </p>
              </div>
              <span className="pill pill-neutral">{sessionsStore.length} saved</span>
            </button>
            <button className="home-list-row home-list-row-button" onClick={onOpenReports} type="button">
              <div>
                <p className="font-medium">Latest report</p>
                <p className="mt-1 text-sm muted">
                  {homeStats.latestReport
                    ? `${homeStats.latestReport.audience || "Coach"} report ready for review and publishing`
                    : "No reports generated yet."}
                </p>
              </div>
              <span className="pill pill-neutral">{reportsStore.length} stored</span>
            </button>
            <button className="home-list-row home-list-row-button" onClick={onOpenTracks} type="button">
              <div>
                <p className="font-medium">Track library</p>
                <p className="mt-1 text-sm muted">Keep venue context, layout notes, and corner definitions close to planning.</p>
              </div>
              <span className="pill pill-neutral">{eventsStore.filter((item) => item.venue).length} venues</span>
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}
