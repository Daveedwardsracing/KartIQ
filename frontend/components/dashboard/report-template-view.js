"use client";

import { useEffect, useMemo, useState } from "react";
import { getSessionDetail, getTestSession } from "@/lib/api";
import { formatDateLabel, formatMetric } from "@/lib/dashboard-utils";

const REPORT_DRIVER_COLOURS = ["#5d8fff", "#59d6c6", "#ffd447", "#f08c8c", "#b68cff"];
const DER_REPORT_LOGO = "/DER_logo_transparent.png";

function audienceLabel(audience) {
  if (audience === "driver") return "Driver Debrief";
  if (audience === "parent") return "Parent Summary";
  return "Coach Report";
}

function setupFieldRows(setup = {}) {
  return [
    ["Front Sprocket", setup.front_sprocket || "Not set"],
    ["Rear Sprocket", setup.rear_sprocket || "Not set"],
    ["Carb Jet", setup.carb_jet || "Not set"],
    ["Axle Length", setup.axle_length || "Not set"],
    ["Axle Type", setup.axle_type || "Not set"],
    ["Tyre Type", setup.tyre_type || "Not set"],
    ["Front Tyre Pressure", setup.front_tyre_pressure === "" || setup.front_tyre_pressure == null ? "Not set" : `${setup.front_tyre_pressure}`],
    ["Rear Tyre Pressure", setup.rear_tyre_pressure === "" || setup.rear_tyre_pressure == null ? "Not set" : `${setup.rear_tyre_pressure}`],
    ["Torsion Bar Type", setup.torsion_bar_type || "Not set"],
    ["Caster Type", setup.caster_type || "Not set"],
    ["Ride Height", setup.ride_height || "Not set"],
  ];
}

function formatForecastTemperature(forecast = {}) {
  const min = forecast.temperature_min_c;
  const max = forecast.temperature_max_c;
  if (min == null && max == null) return "-";
  if (min == null) return `${Number(max).toFixed(0)}C`;
  if (max == null) return `${Number(min).toFixed(0)}C`;
  return `${Number(min).toFixed(0)}C to ${Number(max).toFixed(0)}C`;
}

function formatForecastPercent(value) {
  return value == null ? "-" : `${Number(value).toFixed(0)}%`;
}

function formatForecastMillimetres(value) {
  return value == null ? "-" : `${Number(value).toFixed(1)} mm`;
}

function formatForecastWind(value) {
  return value == null ? "-" : `${Number(value).toFixed(0)} km/h`;
}

function buildExecutiveSummary(analysis, rankedDrivers) {
  const summary = analysis?.summary || {};
  const fastestDriver = summary.fastest_driver || rankedDrivers[0]?.canonical_driver_name || rankedDrivers[0]?.driver_name || "-";
  const bestLap = summary.best_lap_time ?? rankedDrivers[0]?.best_lap ?? null;
  const sectorCount = analysis?.sector_analysis?.length || 0;
  return {
    fastestDriver,
    bestLap,
    driverCount: rankedDrivers.length,
    sectorCount,
  };
}

function reportAudienceConfig(audience) {
  if (audience === "driver") {
    return {
      heroKicker: "Driver debrief",
      heroTitle: "Your next-step report",
      heroFallback: "A driver-focused view of what went well, where the next gains are, and what to apply on the next run.",
      noteTitle: "Coach notes for your next run",
      noteKicker: "Trackside notes",
      setupTitle: "Session setup context",
      setupKicker: "Kart setup",
    };
  }
  if (audience === "parent") {
    return {
      heroKicker: "Parent summary",
      heroTitle: "Progress and next steps",
      heroFallback: "A plain-English summary of how the session went, what progress showed up, and what the team will work on next.",
      noteTitle: "Team notes and context",
      noteKicker: "Support notes",
      setupTitle: "Garage context",
      setupKicker: "Session setup",
    };
  }
  return {
    heroKicker: "Session debrief",
    heroTitle: "Coach report",
    heroFallback: "Structured lap analysis, sector deltas, setup context, and coaching notes for the selected session.",
    noteTitle: "Manual session notes",
    noteKicker: "Coach notes",
    setupTitle: "Session-specific setup sheets",
    setupKicker: "Kart setup",
  };
}

