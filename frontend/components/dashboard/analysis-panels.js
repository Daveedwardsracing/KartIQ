import AnalysisVisuals from "@/components/analysis-visuals";
import { formatMetric } from "@/lib/dashboard-utils";

export function AnalysisPanel({ analysis, onGenerateFeedback, generating }) {
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
      {analysis.validation?.test_session_id ? (
        <div className={`mt-4 rounded-2xl border p-4 ${analysis.validation.matched ? "border-emerald-400/20 bg-emerald-500/10" : "border-amber-300/20 bg-amber-400/10"}`}>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium">Planned Session Validation</p>
              <p className="mt-1 text-sm muted">{analysis.validation.test_session_name}</p>
            </div>
            <span className="badge">{analysis.validation.matched ? "Matched" : "Check driver list"}</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <ValidationList title="Expected Drivers" items={analysis.validation.expected_drivers} />
            <ValidationList title="Uploaded Drivers" items={analysis.validation.uploaded_drivers} />
          </div>
          {(analysis.validation.missing_drivers?.length || analysis.validation.unplanned_drivers?.length) ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <ValidationList title="Missing Drivers" items={analysis.validation.missing_drivers} />
              <ValidationList title="Unexpected Uploads" items={analysis.validation.unplanned_drivers} />
            </div>
          ) : null}
          {analysis.validation.driver_matches?.length ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/30 p-4">
              <p className="text-sm font-medium">Alias Matching</p>
              <div className="mt-3 grid gap-2 text-sm muted">
                {analysis.validation.driver_matches.map((item) => (
                  <p key={`${item.uploaded_name}-${item.matched_name || "unmatched"}`}>
                    {item.uploaded_name}
                    {" -> "}
                    {item.matched_name || "No database match"}
                    {item.matched_by ? ` (${item.matched_by})` : ""}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
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
              <th className="px-3 py-3">Best Sector Sum</th>
              <th className="px-3 py-3">Consistency</th>
              <th className="px-3 py-3">Session Rank</th>
              <th className="px-3 py-3">Time Loss</th>
            </tr>
          </thead>
          <tbody>
            {analysis.drivers.map((driver) => (
              <tr key={`${driver.driver_name}-${driver.file_name}`} className="border-b border-white/5 align-top">
                <td className="px-3 py-3">
                  <p className="font-medium">{driver.canonical_driver_name || driver.driver_name}</p>
                  {driver.match_source ? <p className="text-xs text-blue-300">Matched via {driver.match_source}</p> : null}
                  <p className="text-xs muted">{driver.detected_track} / {driver.session_date || "Unknown date"}</p>
                </td>
                <td className="px-3 py-3">{formatMetric(driver.best_lap)}</td>
                <td className="px-3 py-3">{formatMetric(driver.best_three_average)}</td>
                <td className="px-3 py-3">{formatMetric(driver.best_sector_sum)}</td>
                <td className="px-3 py-3">{formatMetric(driver.consistency)}</td>
                <td className="px-3 py-3">{driver.session_rank}</td>
                <td className="px-3 py-3 max-w-56">{driver.time_loss_hint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5">
        <AnalysisVisuals analysis={analysis} />
      </div>
      {analysis ? (
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" onClick={onGenerateFeedback} type="button" disabled={generating}>
            {generating ? "Generating..." : "Generate feedback"}
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function ReportsPanel({ reports, hasAnalysis, onGenerateFeedback, onExportPdf, loading }) {
  if (!reports) {
    return (
      <article className="app-panel p-5">
        <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Report View</p>
        <p className="mt-4 muted">Generate feedback after analysis to get coach notes, driver debriefs, parent-friendly summaries, and next-session actions.</p>
        {hasAnalysis ? (
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" onClick={onGenerateFeedback} type="button" disabled={loading}>
              {loading ? "Generating..." : "Generate feedback"}
            </button>
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <article className="app-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Feedback</p>
        <div className="flex flex-wrap gap-3">
          <button className="workspace-ghost px-4 py-3 text-sm font-medium" onClick={onGenerateFeedback} type="button" disabled={loading}>
            {loading ? "Generating..." : "Regenerate"}
          </button>
          <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" onClick={onExportPdf} type="button" disabled={loading}>
            Export PDF
          </button>
        </div>
      </div>
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
            {report.headline ? <p className="mt-4 text-sm font-medium text-blue-100">{report.headline}</p> : null}
            <p className="mt-4 text-sm">{report.overall_summary}</p>
            {report.primary_focus ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/30 p-4">
                <p className="text-sm font-medium">Primary focus</p>
                <p className="mt-2 text-sm muted">{report.primary_focus}</p>
              </div>
            ) : null}
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <ReportList title="Strengths" items={report.strengths} />
              <ReportList title="Weaknesses" items={report.weaknesses} />
              <ReportList title="Action Points" items={report.action_points} />
            </div>
            {(report.key_takeaways || []).length ? (
              <div className="mt-4">
                <ReportList title="Key Takeaways" items={report.key_takeaways} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </article>
  );
}

export function SavedReportsPanel({ reports }) {
  if (!reports?.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
        <p className="text-sm font-medium">Saved Reports</p>
        <p className="mt-2 text-sm muted">No stored reports for this session yet.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      {reports.map((entry) => (
        <div key={entry.id} className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium">{entry.audience} / {entry.provider} / {entry.model}</p>
            <p className="text-sm muted">{entry.created_at}</p>
          </div>
          <div className="mt-4 grid gap-4">
            {entry.reports.map((report) => (
              <div key={`${entry.id}-${report.driver_name}`} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{report.canonical_driver_name || report.driver_name}</p>
                    <p className="text-sm muted">{report.format_label}</p>
                  </div>
                  <span className="badge">{report.confidence_rating}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="pill pill-neutral">{entry.status || "draft"}</span>
                  {entry.visible_to_driver ? <span className="pill pill-neutral">Driver visible</span> : null}
                  {entry.visible_to_parent ? <span className="pill pill-neutral">Parent visible</span> : null}
                  {!entry.visible_to_driver && !entry.visible_to_parent && entry.status === "reviewed" ? <span className="pill pill-neutral">Internal only</span> : null}
                </div>
                <p className="mt-3 text-sm">{report.overall_summary}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ValidationList({ title, items }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-3 grid gap-2 text-sm muted">
        {(items || []).length ? (items || []).map((item) => <li key={item}>- {item}</li>) : <li>- None</li>}
      </ul>
    </div>
  );
}

function ReportList({ title, items }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-3 grid gap-2 text-sm muted">
        {items.map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}
