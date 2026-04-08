import { useEffect, useState } from "react";
import { formatDateLabel, formatMetric } from "@/lib/dashboard-utils";

const REPORT_SECTION_OPTIONS = {
  coach: [
    { id: "best-lap", label: "Best lap summary" },
    { id: "sector", label: "Sector delta summary" },
    { id: "corner", label: "Corner highlights" },
    { id: "notes", label: "Manual coaching notes" },
    { id: "actions", label: "AI debrief and actions" },
  ],
  driver: [
    { id: "snapshot", label: "Driver session snapshot" },
    { id: "takeaways", label: "Positive takeaways" },
    { id: "focus", label: "Next-run focus" },
    { id: "corner", label: "Key corners to work on" },
    { id: "actions", label: "Driver coaching actions" },
  ],
  parent: [
    { id: "overview", label: "Plain-English session overview" },
    { id: "positives", label: "Positive signs and progress" },
    { id: "focus", label: "Development focus" },
    { id: "support", label: "Support notes and next steps" },
    { id: "summary", label: "Parent-facing summary" },
  ],
};

function previewConfig(audience) {
  if (audience === "driver") {
    return {
      title: "Driver debrief preview",
      subtitle: "What the driver will actually read before the next run.",
    };
  }
  if (audience === "parent") {
    return {
      title: "Parent summary preview",
      subtitle: "A simpler progress and support view for family sharing.",
    };
  }
  return {
    title: "Coach report preview",
    subtitle: "Technical summary, context, and debrief notes for the coaching pack.",
  };
}

function publishActionConfig(audience) {
  if (audience === "driver") {
    return {
      title: "Driver publishing workflow",
      summaryLabel: "Driver debrief",
      primaryLabel: "Publish to driver",
      secondaryLabel: "Unpublish driver report",
      publishPayload: { status: "published", visible_to_driver: true, visible_to_parent: false },
      unpublishPayload: { status: "reviewed", visible_to_driver: false, visible_to_parent: false },
      helper: "Review the wording, add any note you want to keep with the report, then publish it to the driver portal when it is ready.",
    };
  }
  if (audience === "parent") {
    return {
      title: "Parent publishing workflow",
      summaryLabel: "Parent summary",
      primaryLabel: "Publish to parent",
      secondaryLabel: "Unpublish parent report",
      publishPayload: { status: "published", visible_to_driver: false, visible_to_parent: true },
      unpublishPayload: { status: "reviewed", visible_to_driver: false, visible_to_parent: false },
      helper: "Use this once the summary is clear and family-facing. Keep it reviewed internally until it is ready to be shared.",
    };
  }
  return {
    title: "Coach review workflow",
    summaryLabel: "Coach report",
    primaryLabel: "Mark reviewed",
    secondaryLabel: "Return to draft",
    publishPayload: { status: "reviewed", visible_to_driver: false, visible_to_parent: false },
    unpublishPayload: { status: "draft", visible_to_driver: false, visible_to_parent: false },
    helper: "Coach reports stay internal. Use the review step to confirm the pack is ready before sharing the driver or parent versions.",
  };
}

function aggregateGeneratedItems(reports = [], field) {
  return reports
    .flatMap((report) => (report?.[field] || []).map((item) => ({
      driverName: report.canonical_driver_name || report.driver_name || "Driver",
      text: item,
    })))
    .filter((item) => item.text)
    .slice(0, 8);
}

function renderPreviewCard(title, content) {
  return (
    <section className="workspace-subtle-card p-4">
      <p className="text-sm font-medium">{title}</p>
      {content}
    </section>
  );
}

