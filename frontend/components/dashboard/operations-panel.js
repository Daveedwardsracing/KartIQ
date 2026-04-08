"use client";

import { formatDateLabel } from "@/lib/dashboard-utils";

export default function OperationsPanel({
  authAuditEntries,
  backupEntries,
  emailDeliveryLog,
  loading,
  onCreateBackup,
  onExportData,
  operationsHealth,
  reportHealth,
  restoreGuidance,
}) {
  const smtpStatus = operationsHealth?.smtp || {};
  const aiStatus = operationsHealth?.ai || {};
  const databaseStatus = operationsHealth?.database || {};

  return (
    <section className="workspace-page">
      <section className="workspace-hero workspace-hero-premium">
        <div className="workspace-hero-premium-grid">
          <div className="workspace-hero-copy">
            <p className="workspace-section-label">Operations</p>
            <h2 className="workspace-hero-title">Run the live beta from one calm operations room.</h2>
            <p className="workspace-hero-text">Keep backups, delivery status, auth activity, and AI/report health in one place so the coaching workflow stays dependable while the platform is live.</p>
          </div>
          <div className="workspace-hero-grid">
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Backups</p>
              <p className="workspace-kpi-value">{backupEntries.length}</p>
              <p className="workspace-kpi-detail">Database safety points already created.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Email log</p>
              <p className="workspace-kpi-value">{emailDeliveryLog.length}</p>
              <p className="workspace-kpi-detail">Recent SMTP activity and failures recorded.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Auth audit</p>
              <p className="workspace-kpi-value">{authAuditEntries.length}</p>
              <p className="workspace-kpi-detail">Recent login, approval, and password actions logged.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5">
      <div className="grid gap-5 xl:grid-cols-4">
        <StatusCard
          eyebrow="Database"
          title={databaseStatus.ok ? "Healthy" : "Attention"}
          detail={databaseStatus.ok ? `${databaseStatus.uploaded_session_count || 0} uploads / ${formatBytes(databaseStatus.size_bytes || 0)}` : (databaseStatus.error || "Database check failed")}
          tone={databaseStatus.ok ? "good" : "warn"}
        />
        <StatusCard
          eyebrow="SMTP"
          title={smtpStatus.ready ? ((smtpStatus.last_delivery?.status || "") === "failed" ? "Failing" : "Configured") : "Not ready"}
          detail={smtpStatus.ready ? `${smtpStatus.settings?.security || "SMTP"} ${smtpStatus.settings?.host || "host missing"}:${smtpStatus.settings?.port || "-"}` : "Email settings incomplete"}
          tone={smtpStatus.ready && smtpStatus.last_delivery?.status !== "failed" ? "good" : "warn"}
        />
        <StatusCard
          eyebrow="AI"
          title={aiStatus.ollama?.reachable || aiStatus.openai?.reachable ? "Available" : "Attention"}
          detail={`Ollama: ${aiStatus.ollama?.reachable ? "ok" : "down"} / OpenAI: ${aiStatus.openai?.reachable ? "ok" : "unavailable"}`}
          tone={aiStatus.ollama?.reachable || aiStatus.openai?.reachable ? "good" : "warn"}
        />
        <StatusCard
          eyebrow="Report Engine"
          title={reportHealth?.ok ? "Ready" : "Unavailable"}
          detail={reportHealth?.ok ? "Playwright PDF export available" : (reportHealth?.error || "Report health check failed")}
          tone={reportHealth?.ok ? "good" : "warn"}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="app-panel p-5">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="workspace-section-label">Backup Safeguards</p>
              <h3 className="mt-2 text-2xl font-semibold">Back up and export the live beta</h3>
            </div>
            <span className="pill pill-neutral">{backupEntries.length} backup{backupEntries.length === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="workspace-primary px-4 py-3 text-sm text-white" disabled={loading} onClick={onCreateBackup} type="button">
              {loading ? "Creating..." : "Create DB backup"}
            </button>
            <button className="workspace-ghost px-4 py-3 text-sm" disabled={loading} onClick={onExportData} type="button">
              Export sessions and reports
            </button>
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
            <p className="text-sm font-medium text-white">{restoreGuidance?.title || "Restore guidance"}</p>
            <ol className="mt-3 grid gap-2 text-sm muted">
              {(restoreGuidance?.steps || []).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
          <div className="mt-5 grid gap-3">
            {backupEntries.length ? backupEntries.slice(0, 6).map((backup) => (
              <div key={backup.path} className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{backup.file_name}</p>
                    <p className="mt-1 text-sm muted">{backup.path}</p>
                  </div>
                  <div className="text-right text-sm muted">
                    <p>{formatBytes(backup.size_bytes || 0)}</p>
                    <p className="mt-1">{backup.created_at ? formatDateLabel(backup.created_at) : "Unknown date"}</p>
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/20 p-5 text-sm muted">
                No backups created yet. Create one before making live beta changes.
              </div>
            )}
          </div>
        </article>

        <article className="app-panel p-5">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="workspace-section-label">Email Delivery</p>
              <h3 className="mt-2 text-2xl font-semibold">Latest SMTP activity</h3>
            </div>
            <span className="pill pill-neutral">{emailDeliveryLog.length} logged</span>
          </div>
          <div className="mt-5 grid gap-3">
            {emailDeliveryLog.length ? emailDeliveryLog.slice(0, 8).map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{entry.category || "email"}</p>
                    <p className="mt-1 text-sm muted">{entry.recipient_email || "No recipient"} / {entry.subject || "No subject"}</p>
                  </div>
                  <span className={`pill ${entry.status === "sent" ? "" : entry.status === "failed" ? "pill-danger" : "pill-neutral"}`}>{entry.status || "pending"}</span>
                </div>
                <p className="mt-3 text-sm muted">{entry.detail || "No diagnostic detail recorded."}</p>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/20 p-5 text-sm muted">
                No email activity recorded yet. Send a test email or approve a registration to populate this log.
              </div>
            )}
          </div>
        </article>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <article className="app-panel p-5">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="workspace-section-label">Login Audit</p>
              <h3 className="mt-2 text-2xl font-semibold">Recent auth and approval actions</h3>
            </div>
            <span className="pill pill-neutral">{authAuditEntries.length} entries</span>
          </div>
          <div className="mt-5 grid gap-3">
            {authAuditEntries.length ? authAuditEntries.slice(0, 12).map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{formatAuditAction(entry.action_type)}</p>
                    <p className="mt-1 text-sm muted">{entry.email || "No email"} {entry.actor_email ? `/ by ${entry.actor_email}` : ""}</p>
                  </div>
                  <span className={`pill ${entry.success ? "" : "pill-danger"}`}>{entry.success ? "success" : "failed"}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs muted">
                  <span>IP: {entry.ip_address || "Unknown"}</span>
                  <span>Role: {entry.role || "N/A"}</span>
                  <span>{entry.created_at ? formatDateLabel(entry.created_at) : "Unknown time"}</span>
                </div>
                {entry.detail ? <p className="mt-3 text-sm muted">{entry.detail}</p> : null}
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/20 p-5 text-sm muted">
                No auth audit entries yet.
              </div>
            )}
          </div>
        </article>

        <article className="app-panel p-5">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="workspace-section-label">Live Health Snapshot</p>
              <h3 className="mt-2 text-2xl font-semibold">Core beta services</h3>
            </div>
            <span className="pill pill-neutral">{operationsHealth?.generated_at ? formatDateLabel(operationsHealth.generated_at) : "No snapshot"}</span>
          </div>
          <div className="mt-5 grid gap-3">
            <HealthRow label="Database" status={databaseStatus.ok ? "ok" : "warning"} detail={databaseStatus.ok ? databaseStatus.path : databaseStatus.error} />
            <HealthRow label="SMTP" status={smtpStatus.ready && smtpStatus.last_delivery?.status !== "failed" ? "ok" : "warning"} detail={smtpStatus.ready ? `${smtpStatus.settings?.host || ""}:${smtpStatus.settings?.port || ""}` : "SMTP not configured"} />
            <HealthRow label="Ollama" status={aiStatus.ollama?.reachable ? "ok" : "warning"} detail={aiStatus.ollama?.reachable ? `${(aiStatus.ollama?.models || []).length} model(s)` : "Local model endpoint unreachable"} />
            <HealthRow label="OpenAI" status={aiStatus.openai?.reachable ? "ok" : "warning"} detail={aiStatus.openai?.reachable ? "Reachable with current API key" : "Unavailable or not configured"} />
            <HealthRow label="Report Engine" status={reportHealth?.ok ? "ok" : "warning"} detail={reportHealth?.ok ? "Playwright Chromium runtime available" : (reportHealth?.error || "Report engine unavailable")} />
          </div>
        </article>
      </div>
      </div>
    </section>
  );
}

function StatusCard({ eyebrow, title, detail, tone = "good" }) {
  return (
    <article className="app-panel p-5">
      <p className="workspace-section-label">{eyebrow}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <h3 className="text-2xl font-semibold">{title}</h3>
        <span className={`pill ${tone === "good" ? "" : tone === "bad" ? "pill-danger" : "pill-neutral"}`}>{tone}</span>
      </div>
      <p className="mt-3 text-sm muted">{detail}</p>
    </article>
  );
}

function HealthRow({ label, status, detail }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">{label}</p>
          <p className="mt-1 text-sm muted">{detail || "No detail recorded."}</p>
        </div>
        <span className={`pill ${status === "ok" ? "" : "pill-neutral"}`}>{status}</span>
      </div>
    </div>
  );
}

function formatBytes(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const scaled = size / (1024 ** unitIndex);
  const decimals = unitIndex === 0 ? 0 : scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return `${scaled.toFixed(decimals)} ${units[unitIndex]}`;
}

function formatAuditAction(action) {
  const label = String(action || "")
    .replace(/_/g, " ")
    .trim();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : "Auth event";
}
