"use client";

import { formatDateLabel } from "@/lib/dashboard-utils";

export default function BetaDiagnosticsPanel({
  appSettings,
  authAuditEntries,
  backupEntries,
  emailDeliveryLog,
  emailSettings,
  operationsHealth,
  reportHealth,
  reportsStore,
  sessionsStore,
  setupDatabaseStore,
  testSessionsStore,
  userAccountsStore,
}) {
  const databaseStatus = operationsHealth?.database || {};
  const smtpStatus = operationsHealth?.smtp || {};
  const aiStatus = operationsHealth?.ai || {};
  const lastBackup = backupEntries?.[0] || null;
  const latestEmail = emailDeliveryLog?.[0] || null;
  const forecastReadyCount = (testSessionsStore || []).filter((session) => {
    const forecast = session?.weather_forecast || {};
    return Boolean(forecast.summary || (forecast.hourly_forecast || []).length);
  }).length;
  const publishedReports = (reportsStore || []).filter((report) => report.status === "published").length;
  const pendingAccounts = (userAccountsStore || []).filter((account) => account.status === "pending").length;
  const diagnostics = buildDiagnostics({
    databaseStatus,
    smtpStatus,
    aiStatus,
    reportHealth,
    pendingAccounts,
    lastBackup,
  });

  return (
    <section className="workspace-page">
      <section className="workspace-hero workspace-hero-premium">
        <div className="workspace-hero-premium-grid">
          <div className="workspace-hero-copy">
            <p className="workspace-section-label">Beta Diagnostics</p>
            <h2 className="workspace-hero-title">See whether the beta is genuinely ready before anyone else feels the pain.</h2>
            <p className="workspace-hero-text">This page keeps the current operational state, data coverage, and likely beta weak points together so you can sanity-check the platform in a minute.</p>
          </div>
          <div className="workspace-hero-grid">
            <DiagnosticKpi label="Uploaded sessions" value={sessionsStore?.length || 0} detail="Telemetry uploads currently stored." />
            <DiagnosticKpi label="Planned sessions" value={testSessionsStore?.length || 0} detail="Sessions created in the planning workspace." />
            <DiagnosticKpi label="Setup records" value={setupDatabaseStore?.total_entries || 0} detail="Saved setups available to the setup database." />
            <DiagnosticKpi label="Published reports" value={publishedReports} detail="Audience reports currently marked as published." />
          </div>
        </div>
      </section>

      <div className="grid gap-5">
        <div className="grid gap-5 xl:grid-cols-4">
          <StatusCard eyebrow="Database" title={databaseStatus.ok ? "Healthy" : "Attention"} detail={databaseStatus.ok ? `${databaseStatus.uploaded_session_count || 0} uploads / ${formatBytes(databaseStatus.size_bytes || 0)}` : (databaseStatus.error || "Database check failed")} tone={databaseStatus.ok ? "good" : "warn"} />
          <StatusCard eyebrow="SMTP" title={smtpStatus.ready ? ((smtpStatus.last_delivery?.status || "") === "failed" ? "Failing" : "Configured") : "Not ready"} detail={smtpStatus.ready ? `${smtpStatus.settings?.host || "host missing"}:${smtpStatus.settings?.port || "-"} / ${smtpStatus.settings?.security || "SMTP"}` : "Email settings incomplete"} tone={smtpStatus.ready && smtpStatus.last_delivery?.status !== "failed" ? "good" : "warn"} />
          <StatusCard eyebrow="AI" title={aiStatus.ollama?.reachable || aiStatus.openai?.reachable ? "Available" : "Attention"} detail={`Ollama ${aiStatus.ollama?.reachable ? "ok" : "down"} / OpenAI ${aiStatus.openai?.reachable ? "ok" : "down"}`} tone={aiStatus.ollama?.reachable || aiStatus.openai?.reachable ? "good" : "warn"} />
          <StatusCard eyebrow="Reports" title={reportHealth?.ok ? "Ready" : "Unavailable"} detail={reportHealth?.ok ? "PDF/report runtime healthy" : (reportHealth?.error || "Report engine unavailable")} tone={reportHealth?.ok ? "good" : "warn"} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <article className="app-panel p-5">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="workspace-section-label">Beta Readiness Snapshot</p>
                <h3 className="mt-2 text-2xl font-semibold">What looks solid, and what still needs watching</h3>
              </div>
              <span className="pill pill-neutral">{diagnostics.readyCount}/{diagnostics.items.length} green</span>
            </div>
            <div className="mt-5 grid gap-3">
              {diagnostics.items.map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{item.label}</p>
                      <p className="mt-1 text-sm muted">{item.detail}</p>
                    </div>
                    <span className={`pill ${item.status === "ready" ? "" : item.status === "warning" ? "pill-warn" : "pill-danger"}`}>{item.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="app-panel p-5">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="workspace-section-label">Configuration Snapshot</p>
                <h3 className="mt-2 text-2xl font-semibold">Current beta defaults and coverage</h3>
              </div>
              <span className="pill pill-neutral">{appSettings?.defaultAudience || "coach"} audience</span>
            </div>
            <div className="mt-5 grid gap-3">
              <HealthRow label="Default landing page" detail={appSettings?.defaultLandingScreen || "Home"} status="ok" />
              <HealthRow label="Speed units" detail={appSettings?.speedUnit === "mph" ? "mph" : "km/h"} status="ok" />
              <HealthRow label="AI provider" detail={appSettings?.aiProvider === "openai" ? `OpenAI / ${appSettings?.openAiModel || "model not set"}` : `Ollama / ${appSettings?.aiModel || "model not set"}`} status={aiStatus.ollama?.reachable || aiStatus.openai?.reachable ? "ok" : "warning"} />
              <HealthRow label="Email sender" detail={emailSettings?.fromEmail || "No sender configured"} status={emailSettings?.fromEmail ? "ok" : "warning"} />
              <HealthRow label="Forecast-ready planned sessions" detail={`${forecastReadyCount} of ${testSessionsStore?.length || 0}`} status={forecastReadyCount ? "ok" : "warning"} />
              <HealthRow label="Pending user approvals" detail={`${pendingAccounts}`} status={pendingAccounts ? "warning" : "ok"} />
              <HealthRow label="Latest backup" detail={lastBackup ? `${lastBackup.file_name} / ${formatDateLabel(lastBackup.created_at)}` : "No backup created yet"} status={lastBackup ? "ok" : "warning"} />
              <HealthRow label="Latest email activity" detail={latestEmail ? `${latestEmail.status || "pending"} / ${latestEmail.recipient_email || "No recipient"}` : "No email activity logged"} status={latestEmail?.status === "failed" ? "warning" : latestEmail ? "ok" : "warning"} />
              <HealthRow label="Auth audit coverage" detail={`${authAuditEntries?.length || 0} recent entries`} status={authAuditEntries?.length ? "ok" : "warning"} />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function buildDiagnostics({ databaseStatus, smtpStatus, aiStatus, reportHealth, pendingAccounts, lastBackup }) {
  const items = [
    {
      label: "Database health",
      status: databaseStatus.ok ? "ready" : "warning",
      detail: databaseStatus.ok ? "SQLite is reachable and returning health metadata." : (databaseStatus.error || "Database health check failed."),
    },
    {
      label: "Email delivery",
      status: smtpStatus.ready ? ((smtpStatus.last_delivery?.status || "") === "failed" ? "warning" : "ready") : "warning",
      detail: smtpStatus.ready ? "SMTP settings are present for approvals, resets, and test delivery." : "SMTP is not fully configured yet.",
    },
    {
      label: "AI generation",
      status: aiStatus.ollama?.reachable || aiStatus.openai?.reachable ? "ready" : "warning",
      detail: aiStatus.ollama?.reachable || aiStatus.openai?.reachable ? "At least one AI provider is reachable for reports and chat." : "No AI provider is reachable right now.",
    },
    {
      label: "PDF export",
      status: reportHealth?.ok ? "ready" : "warning",
      detail: reportHealth?.ok ? "The report export runtime is available." : (reportHealth?.error || "The report export runtime is not available."),
    },
    {
      label: "User approvals",
      status: pendingAccounts > 0 ? "warning" : "ready",
      detail: pendingAccounts > 0 ? `${pendingAccounts} account(s) still need approval or review.` : "No pending account approvals are waiting.",
    },
    {
      label: "Backup discipline",
      status: lastBackup ? "ready" : "warning",
      detail: lastBackup ? "A recent database backup exists for rollback safety." : "Create a backup before the next live beta change.",
    },
  ];

  return {
    items,
    readyCount: items.filter((item) => item.status === "ready").length,
  };
}

function DiagnosticKpi({ label, value, detail }) {
  return (
    <div className="workspace-kpi">
      <p className="workspace-kpi-label">{label}</p>
      <p className="workspace-kpi-value">{value}</p>
      <p className="workspace-kpi-detail">{detail}</p>
    </div>
  );
}

function StatusCard({ eyebrow, title, detail, tone = "good" }) {
  return (
    <article className="app-panel p-5">
      <p className="workspace-section-label">{eyebrow}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <h3 className="text-2xl font-semibold">{title}</h3>
        <span className={`pill ${tone === "good" ? "" : tone === "warn" ? "pill-warn" : "pill-danger"}`}>{tone}</span>
      </div>
      <p className="mt-3 text-sm muted">{detail}</p>
    </article>
  );
}

function HealthRow({ label, detail, status }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">{label}</p>
          <p className="mt-1 text-sm muted">{detail}</p>
        </div>
        <span className={`pill ${status === "ok" ? "" : "pill-warn"}`}>{status}</span>
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