export default function ReportBuilderPanel({
  sessionsStore,
  selectedSessionDetail,
  reportsStore,
  loading,
  generateNotice,
  audience,
  mobileExperience = false,
  onAudienceChange,
  onSelectSession,
  onGenerateFeedback,
  onExportPdf,
  onPublishReport,
}) {
  const [reviewNoteDraft, setReviewNoteDraft] = useState("");
  const session = selectedSessionDetail?.session || null;
  const reports = selectedSessionDetail?.reports || [];
  const notes = selectedSessionDetail?.notes || [];
  const analysis = session?.analysis || null;
  const drivers = analysis?.drivers || [];
  const sectors = analysis?.sector_analysis || [];
  const corners = analysis?.corner_analysis || [];
  const latestGenerated = reports.find((report) => report.audience === audience) || reports[0] || null;
  const availableSessions = sessionsStore || [];
  const latestGeneratedRows = latestGenerated?.reports || [];
  const audiencePreview = previewConfig(audience);
  const includedSections = REPORT_SECTION_OPTIONS[audience] || REPORT_SECTION_OPTIONS.coach;
  const publishConfig = publishActionConfig(audience);
  const canUnpublishLatest = audience === "coach"
    ? true
    : audience === "driver"
      ? Boolean(latestGenerated?.visible_to_driver) || latestGenerated?.status === "published"
      : Boolean(latestGenerated?.visible_to_parent) || latestGenerated?.status === "published";
  const generatedTakeaways = aggregateGeneratedItems(latestGeneratedRows, "key_takeaways");
  const generatedActions = aggregateGeneratedItems(latestGeneratedRows, "action_points");
  const generatedSupportNotes = aggregateGeneratedItems(latestGeneratedRows, "support_notes");

  useEffect(() => {
    setReviewNoteDraft(latestGenerated?.review_note || "");
  }, [latestGenerated?.id, latestGenerated?.review_note]);

  function openHtmlTemplate() {
    if (!session?.id) return;
    const target = `/report-template?sessionId=${encodeURIComponent(session.id)}&audience=${encodeURIComponent(audience)}`;
    window.open(target, "_blank", "noopener,noreferrer");
  }

  if (mobileExperience) {
    return (
      <div className="workspace-page mobile-report-page">
        <section className="workspace-hero workspace-hero-premium mobile-planning-hero">
          <div className="workspace-hero-copy max-w-3xl">
            <p className="workspace-section-label">Mobile Reports</p>
            <h2 className="workspace-hero-title">Generate and publish reports on the phone.</h2>
            <p className="workspace-hero-text">Pick the session, switch the audience, preview the shape of the report, then generate and publish without the full desktop studio around it.</p>
          </div>
          <div className="mobile-session-kpis">
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Sessions</p>
              <p className="workspace-kpi-value">{availableSessions.length}</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Reports</p>
              <p className="workspace-kpi-value">{reportsStore.length}</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Audience</p>
              <p className="workspace-kpi-value">{audience.charAt(0).toUpperCase() + audience.slice(1)}</p>
            </div>
          </div>
        </section>

        <div className="grid gap-4">
          <article className="app-panel p-4">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <p className="workspace-section-label">Session</p>
                <h3 className="mt-2 text-xl font-semibold">{session ? session.event_round : "Choose a session"}</h3>
              </div>
              {session ? <span className="pill">{session.status || "uploaded"}</span> : null}
            </div>
            <div className="mt-4 grid gap-3">
              {availableSessions.length ? availableSessions.map((item) => (
                <button
                  key={item.id}
                  className={`library-item ${session?.id === item.id ? "active" : ""}`}
                  onClick={() => onSelectSession(item.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.event_round || item.event_name}</p>
                      <p className="mt-1 text-sm muted">{item.event_name} / {item.session_type}</p>
                    </div>
                    <span className="pill pill-neutral">{item.driver_count || item.drivers?.length || 0}</span>
                  </div>
                </button>
              )) : <p className="muted">No uploaded sessions are available yet.</p>}
            </div>
          </article>

          {session ? (
            <>
              <article className="app-panel p-4">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div>
                    <p className="workspace-section-label">Audience</p>
                    <h3 className="mt-2 text-xl font-semibold">{audiencePreview.title}</h3>
                  </div>
                  {latestGenerated ? <span className="pill pill-neutral">{latestGenerated.status || "draft"}</span> : null}
                </div>
                <div className="mt-4 chip-row">
                  {[
                    ["coach", "Coach"],
                    ["driver", "Driver"],
                    ["parent", "Parent"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={`telemetry-channel-chip ${audience === value ? "active" : ""}`}
                      onClick={() => onAudienceChange(value)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid gap-2">
                  {includedSections.map((item) => (
                    <div key={item.id} className="session-debrief-row">
                      <span>{item.label}</span>
                      <span className="pill pill-neutral">Included</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="app-panel p-4">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div>
                    <p className="workspace-section-label">Actions</p>
                    <h3 className="mt-2 text-xl font-semibold">Generate and export</h3>
                  </div>
                </div>
                <div className="mt-4 grid gap-3">
                  <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" onClick={onGenerateFeedback} type="button" disabled={loading}>
                    {loading ? "Generating..." : "Generate report"}
                  </button>
                  <button className="workspace-ghost px-4 py-3 text-sm" onClick={openHtmlTemplate} type="button">
                    Open HTML template
                  </button>
                  <button className="workspace-ghost px-4 py-3 text-sm" onClick={onExportPdf} type="button" disabled={loading}>
                    Export PDF
                  </button>
                </div>
                {generateNotice ? (
                  <div className="workspace-notice-banner mt-4">
                    {generateNotice}
                  </div>
                ) : null}
              </article>

              <article className="app-panel p-4">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div>
                    <p className="workspace-section-label">Publish</p>
                    <h3 className="mt-2 text-xl font-semibold">{publishConfig.title}</h3>
                  </div>
                </div>
                <p className="mt-4 text-sm muted">{publishConfig.helper}</p>
                {latestGenerated ? (
                  <div className="mt-4 grid gap-3">
                    <textarea
                      className="workspace-field min-h-[100px]"
                      placeholder="Optional review note..."
                      value={reviewNoteDraft}
                      onChange={(event) => setReviewNoteDraft(event.target.value)}
                    />
                    <div className="session-debrief-row">
                      <span>Reviewed</span>
                      <span>{latestGenerated.reviewed_at || "Not reviewed yet"}</span>
                    </div>
                    <div className="session-debrief-row">
                      <span>Published</span>
                      <span>{latestGenerated.published_at || "Not published yet"}</span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        className="workspace-primary px-4 py-3 text-sm font-medium text-white"
                        onClick={() => onPublishReport(latestGenerated.id, { ...publishConfig.publishPayload, review_note: reviewNoteDraft })}
                        type="button"
                      >
                        {publishConfig.primaryLabel}
                      </button>
                      {canUnpublishLatest ? (
                        <button
                          className="workspace-ghost px-4 py-3 text-sm"
                          onClick={() => onPublishReport(latestGenerated.id, { ...publishConfig.unpublishPayload, review_note: reviewNoteDraft })}
                          type="button"
                        >
                          {publishConfig.secondaryLabel}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm muted">Generate this audience report first to review or publish it.</p>
                )}
              </article>

              <article className="app-panel p-4">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div>
                    <p className="workspace-section-label">Preview</p>
                    <h3 className="mt-2 text-xl font-semibold">{audiencePreview.title}</h3>
                  </div>
                  <span className="pill pill-neutral">{formatDateLabel(session.created_at)}</span>
                </div>
                <div className="mt-4 grid gap-3">
                  {latestGeneratedRows.length ? latestGeneratedRows.slice(0, 3).map((report) => (
                    <div key={`${latestGenerated?.id || "draft"}-${report.driver_name}`} className="workspace-subtle-card p-4">
                      <p className="font-medium">{report.canonical_driver_name || report.driver_name}</p>
                      {report.headline ? <p className="mt-2 text-sm text-blue-100">{report.headline}</p> : null}
                      <p className="mt-3 text-sm muted">{report.overall_summary}</p>
                      {report.primary_focus ? <p className="mt-3 text-sm"><span className="font-medium">Primary focus:</span> {report.primary_focus}</p> : null}
                    </div>
                  )) : (
                    <div className="workspace-subtle-card p-4">
                      <p className="text-sm muted">Generate feedback to pull the latest report content into the mobile preview.</p>
                    </div>
                  )}
                  {generatedTakeaways.length ? (
                    <div className="workspace-subtle-card p-4">
                      <p className="text-sm font-medium">Key takeaways</p>
                      <div className="mt-3 grid gap-2">
                        {generatedTakeaways.slice(0, 4).map((item, index) => (
                          <div key={`${item.driverName}-${index}`} className="session-debrief-row">
                            <span>{item.driverName}</span>
                            <span>{item.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {generatedActions.length ? (
                    <div className="workspace-subtle-card p-4">
                      <p className="text-sm font-medium">Action points</p>
                      <div className="mt-3 grid gap-2">
                        {generatedActions.slice(0, 4).map((item, index) => (
                          <div key={`${item.driverName}-action-${index}`} className="session-debrief-row">
                            <span>{item.driverName}</span>
                            <span>{item.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {audience === "parent" && generatedSupportNotes.length ? (
                    <div className="workspace-subtle-card p-4">
                      <p className="text-sm font-medium">Support notes</p>
                      <div className="mt-3 grid gap-2">
                        {generatedSupportNotes.slice(0, 4).map((item, index) => (
                          <div key={`${item.driverName}-support-${index}`} className="session-debrief-row">
                            <span>{item.driverName}</span>
                            <span>{item.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-page">
      <section className="workspace-hero workspace-hero-premium">
        <div className="workspace-hero-premium-grid">
          <div className="workspace-hero-copy max-w-3xl">
            <p className="workspace-section-label">Reports</p>
            <h2 className="workspace-hero-title">Build reports that feel like coaching packs, not admin exports.</h2>
            <p className="workspace-hero-text">Choose the session, shape the audience, review the debrief narrative, and move it cleanly from internal review to published output.</p>
          </div>
          <div className="workspace-hero-grid">
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Sessions ready</p>
              <p className="workspace-kpi-value">{availableSessions.length}</p>
              <p className="workspace-kpi-detail">Uploaded sessions available for debrief building.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Stored reports</p>
              <p className="workspace-kpi-value">{reportsStore.length}</p>
              <p className="workspace-kpi-detail">Saved outputs across coach, driver, and parent views.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Current audience</p>
              <p className="workspace-kpi-value">{audience.charAt(0).toUpperCase() + audience.slice(1)}</p>
              <p className="workspace-kpi-detail">{session ? "Preview and workflow update live as you switch audience." : "Choose a session to start shaping the output."}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="report-studio-grid">
        <article className="app-panel p-5">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="workspace-section-label">Session Library</p>
              <h3 className="mt-2 text-2xl font-semibold">Choose a session</h3>
            </div>
            <span className="pill pill-neutral">{availableSessions.length}</span>
          </div>
          <div className="library-list mt-5">
            {availableSessions.length ? availableSessions.map((item) => (
              <button
                key={item.id}
                className={`library-item ${session?.id === item.id ? "active" : ""}`}
                onClick={() => onSelectSession(item.id)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.event_round || item.event_name}</p>
                    <p className="mt-1 text-sm muted">{item.event_name} / {item.session_type}</p>
                  </div>
                  <span className="pill pill-neutral">{item.driver_count || item.drivers?.length || 0} drivers</span>
                </div>
                <p className="mt-3 text-xs muted">{item.created_at}</p>
              </button>
            )) : <p className="muted">No uploaded sessions are available yet.</p>}
          </div>
        </article>

        <article className="app-panel p-5">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="workspace-section-label">Report Builder</p>
              <h3 className="mt-2 text-2xl font-semibold">{session ? session.event_round : "Choose a session to start"}</h3>
            </div>
            {session ? <span className="pill">{session.status || "uploaded"}</span> : null}
          </div>

          {session ? (
            <div className="mt-5 grid gap-5">
              <div className="report-builder-spotlight">
                <div>
                  <p className="report-builder-spotlight-label">Selected session</p>
                  <h4 className="report-builder-spotlight-title">{session.event_name} / {session.session_type}</h4>
                  <p className="report-builder-spotlight-detail">{drivers.length} drivers, {sectors.length || 0} sectors, {corners.length || 0} named corners in the current analysis.</p>
                </div>
                <div className="chip-row">
                  <span className="pill">{audiencePreview.title}</span>
                  {latestGenerated ? <span className="pill pill-neutral">{latestGenerated.status || "draft"}</span> : <span className="pill pill-neutral">No saved {audience} report yet</span>}
                </div>
              </div>

              <div className="report-builder-grid">
                <div className="workspace-subtle-card p-4">
                  <p className="text-sm font-medium">Audience</p>
                  <div className="mt-3 chip-row">
                    {[
                      ["coach", "Coach"],
                      ["driver", "Driver"],
                      ["parent", "Parent"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        className={`telemetry-channel-chip ${audience === value ? "active" : ""}`}
                        onClick={() => onAudienceChange(value)}
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="workspace-subtle-card p-4">
                  <p className="text-sm font-medium">Included sections</p>
                  <div className="mt-3 grid gap-2">
                    {includedSections.map((item) => (
                      <div key={item.id} className="session-debrief-row">
                        <span>{item.label}</span>
                        <span className="pill pill-neutral">Included</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="workspace-subtle-card p-4">
                  <p className="text-sm font-medium">{publishConfig.title}</p>
                  <p className="mt-2 text-sm muted">{publishConfig.helper}</p>
                  <div className="publish-workflow-card mt-4">
                    <div className="publish-workflow-header">
                      <div>
                        <p className="publish-workflow-label">Current target</p>
                        <p className="publish-workflow-title">{publishConfig.summaryLabel}</p>
                      </div>
                      <div className="chip-row">
                        <span className="pill">{latestGenerated?.status || "draft"}</span>
                        {latestGenerated?.visible_to_driver ? <span className="pill pill-neutral">Visible to driver</span> : null}
                        {latestGenerated?.visible_to_parent ? <span className="pill pill-neutral">Visible to parent</span> : null}
                      </div>
                    </div>
                    <div className="publish-workflow-meta">
                      {latestGenerated?.reviewed_at ? <span className="pill pill-neutral">Reviewed {formatDateLabel(latestGenerated.reviewed_at)}</span> : <span className="pill pill-neutral">Not reviewed yet</span>}
                      {latestGenerated?.published_at ? <span className="pill pill-neutral">Published {formatDateLabel(latestGenerated.published_at)}</span> : <span className="pill pill-neutral">Not published yet</span>}
                    </div>
                  </div>
                  {latestGenerated ? (
                    <div className="mt-4 grid gap-3">
                      <textarea
                        className="workspace-field min-h-[100px]"
                        placeholder="Optional review note to explain why this report is approved, still internal, or ready to publish..."
                        value={reviewNoteDraft}
                        onChange={(event) => setReviewNoteDraft(event.target.value)}
                      />
                      <div className="flex flex-wrap gap-3">
                        <button
                          className="workspace-primary px-4 py-3 text-sm font-medium text-white"
                         onClick={() => onPublishReport(latestGenerated.id, { ...publishConfig.publishPayload, review_note: reviewNoteDraft })}
                          type="button"
                        >
                          {publishConfig.primaryLabel}
                        </button>
                        {canUnpublishLatest ? (
                          <button
                            className="workspace-ghost px-4 py-3 text-sm"
                            onClick={() => onPublishReport(latestGenerated.id, { ...publishConfig.unpublishPayload, review_note: reviewNoteDraft })}
                            type="button"
                          >
                            {publishConfig.secondaryLabel}
                          </button>
                        ) : null}
                        </div>
                      </div>
                    ) : (
                    <p className="mt-3 text-sm muted">Generate this audience report first to review or publish it.</p>
                  )}
                </div>
              </div>

              <div className="workspace-action-cluster">
                <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" onClick={onGenerateFeedback} type="button" disabled={loading}>
                  {loading ? "Generating..." : "Generate report"}
                </button>
                <button className="workspace-ghost px-4 py-3 text-sm" onClick={openHtmlTemplate} type="button">
                  Open HTML template
                </button>
                <button className="workspace-ghost px-4 py-3 text-sm" onClick={onExportPdf} type="button" disabled={loading}>
                  Export PDF
                </button>
                <button className="workspace-ghost px-4 py-3 text-sm" onClick={() => window.print()} type="button">
                  Print preview
                </button>
              </div>

              {generateNotice ? (
                <div className="workspace-notice-banner">
                  {generateNotice}
                </div>
              ) : null}

              <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-5 printable-debrief-card">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <p className="workspace-section-label">Preview</p>
                    <h3 className="mt-2 text-2xl font-semibold">{audiencePreview.title}</h3>
                    <p className="mt-2 text-sm muted">{audiencePreview.subtitle}</p>
                  </div>
                  <span className="pill pill-neutral">{formatDateLabel(session.created_at)}</span>
                </div>

                <div className="mt-5 grid gap-5">
                  {audience === "coach" ? (
                    <>
                      {renderPreviewCard("Best lap summary", (
                        <div className="mt-3 grid gap-2">
                          {drivers.length ? drivers
                            .slice()
                            .sort((left, right) => (left.best_lap ?? 9999) - (right.best_lap ?? 9999))
                            .map((driver, index, list) => (
                              <div key={`${driver.driver_name}-report-preview`} className="session-debrief-row">
                                <span>{index + 1}. {driver.canonical_driver_name || driver.driver_name}</span>
                                <span>
                                  {formatMetric(driver.best_lap, 3)}
                                  {index > 0 && list[0]?.best_lap ? ` (+${(driver.best_lap - list[0].best_lap).toFixed(3)}s)` : ""}
                                </span>
                              </div>
                            )) : <p className="muted">No driver data loaded for this session.</p>}
                        </div>
                      ))}

                      {renderPreviewCard("Sector delta summary", (
                        <div className="mt-3 grid gap-2">
                          {sectors.length ? sectors.map((sector) => (
                            <div key={sector.sector_name} className="session-debrief-row">
                              <span>{sector.sector_name}</span>
                              <span>{sector.fastest_driver ? `${sector.fastest_driver} ${formatMetric(sector.fastest_time, 3)}s` : "-"}</span>
                            </div>
                          )) : <p className="muted">Sector timing will appear here for the selected track/session.</p>}
                        </div>
                      ))}

                      {renderPreviewCard("Corner highlights", (
                        <div className="mt-3 grid gap-3">
                          {corners.length ? corners.slice(0, 4).map((corner) => (
                            <div key={corner.corner_number} className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                              <p className="font-medium">{corner.name}</p>
                              <p className="mt-2 text-sm muted">{corner.summary || "Corner summary will appear here once the telemetry comparison is loaded."}</p>
                            </div>
                          )) : <p className="muted">No named corner highlights are available for this session yet.</p>}
                        </div>
                      ))}

                      {renderPreviewCard("Manual coaching notes", (
                        <div className="mt-3 grid gap-3">
                          {notes.length ? notes.map((note) => (
                            <div key={note.id} className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                              <p className="font-medium">{note.title}</p>
                              <p className="mt-1 text-sm muted">{note.driver_name || "Whole session"}</p>
                              <p className="mt-3 text-sm">{note.body}</p>
                            </div>
                          )) : <p className="muted">No manual coaching notes have been added yet.</p>}
                        </div>
                      ))}

                      {renderPreviewCard("AI debrief and actions", (
                        <div className="mt-3 grid gap-3">
                          {latestGeneratedRows.length ? latestGeneratedRows.map((report) => (
                            <div key={`${latestGenerated.id}-${report.driver_name}`} className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                              <p className="font-medium">{report.canonical_driver_name || report.driver_name}</p>
                              {report.headline ? <p className="mt-2 text-sm text-blue-100">{report.headline}</p> : null}
                              <p className="mt-3 text-sm muted">{report.overall_summary}</p>
                              {report.primary_focus ? <p className="mt-3 text-sm"><span className="font-medium">Primary focus:</span> {report.primary_focus}</p> : null}
                            </div>
                          )) : <p className="muted">Generate feedback to pull the AI debrief into the preview.</p>}
                        </div>
                      ))}
                    </>
                  ) : null}

                  {audience === "driver" ? (
                    <>
                      {renderPreviewCard("Driver session snapshot", (
                        <div className="mt-3 grid gap-2">
                          {drivers.length ? drivers
                            .slice()
                            .sort((left, right) => (left.best_lap ?? 9999) - (right.best_lap ?? 9999))
                            .map((driver, index, list) => (
                              <div key={`${driver.driver_name}-driver-preview`} className="session-debrief-row">
                                <span>{index + 1}. {driver.canonical_driver_name || driver.driver_name}</span>
                                <span>
                                  {formatMetric(driver.best_lap, 3)}
                                  {index > 0 && list[0]?.best_lap ? ` (+${(driver.best_lap - list[0].best_lap).toFixed(3)}s)` : ""}
                                </span>
                              </div>
                            )) : <p className="muted">No driver data loaded for this session.</p>}
                        </div>
                      ))}

                      {renderPreviewCard("Positive takeaways", (
                        <div className="mt-3 grid gap-3">
                          {generatedTakeaways.length ? generatedTakeaways.map((item, index) => (
                            <div key={`${item.driverName}-takeaway-${index}`} className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                              <p className="font-medium">{item.driverName}</p>
                              <p className="mt-3 text-sm muted">{item.text}</p>
                            </div>
                          )) : <p className="muted">Generate feedback to preview positive takeaways.</p>}
                        </div>
                      ))}

                      {renderPreviewCard("Next-run focus", (
                        <div className="mt-3 grid gap-3">
                          {latestGeneratedRows.length ? latestGeneratedRows.map((report) => (
                            <div key={`${report.driver_name}-focus`} className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                              <p className="font-medium">{report.canonical_driver_name || report.driver_name}</p>
                              {report.primary_focus ? <p className="mt-3 text-sm">{report.primary_focus}</p> : <p className="mt-3 text-sm muted">Primary focus will appear here after generation.</p>}
                            </div>
                          )) : <p className="muted">Generate feedback to preview next-run focus.</p>}
                        </div>
                      ))}

                      {renderPreviewCard("Key corners to work on", (
                        <div className="mt-3 grid gap-3">
                          {corners.length ? corners.slice(0, 3).map((corner) => (
                            <div key={`${corner.corner_number}-driver-corner`} className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                              <p className="font-medium">{corner.name}</p>
                              <p className="mt-2 text-sm muted">{corner.summary || "Corner summary will appear here once the telemetry comparison is loaded."}</p>
                            </div>
                          )) : <p className="muted">No key corners are available for this session yet.</p>}
                        </div>
                      ))}

                      {renderPreviewCard("Driver coaching actions", (
                        <div className="mt-3 grid gap-3">
                          {generatedActions.length ? generatedActions.map((item, index) => (
                            <div key={`${item.driverName}-action-${index}`} className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                              <p className="font-medium">{item.driverName}</p>
                              <p className="mt-3 text-sm muted">{item.text}</p>
                            </div>
                          )) : <p className="muted">Generate feedback to preview driver actions.</p>}
                        </div>
                      ))}
                    </>
                  ) : null}

                  {audience === "parent" ? (
                    <>
                      {renderPreviewCard("Plain-English session overview", (
                        <div className="mt-3 grid gap-3">
                          {latestGeneratedRows.length ? latestGeneratedRows.map((report) => (
                            <div key={`${report.driver_name}-parent-overview`} className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                              <p className="font-medium">{report.canonical_driver_name || report.driver_name}</p>
                              {report.headline ? <p className="mt-2 text-sm text-blue-100">{report.headline}</p> : null}
                              <p className="mt-3 text-sm muted">{report.overall_summary}</p>
                            </div>
                          )) : <p className="muted">Generate feedback to preview the parent summary.</p>}
                        </div>
                      ))}

                      {renderPreviewCard("Positive signs and progress", (
                        <div className="mt-3 grid gap-3">
                          {generatedTakeaways.length ? generatedTakeaways.map((item, index) => (
                            <div key={`${item.driverName}-parent-positive-${index}`} className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                              <p className="font-medium">{item.driverName}</p>
                              <p className="mt-3 text-sm muted">{item.text}</p>
                            </div>
                          )) : <p className="muted">Generate feedback to preview positive signs from the session.</p>}
                        </div>
                      ))}

                      {renderPreviewCard("Development focus", (
                        <div className="mt-3 grid gap-3">
                          {latestGeneratedRows.length ? latestGeneratedRows.map((report) => (
                            <div key={`${report.driver_name}-parent-focus`} className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                              <p className="font-medium">{report.canonical_driver_name || report.driver_name}</p>
                              {report.primary_focus ? <p className="mt-3 text-sm">{report.primary_focus}</p> : <p className="mt-3 text-sm muted">Development focus will appear here after generation.</p>}
                            </div>
                          )) : <p className="muted">Generate feedback to preview the development focus.</p>}
                        </div>
                      ))}

                      {renderPreviewCard("Support notes and next steps", (
                        <div className="mt-3 grid gap-3">
                          {generatedSupportNotes.length ? generatedSupportNotes.map((item, index) => (
                            <div key={`${item.driverName}-parent-support-${index}`} className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                              <p className="font-medium">{item.driverName}</p>
                              <p className="mt-3 text-sm muted">{item.text}</p>
                            </div>
                          )) : <p className="muted">Generate feedback to preview support notes and next steps.</p>}
                        </div>
                      ))}

                      {renderPreviewCard("Parent-facing summary", (
                        <div className="mt-3 grid gap-3">
                          {notes.length ? notes.slice(0, 3).map((note) => (
                            <div key={`parent-note-${note.id}`} className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                              <p className="font-medium">{note.title}</p>
                              <p className="mt-1 text-sm muted">{note.driver_name || "Whole session"}</p>
                              <p className="mt-3 text-sm">{note.body}</p>
                            </div>
                          )) : <p className="muted">Manual notes will appear here when the team adds parent-facing context.</p>}
                        </div>
                      ))}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-5 muted">Pick a saved session from the library to build a report pack around it.</p>
          )}
        </article>

        <article className="app-panel p-5">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="workspace-section-label">Stored Reports</p>
              <h3 className="mt-2 text-2xl font-semibold">Library</h3>
            </div>
            <span className="pill pill-neutral">{reportsStore.length}</span>
          </div>

          <div className="mt-5 grid gap-3">
            {reportsStore.length ? reportsStore.map((report) => (
              <div key={report.id} className="workspace-subtle-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{report.audience === "coach" ? "Coach report" : report.audience === "driver" ? "Driver debrief" : "Parent summary"}</p>
                    <p className="text-sm muted">{formatDateLabel(report.created_at)}</p>
                  </div>
                  <div className="chip-row">
                    <span className="pill">{report.status || "draft"}</span>
                    {report.visible_to_driver ? <span className="pill pill-neutral">Driver</span> : null}
                    {report.visible_to_parent ? <span className="pill pill-neutral">Parent</span> : null}
                  </div>
                </div>
                <p className="mt-3 text-sm muted">
                  {report.audience === "coach"
                    ? "Internal coach report"
                    : report.audience === "driver"
                      ? "Driver-facing debrief"
                      : "Parent-facing summary"}
                </p>
                <p className="mt-2 text-xs muted">Generated with {report.provider} / {report.model}</p>
                {report.review_note ? (
                  <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/30 p-4">
                    <p className="text-sm font-medium">Review note</p>
                    <p className="mt-2 text-sm muted">{report.review_note}</p>
                  </div>
                ) : null}
                <div className="mt-3 chip-row">
                  {report.reviewed_at ? <span className="pill pill-neutral">Reviewed {formatDateLabel(report.reviewed_at)}</span> : null}
                  {report.published_at ? <span className="pill pill-neutral">Published {formatDateLabel(report.published_at)}</span> : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  {report.audience === "coach" ? (
                    <>
                      <button
                        className="workspace-ghost px-4 py-3 text-sm"
                        onClick={() => onPublishReport(report.id, { status: "reviewed", visible_to_driver: false, visible_to_parent: false, review_note: report.review_note || "" })}
                        type="button"
                      >
                        Mark reviewed
                      </button>
                      <button
                        className="workspace-ghost px-4 py-3 text-sm"
                        onClick={() => onPublishReport(report.id, { status: "draft", visible_to_driver: false, visible_to_parent: false, review_note: report.review_note || "" })}
                        type="button"
                      >
                        Return to draft
                      </button>
                    </>
                  ) : null}
                    {report.audience === "driver" ? (
                      <>
                        <button
                          className="workspace-primary px-4 py-3 text-sm font-medium text-white"
                          onClick={() => onPublishReport(report.id, { status: "published", visible_to_driver: true, visible_to_parent: false, review_note: report.review_note || "" })}
                          type="button"
                        >
                          Publish to driver
                        </button>
                        {report.visible_to_driver || report.status === "published" ? (
                          <button
                            className="workspace-ghost px-4 py-3 text-sm"
                            onClick={() => onPublishReport(report.id, { status: "reviewed", visible_to_driver: false, visible_to_parent: false, review_note: report.review_note || "" })}
                            type="button"
                          >
                            Unpublish
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    {report.audience === "parent" ? (
                      <>
                        <button
                        className="workspace-primary px-4 py-3 text-sm font-medium text-white"
                        onClick={() => onPublishReport(report.id, { status: "published", visible_to_driver: false, visible_to_parent: true, review_note: report.review_note || "" })}
                          type="button"
                        >
                          Publish to parent
                        </button>
                        {report.visible_to_parent || report.status === "published" ? (
                          <button
                            className="workspace-ghost px-4 py-3 text-sm"
                            onClick={() => onPublishReport(report.id, { status: "reviewed", visible_to_driver: false, visible_to_parent: false, review_note: report.review_note || "" })}
                            type="button"
                          >
                            Unpublish
                          </button>
                        ) : null}
                      </>
                    ) : null}
                </div>
                {report.session_id ? (
                  <button className="workspace-ghost mt-4 px-4 py-3 text-sm" onClick={() => onSelectSession(report.session_id)} type="button">
                    Open session
                  </button>
                ) : null}
              </div>
            )) : <p className="muted">No saved reports yet. Generate one from a selected session.</p>}
          </div>
        </article>
      </div>
    </div>
  );
}
