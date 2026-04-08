"use client";

function ValidationList({ title, items, emptyLabel, tone = "neutral" }) {
  return (
    <div className="workspace-subtle-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-white">{title}</p>
        <span className={`pill ${tone === "warn" ? "pill-warn" : tone === "danger" ? "pill-danger" : "pill-neutral"}`}>{items.length}</span>
      </div>
      <div className="mt-3 grid gap-2">
        {items.length ? items.map((item) => (
          <div key={`${title}-${item}`} className="rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-sm">
            {item}
          </div>
        )) : (
          <p className="text-sm muted">{emptyLabel}</p>
        )}
      </div>
    </div>
  );
}

export default function UploadValidationSummary({ summary }) {
  if (!summary?.hasValidation) {
    return (
      <article className="workflow-card">
        <p className="workspace-section-label">Validation</p>
        <div className="mt-4 workspace-subtle-card p-4">
          <p className="text-sm font-medium text-white">No validation summary yet</p>
          <p className="mt-2 text-sm muted">Upload files into a planned session to compare the expected drivers with the uploaded telemetry.</p>
        </div>
      </article>
    );
  }

  return (
    <article className="workflow-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="workspace-section-label">Validation</p>
          <h3 className="mt-2 text-xl font-semibold">Driver matching summary</h3>
        </div>
        <span className={`pill ${summary.matched ? "" : "pill-warn"}`}>
          {summary.matched ? "Matched cleanly" : "Needs review"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Expected drivers" value={summary.expectedCount} detail="Planned for this session" />
        <MetricCard label="Uploaded drivers" value={summary.uploadedCount} detail="Detected in the upload" />
        <MetricCard label="Matched uploads" value={summary.matchedCount} detail="Mapped to known drivers" tone={summary.matchedCount ? "good" : "neutral"} />
        <MetricCard label="Uploads to review" value={summary.unmatchedUploads + summary.unplannedDrivers.length} detail="Need confirmation or fixing" tone={summary.unmatchedUploads + summary.unplannedDrivers.length ? "warn" : "good"} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <ValidationList
          title="Missing expected drivers"
          items={summary.missingDrivers}
          emptyLabel="Every planned driver appears in the upload."
          tone={summary.missingDrivers.length ? "warn" : "neutral"}
        />
        <ValidationList
          title="Unplanned uploaded drivers"
          items={summary.unplannedDrivers}
          emptyLabel="No unexpected drivers were detected."
          tone={summary.unplannedDrivers.length ? "danger" : "neutral"}
        />
      </div>

      <div className="mt-5 workspace-subtle-card p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-white">Per-upload matching</p>
          <span className="pill pill-neutral">{summary.matches.length} entries</span>
        </div>
        <div className="mt-3 grid gap-3">
          {summary.matches.length ? summary.matches.map((item, index) => (
            <div key={`${item.uploaded_name}-${index}`} className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-white">{item.uploaded_name || "Unknown upload"}</p>
                  <p className="mt-1 text-sm muted">
                    {item.matched_name ? `Matched to ${item.matched_name}` : "No matched driver found"}
                  </p>
                </div>
                <span className={`pill ${item.matched_name ? "" : "pill-warn"}`}>
                  {item.matched_by || (item.matched_name ? "matched" : "unmatched")}
                </span>
              </div>
            </div>
          )) : (
            <p className="text-sm muted">No detailed driver matching data is available for this upload yet.</p>
          )}
        </div>
      </div>
    </article>
  );
}

function MetricCard({ label, value, detail, tone = "neutral" }) {
  return (
    <div className="workspace-stat p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm muted">{label}</p>
        <span className={`pill ${tone === "good" ? "" : tone === "warn" ? "pill-warn" : "pill-neutral"}`}>{tone}</span>
      </div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      <p className="mt-2 text-sm muted">{detail}</p>
    </div>
  );
}