function aggregateReportBullets(reportRows = [], field) {
  return reportRows
    .flatMap((report) => (report?.[field] || []).map((item) => ({
      driverName: report.canonical_driver_name || report.driver_name || "Driver",
      text: item,
    })))
    .filter((item) => item.text)
    .slice(0, 8);
}

function aggregateReportStrings(reportRows = [], field) {
  return reportRows
    .map((report) => ({
      driverName: report.canonical_driver_name || report.driver_name || "Driver",
      text: report?.[field] || "",
    }))
    .filter((item) => item.text);
}

function ReportNarrativeCards({ reports, audience }) {
  if (!reports.length) {
    return <p className="muted">Generate feedback in Report Studio to populate this section.</p>;
  }

  return (
    <div className="report-template-notes">
      {reports.map((report) => (
        <div key={`narrative-${audience}-${report.driver_name}`} className="report-template-note">
          <p className="font-medium">{report.canonical_driver_name || report.driver_name}</p>
          <p className="muted mt-1">{report.format_label}</p>
          {report.headline ? <p className="report-template-mini-heading">{report.headline}</p> : null}
          <p className="mt-3">{report.overall_summary}</p>
          {report.primary_focus ? (
            <>
              <p className="report-template-mini-heading">
                {audience === "parent" ? "Main focus" : "Primary focus"}
              </p>
              <p>{report.primary_focus}</p>
            </>
          ) : null}
          {(report.support_notes || []).length ? (
            <>
              <p className="report-template-mini-heading">
                {audience === "parent" ? "Support note" : "Extra context"}
              </p>
              <ul className="report-template-list">
                {report.support_notes.slice(0, 2).map((item) => <li key={`${report.driver_name}-support-${item}`}>{item}</li>)}
              </ul>
            </>
          ) : null}
          {(report.action_points || []).length ? (
            <>
              <p className="report-template-mini-heading">
                {audience === "parent" ? "What happens next" : "Next actions"}
              </p>
              <ul className="report-template-list">
                {report.action_points.slice(0, 3).map((item) => <li key={`${report.driver_name}-${item}`}>{item}</li>)}
              </ul>
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ReportBulletSection({ kicker, title, items, emptyMessage = "No generated insights are available yet." }) {
  return (
    <div className="report-template-section">
      <div className="report-template-section-header">
        <p className="report-template-kicker report-template-kicker-lime">{kicker}</p>
        <h2>{title}</h2>
      </div>
      {items.length ? (
        <div className="report-template-notes">
          {items.map((item, index) => (
            <div key={`${item.driverName}-${index}-${item.text}`} className="report-template-note">
              <p className="font-medium">{item.driverName}</p>
              <p className="mt-3">{item.text}</p>
            </div>
          ))}
        </div>
      ) : <p className="muted">{emptyMessage}</p>}
    </div>
  );
}

function driverColour(index = 0) {
  return REPORT_DRIVER_COLOURS[index % REPORT_DRIVER_COLOURS.length];
}

function polarPoint(cx, cy, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function donutArcPath(cx, cy, innerRadius, outerRadius, startAngle, endAngle) {
  const startOuter = polarPoint(cx, cy, outerRadius, startAngle);
  const endOuter = polarPoint(cx, cy, outerRadius, endAngle);
  const startInner = polarPoint(cx, cy, innerRadius, startAngle);
  const endInner = polarPoint(cx, cy, innerRadius, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${startInner.x} ${startInner.y}`,
    "Z",
  ].join(" ");
}

function DriverRankingChart({ drivers }) {
  const ranked = drivers
    .slice()
    .sort((left, right) => (left.best_lap ?? 9999) - (right.best_lap ?? 9999));
  const fastest = ranked[0]?.best_lap || 0;
  const slowest = ranked[ranked.length - 1]?.best_lap || fastest || 1;
  const range = Math.max(slowest - fastest, 0.001);

  return (
    <div className="report-template-chart-card">
      <div className="report-template-chart-head">
        <div>
          <p className="report-template-kicker">Chart Snapshot</p>
          <h3>Best lap ranking</h3>
        </div>
        <p className="report-template-chart-meta">{ranked.length} drivers compared</p>
      </div>
      <div className="report-template-bar-chart">
        {ranked.map((driver, index) => {
          const value = driver.best_lap ?? 0;
          const normalized = fastest ? Math.max(0.2, 1 - ((value - fastest) / range) * 0.38) : 1;
          const delta = index === 0 || !fastest ? null : value - fastest;
          return (
            <div key={`${driver.driver_name}-bar`} className="report-template-bar-row">
              <div className="report-template-bar-name">
                <span className="report-template-driver-dot" style={{ backgroundColor: driverColour(index) }} />
                <div>
                  <p>{driver.canonical_driver_name || driver.driver_name}</p>
                  <p className="report-template-bar-subtitle">
                    {index === 0 ? "Session benchmark" : `+${delta.toFixed(3)}s to fastest`}
                  </p>
                </div>
              </div>
              <div className="report-template-bar-track">
                <div
                  className="report-template-bar-fill"
                  style={{
                    width: `${Math.max(18, normalized * 100)}%`,
                    background: `linear-gradient(90deg, ${driverColour(index)}, rgba(255,255,255,0.85))`,
                  }}
                />
                <span className="report-template-bar-value">{formatMetric(value, 3)}s</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectorPerformanceChart({ sectors }) {
  const sectorCount = sectors.length;
  const chartWidth = Math.max(620, sectorCount * 210);
  const chartHeight = 260;
  const leftPad = 72;
  const rightPad = 24;
  const topPad = 22;
  const bottomPad = 48;
  const plotWidth = chartWidth - leftPad - rightPad;
  const plotHeight = chartHeight - topPad - bottomPad;
  const sectorBlockWidth = sectorCount ? plotWidth / sectorCount : plotWidth;
  const allTimes = sectors.flatMap((sector) => sector.drivers?.map((driver) => driver.time) || []);
  const maxTime = Math.max(...allTimes, 1);

  return (
    <div className="report-template-chart-card">
      <div className="report-template-chart-head">
        <div>
          <p className="report-template-kicker">Chart Snapshot</p>
          <h3>Sector performance</h3>
        </div>
        <p className="report-template-chart-meta">Fastest sector per driver visualized</p>
      </div>
      <div className="report-template-svg-wrap">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="report-template-chart-svg" role="img" aria-label="Sector comparison chart">
          {[0, 0.25, 0.5, 0.75, 1].map((step) => {
            const y = topPad + plotHeight * step;
            const labelValue = (maxTime * (1 - step)).toFixed(1);
            return (
              <g key={`grid-${step}`}>
                <line className="report-template-grid-line" x1={leftPad} x2={chartWidth - rightPad} y1={y} y2={y} />
                <text className="report-template-axis-label" x={leftPad - 10} y={y + 4} textAnchor="end">{labelValue}s</text>
              </g>
            );
          })}
          {sectors.map((sector, sectorIndex) => {
            const groupX = leftPad + sectorIndex * sectorBlockWidth;
            const bars = sector.drivers || [];
            const barWidth = Math.min(38, (sectorBlockWidth - 28) / Math.max(bars.length, 1));
            return (
              <g key={sector.sector_name}>
                {bars.map((driver, driverIndex) => {
                  const normalizedHeight = Math.max(0.04, (driver.time || 0) / maxTime);
                  const height = plotHeight * normalizedHeight;
                  const x = groupX + 18 + driverIndex * (barWidth + 10);
                  const y = topPad + plotHeight - height;
                  return (
                    <g key={`${sector.sector_name}-${driver.driver_id || driver.driver_name}`}>
                      <rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={height}
                        rx="10"
                        fill={driverColour(driverIndex)}
                        opacity={driver.delta_to_fastest === 0 ? "1" : "0.82"}
                      />
                      <text className="report-template-bar-label-small" x={x + barWidth / 2} y={y - 8} textAnchor="middle">
                        {formatMetric(driver.time, 3)}
                      </text>
                    </g>
                  );
                })}
                <text className="report-template-axis-title" x={groupX + sectorBlockWidth / 2} y={chartHeight - 14} textAnchor="middle">
                  {sector.sector_name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="report-template-legend">
        {(sectors[0]?.drivers || []).map((driver, index) => (
          <div key={`legend-${driver.driver_name}`} className="report-template-legend-item">
            <span className="report-template-driver-dot" style={{ backgroundColor: driverColour(index) }} />
            <span>{driver.driver_name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConsistencySnapshot({ drivers }) {
  const ranked = drivers
    .slice()
    .sort((left, right) => (left.consistency ?? 999) - (right.consistency ?? 999));
  const best = ranked[0]?.consistency ?? 0;
  const worst = ranked[ranked.length - 1]?.consistency ?? best ?? 1;
  const range = Math.max(worst - best, 0.001);

  return (
    <div className="report-template-chart-card">
      <div className="report-template-chart-head">
        <div>
          <p className="report-template-kicker">Chart Snapshot</p>
          <h3>Session consistency</h3>
        </div>
        <p className="report-template-chart-meta">Lower lap-time sigma is better</p>
      </div>
      <div className="report-template-donut-grid">
        {ranked.map((driver, index) => {
          const value = driver.consistency ?? 0;
          const fillRatio = range ? 1 - (value - best) / range : 1;
          const endAngle = 360 * Math.max(0.12, fillRatio);
          return (
            <div key={`${driver.driver_name}-consistency`} className="report-template-donut-card">
              <svg viewBox="0 0 140 140" className="report-template-donut-svg" role="img" aria-label={`${driver.driver_name} consistency`}>
                <circle cx="70" cy="70" r="46" className="report-template-donut-track" />
                <path d={donutArcPath(70, 70, 34, 46, 0, endAngle)} fill={driverColour(index)} />
                <text x="70" y="66" textAnchor="middle" className="report-template-donut-value">{formatMetric(value, 3)}</text>
                <text x="70" y="84" textAnchor="middle" className="report-template-donut-unit">sigma</text>
              </svg>
              <p className="report-template-donut-name">{driver.canonical_driver_name || driver.driver_name}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ReportTemplateView({
  sessionId = "",
  audience = "coach",
  printMode = false,
  reportType = "analysis",
  testSessionId = "",
  driverIds = [],
}) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(Boolean(sessionId));
  const [error, setError] = useState("");
  const [testSession, setTestSession] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!sessionId && !testSessionId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        if (reportType === "setup" && testSessionId) {
          const data = await getTestSession(testSessionId);
          if (active) {
            setTestSession(data);
            setDetail(null);
          }
        } else {
          const data = await getSessionDetail(sessionId);
          if (active) {
            setDetail(data);
            setTestSession(null);
          }
        }
      } catch (nextError) {
        if (active) {
          setError(nextError.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [sessionId, testSessionId, reportType]);

  const session = detail?.session || null;
  const analysis = session?.analysis || null;
  const drivers = analysis?.drivers || [];
  const reports = detail?.reports || [];
  const notes = detail?.notes || [];
  const sectors = analysis?.sector_analysis || [];
  const corners = analysis?.corner_analysis || [];
  const plannedSession = session?.planned_session || null;

  const rankedDrivers = useMemo(
    () => drivers
      .slice()
      .sort((left, right) => (left.best_lap ?? 9999) - (right.best_lap ?? 9999)),
    [drivers],
  );

  const selectedReport = useMemo(() => {
    const audienceReports = reports.filter((item) => item.audience === audience);
    return (audienceReports[0] || reports[0] || null);
  }, [reports, audience]);

  const setupDrivers = useMemo(() => {
    const allDrivers = testSession?.drivers || [];
    if (!driverIds.length) return allDrivers;
    const selectedSet = new Set(driverIds);
    return allDrivers.filter((driver) => selectedSet.has(driver.id));
  }, [testSession, driverIds]);

  if (!sessionId && !testSessionId) {
    return (
      <div className="report-template-shell">
        <div className="report-template-empty">
          <h1>DER coaching report template</h1>
          <p>Select a session from Report Studio to open the HTML report template.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="report-template-shell">
        <div className="report-template-empty">
          <h1>Loading report…</h1>
        </div>
      </div>
    );
  }

  if (error || (reportType === "setup" ? !testSession : !session)) {
    return (
      <div className="report-template-shell">
        <div className="report-template-empty">
          <h1>Unable to load report</h1>
          <p>{error || "No session data was returned."}</p>
        </div>
      </div>
    );
  }

  if (reportType === "setup" && testSession) {
    return (
      <div className="report-template-shell">
        <div className={`report-template-page ${printMode ? "report-template-page-print" : ""}`} data-report-ready="true">
          <header className="report-template-header report-template-header-hero">
            <div className="report-template-brand-block">
              <img alt="Dave Edwards Racing" className="report-template-logo" src={DER_REPORT_LOGO} />
              <div>
                <p className="report-template-kicker report-template-kicker-lime">Dave Edwards Racing</p>
                <p className="report-template-brand-subtitle">Session Setup Sheet</p>
              </div>
            </div>
            <div className="report-template-header-copy">
              <h1>{testSession.name}</h1>
              <p className="report-template-subtitle">
                {testSession.venue} / {testSession.session_type} / {testSession.date || "No date set"}
              </p>
            </div>
            <div className="report-template-actions no-print">
              <button className="workspace-ghost px-4 py-3 text-sm" onClick={() => window.history.back()} type="button">
                Back
              </button>
              <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" onClick={() => window.print()} type="button">
                Print
              </button>
            </div>
          </header>

          <section className="report-template-grid report-template-grid-4 report-template-stat-band">
            <div className="report-template-card">
              <p className="report-template-label">Report Type</p>
              <p className="report-template-value">SETUP</p>
            </div>
            <div className="report-template-card">
              <p className="report-template-label">Drivers Included</p>
              <p className="report-template-value">{setupDrivers.length}</p>
            </div>
            <div className="report-template-card">
              <p className="report-template-label">Created</p>
              <p className="report-template-value">{formatDateLabel(testSession.created_at)}</p>
            </div>
            <div className="report-template-card">
              <p className="report-template-label">Venue</p>
              <p className="report-template-value report-template-value-small">{testSession.venue || "-"}</p>
            </div>
          </section>

          <section className="report-template-section">
            <div className="report-template-section-header">
              <p className="report-template-kicker report-template-kicker-lime">Session-specific setup</p>
              <h2>Kart setup by driver</h2>
            </div>
            <div className="report-template-driver-sheet-grid">
              {setupDrivers.map((driver) => {
                const setup = driver.setup || {};
                return (
                  <div key={driver.id} className="report-template-driver-sheet">
                    <div className="report-template-driver-sheet-head">
                      <div>
                        <p className="report-template-driver-sheet-name">{driver.name}</p>
                        <p className="muted mt-1">{driver.class_name || "No class"}</p>
                      </div>
                      <span className="report-template-mini-badge">Garage sheet</span>
                    </div>
                    <div className="report-template-setup-grid mt-4">
                      {setupFieldRows(setup).map(([label, value]) => (
                        <div key={`${driver.id}-${label}`} className="report-template-setup-cell">
                          <span className="report-template-setup-label">{label}</span>
                          <span className="report-template-setup-value">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    );
  }

  const executiveSummary = buildExecutiveSummary(analysis, rankedDrivers);
  const audienceConfig = reportAudienceConfig(audience);
  const selectedReportRows = selectedReport?.reports || [];
  const headlineRows = aggregateReportStrings(selectedReportRows, "headline");
  const aggregatedStrengths = aggregateReportBullets(selectedReportRows, "strengths");
  const aggregatedWeaknesses = aggregateReportBullets(selectedReportRows, "weaknesses");
  const aggregatedActions = aggregateReportBullets(selectedReportRows, "action_points");
  const aggregatedTakeaways = aggregateReportBullets(selectedReportRows, "key_takeaways");
  const aggregatedSupportNotes = aggregateReportBullets(selectedReportRows, "support_notes");

  return (
    <div className="report-template-shell">
      <div className={`report-template-page ${printMode ? "report-template-page-print" : ""}`} data-report-ready="true">
        <header className="report-template-header report-template-header-hero">
          <div className="report-template-brand-block">
            <img alt="Dave Edwards Racing" className="report-template-logo" src={DER_REPORT_LOGO} />
            <div>
              <p className="report-template-kicker report-template-kicker-lime">Dave Edwards Racing</p>
              <p className="report-template-brand-subtitle">{audienceLabel(audience)}</p>
            </div>
          </div>
          <div className="report-template-header-copy">
            <h1>{session.event_round}</h1>
            <p className="report-template-subtitle">
              {session.event_name} / {session.session_type} / {formatDateLabel(session.created_at)}
            </p>
          </div>
          <div className="report-template-actions no-print">
            <button className="workspace-ghost px-4 py-3 text-sm" onClick={() => window.history.back()} type="button">
              Back
            </button>
            <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" onClick={() => window.print()} type="button">
              Print
            </button>
          </div>
        </header>

        <section className="report-template-hero-panel">
          <div className="report-template-hero-copy">
            <p className="report-template-kicker report-template-kicker-lime">{audienceConfig.heroKicker}</p>
            <h2>{audienceConfig.heroTitle}</h2>
            <p className="report-template-hero-text">
              {selectedReportRows[0]?.overall_summary || audienceConfig.heroFallback}
            </p>
            {headlineRows.length ? (
              <div className="report-template-notes mt-4">
                {headlineRows.slice(0, 3).map((item) => (
                  <div key={`${item.driverName}-${item.text}`} className="report-template-note">
                    <p className="font-medium">{item.driverName}</p>
                    <p className="mt-3">{item.text}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="report-template-hero-metrics">
            <div className="report-template-hero-metric">
              <span className="report-template-label">{audience === "parent" ? "Fastest driver in session" : "Fastest Driver"}</span>
              <strong>{executiveSummary.fastestDriver}</strong>
            </div>
            <div className="report-template-hero-metric">
              <span className="report-template-label">{audience === "driver" ? "Benchmark lap" : "Best Lap"}</span>
              <strong>{formatMetric(executiveSummary.bestLap, 3)}</strong>
            </div>
            <div className="report-template-hero-metric">
              <span className="report-template-label">{audience === "parent" ? "Drivers reviewed" : "Drivers"}</span>
              <strong>{executiveSummary.driverCount}</strong>
            </div>
            <div className="report-template-hero-metric">
              <span className="report-template-label">{audience === "parent" ? "Named track sections" : "Named Sectors"}</span>
              <strong>{executiveSummary.sectorCount}</strong>
            </div>
          </div>
        </section>

        <section className="report-template-grid report-template-grid-4 report-template-stat-band">
          <div className="report-template-card">
            <p className="report-template-label">Audience</p>
            <p className="report-template-value report-template-value-small">{audienceLabel(audience)}</p>
          </div>
          <div className="report-template-card">
            <p className="report-template-label">Venue</p>
            <p className="report-template-value report-template-value-small">{session.event_name}</p>
          </div>
          <div className="report-template-card">
            <p className="report-template-label">Session Type</p>
            <p className="report-template-value report-template-value-small">{session.session_type}</p>
          </div>
          <div className="report-template-card">
            <p className="report-template-label">Created</p>
            <p className="report-template-value report-template-value-small">{formatDateLabel(session.created_at)}</p>
          </div>
        </section>

        {audience === "coach" ? (
          <>
            <section className="report-template-grid report-template-grid-2 report-template-chart-grid">
              <DriverRankingChart drivers={rankedDrivers} />
              <ConsistencySnapshot drivers={rankedDrivers} />
            </section>

            <section className="report-template-section">
              <div className="report-template-section-header">
                <p className="report-template-kicker">Embedded telemetry visuals</p>
                <h2>Sector charts for the debrief</h2>
              </div>
              {sectors.length ? <SectorPerformanceChart sectors={sectors} /> : <p className="muted mt-4">No sector chart data is available yet.</p>}
            </section>

            <section className="report-template-section">
              <div className="report-template-section-header">
                <p className="report-template-kicker report-template-kicker-lime">Best Lap Summary</p>
                <h2>Driver ranking</h2>
              </div>
              <div className="report-template-table">
                {rankedDrivers.map((driver, index) => (
                  <div key={`${driver.driver_name}-ranking`} className="report-template-table-row">
                    <span>{index + 1}. {driver.canonical_driver_name || driver.driver_name}</span>
                    <span>{formatMetric(driver.best_lap, 3)}{index > 0 && rankedDrivers[0]?.best_lap ? ` (+${(driver.best_lap - rankedDrivers[0].best_lap).toFixed(3)}s)` : ""}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="report-template-grid report-template-grid-2">
              <div className="report-template-section">
                <div className="report-template-section-header">
                  <p className="report-template-kicker report-template-kicker-lime">Sector Delta Summary</p>
                  <h2>Named sector gains</h2>
                </div>
                <div className="report-template-table">
                  {sectors.length ? sectors.map((sector) => (
                    <div key={sector.sector_name} className="report-template-table-row">
                      <span>{sector.sector_name}</span>
                      <span>{sector.fastest_driver ? `${sector.fastest_driver} ${formatMetric(sector.fastest_time, 3)}s` : "-"}</span>
                    </div>
                  )) : <p className="muted">No sector analysis available.</p>}
                </div>
              </div>

              <div className="report-template-section">
                <div className="report-template-section-header">
                  <p className="report-template-kicker report-template-kicker-lime">Corner Highlights</p>
                  <h2>PF mapping summary</h2>
                </div>
                <div className="report-template-notes">
                  {corners.length ? corners.slice(0, 5).map((corner) => (
                    <div key={`${corner.corner_number}-${corner.name}`} className="report-template-note">
                      <p className="font-medium">{corner.name}</p>
                      <p className="muted mt-2">{corner.summary || "Corner-level summary not available yet."}</p>
                    </div>
                  )) : <p className="muted">No named corner analysis available.</p>}
                </div>
              </div>
            </section>
          </>
        ) : null}

        {audience === "driver" ? (
          <>
            <section className="report-template-grid report-template-grid-2">
              <ReportBulletSection
                kicker="What went well"
                title="Positive takeaways to keep"
                items={aggregatedTakeaways.length ? aggregatedTakeaways : aggregatedStrengths}
                emptyMessage="No driver strengths have been generated yet."
              />
              <ReportBulletSection
                kicker="Next focus"
                title="What to work on next run"
                items={aggregatedActions.length ? aggregatedActions : aggregatedWeaknesses}
                emptyMessage="No next-run actions have been generated yet."
              />
            </section>

            <section className="report-template-grid report-template-grid-2">
              <div className="report-template-section">
                <div className="report-template-section-header">
                  <p className="report-template-kicker report-template-kicker-lime">Session Snapshot</p>
                  <h2>Where the pace sits</h2>
                </div>
                <div className="report-template-table">
                  {rankedDrivers.map((driver, index) => (
                    <div key={`${driver.driver_name}-driver-ranking`} className="report-template-table-row">
                      <span>{index + 1}. {driver.canonical_driver_name || driver.driver_name}</span>
                      <span>{formatMetric(driver.best_lap, 3)}{index > 0 && rankedDrivers[0]?.best_lap ? ` (+${(driver.best_lap - rankedDrivers[0].best_lap).toFixed(3)}s)` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="report-template-section">
                <div className="report-template-section-header">
                  <p className="report-template-kicker report-template-kicker-lime">Named Corners</p>
                  <h2>Where the lap is shaped</h2>
                </div>
                <div className="report-template-notes">
                  {corners.length ? corners.slice(0, 4).map((corner) => (
                    <div key={`${corner.corner_number}-${corner.name}-driver`} className="report-template-note">
                      <p className="font-medium">{corner.name}</p>
                      <p className="muted mt-2">{corner.summary || "Corner-level summary not available yet."}</p>
                    </div>
                  )) : <p className="muted">No named corner analysis available.</p>}
                </div>
              </div>
            </section>

            <ReportNarrativeCards reports={selectedReportRows} audience={audience} />

            <ReportBulletSection
              kicker="Support notes"
              title="Extra context for the next run"
              items={aggregatedSupportNotes}
              emptyMessage="No extra context notes have been generated yet."
            />
          </>
        ) : null}

        {audience === "parent" ? (
          <>
            <section className="report-template-grid report-template-grid-2">
              <ReportBulletSection
                kicker="What went well"
                title="Positive signs from the session"
                items={aggregatedTakeaways.length ? aggregatedTakeaways : aggregatedStrengths}
                emptyMessage="No positive takeaways have been generated yet."
              />
              <ReportBulletSection
                kicker="Development focus"
                title="What the team is working on next"
                items={aggregatedActions.length ? aggregatedActions : aggregatedWeaknesses}
                emptyMessage="No development focus has been generated yet."
              />
            </section>

            <section className="report-template-grid report-template-grid-2">
              <div className="report-template-section">
                <div className="report-template-section-header">
                  <p className="report-template-kicker report-template-kicker-lime">Session Overview</p>
                  <h2>Where the session finished</h2>
                </div>
                <div className="report-template-table">
                  {rankedDrivers.map((driver, index) => (
                    <div key={`${driver.driver_name}-parent-ranking`} className="report-template-table-row">
                      <span>{index + 1}. {driver.canonical_driver_name || driver.driver_name}</span>
                      <span>{formatMetric(driver.best_lap, 3)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="report-template-section">
                <div className="report-template-section-header">
                  <p className="report-template-kicker report-template-kicker-lime">Track Focus</p>
                  <h2>Areas that mattered most</h2>
                </div>
                <div className="report-template-notes">
                  {corners.length ? corners.slice(0, 3).map((corner) => (
                    <div key={`${corner.corner_number}-${corner.name}-parent`} className="report-template-note">
                      <p className="font-medium">{corner.name}</p>
                      <p className="mt-3">{corner.summary || "Corner-level summary not available yet."}</p>
                    </div>
                  )) : <p className="muted">No named corner analysis available.</p>}
                </div>
              </div>
            </section>

            <ReportNarrativeCards reports={selectedReportRows} audience={audience} />

            <ReportBulletSection
              kicker="Support notes"
              title="What the team will keep in mind next"
              items={aggregatedSupportNotes}
              emptyMessage="No support notes have been generated yet."
            />
          </>
        ) : null}

        <section className="report-template-grid report-template-grid-2">
          {plannedSession?.weather_forecast?.summary ? (
            <div className="report-template-section">
              <div className="report-template-section-header">
                <p className="report-template-kicker report-template-kicker-lime">Weather context</p>
                <h2>Forecast snapshot for the planned session</h2>
              </div>
              <div className="report-template-driver-sheet-grid">
                <div className="report-template-driver-sheet">
                  <div className="report-template-driver-sheet-head">
                    <div>
                      <p className="report-template-driver-sheet-name">{plannedSession.weather_forecast.location_name || plannedSession.venue || session.event_name}</p>
                      <p className="muted mt-1">{plannedSession.weather_forecast.forecast_date || plannedSession.date || "No date set"}</p>
                    </div>
                    <span className="report-template-mini-badge">Forecast</span>
                  </div>
                  <div className="report-template-setup-grid mt-4">
                    {[
                      ["Summary", plannedSession.weather_forecast.summary || "-"],
                      ["Conditions", plannedSession.weather_forecast.weather_label || "-"],
                      ["Temperature", formatForecastTemperature(plannedSession.weather_forecast)],
                      ["Rain Risk", formatForecastPercent(plannedSession.weather_forecast.rain_probability_pct)],
                      ["Precipitation", formatForecastMillimetres(plannedSession.weather_forecast.precipitation_mm)],
                      ["Wind", formatForecastWind(plannedSession.weather_forecast.wind_kph)],
                    ].map(([label, value]) => (
                      <div key={`forecast-${label}`} className="report-template-setup-cell">
                        <span className="report-template-setup-label">{label}</span>
                        <span className="report-template-setup-value">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {plannedSession?.drivers?.length ? (
            <div className="report-template-section">
              <div className="report-template-section-header">
                <p className="report-template-kicker report-template-kicker-lime">{audienceConfig.setupKicker}</p>
                <h2>{audienceConfig.setupTitle}</h2>
              </div>
              <div className="report-template-driver-sheet-grid">
                {plannedSession.drivers.map((driver) => {
                  const setup = driver.setup || {};
                  return (
                    <div key={`${driver.id}-setup-report`} className="report-template-driver-sheet">
                      <div className="report-template-driver-sheet-head">
                        <div>
                          <p className="report-template-driver-sheet-name">{driver.name}</p>
                          <p className="muted mt-1">{driver.class_name || "No class"}</p>
                        </div>
                        <span className="report-template-mini-badge">Setup</span>
                      </div>
                      <div className="report-template-setup-grid mt-4">
                        {setupFieldRows(setup).map(([label, value]) => (
                          <div key={`${driver.id}-${label}`} className="report-template-setup-cell">
                            <span className="report-template-setup-label">{label}</span>
                            <span className="report-template-setup-value">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="report-template-section">
            <div className="report-template-section-header">
              <p className="report-template-kicker report-template-kicker-lime">{audienceConfig.noteKicker}</p>
              <h2>{audienceConfig.noteTitle}</h2>
            </div>
            <div className="report-template-notes">
              {notes.length ? notes.map((note) => (
                <div key={note.id} className="report-template-note">
                  <p className="font-medium">{note.title}</p>
                  <p className="muted mt-1">{note.driver_name || "Whole session"}</p>
                  <p className="mt-3">{note.body}</p>
                  {note.next_actions?.length ? (
                    <ul className="mt-3 report-template-list">
                      {note.next_actions.map((item) => <li key={`${note.id}-${item}`}>{item}</li>)}
                    </ul>
                  ) : null}
                </div>
              )) : <p className="muted">No manual coaching notes have been added yet.</p>}
            </div>
          </div>

          {audience === "coach" ? (
            <div className="report-template-section">
              <div className="report-template-section-header">
                <p className="report-template-kicker report-template-kicker-lime">AI Narrative</p>
                <h2>Generated debrief</h2>
              </div>
              <ReportNarrativeCards reports={selectedReportRows} audience={audience} />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
