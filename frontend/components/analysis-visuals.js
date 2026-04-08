"use client";

import { useEffect, useState } from "react";

const DRIVER_COLORS = ["#5d8fff", "#74d2a8", "#f1c26b", "#f08c8c", "#b48dff", "#63d2ff"];

export default function AnalysisVisuals({ analysis }) {
  const [selectedDrivers, setSelectedDrivers] = useState(() => analysis?.drivers?.map((driver) => driver.driver_name) || []);
  const [focusedDriver, setFocusedDriver] = useState(analysis?.drivers?.[0]?.driver_name || null);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  useEffect(() => {
    if (!analysis?.drivers?.length) {
      setSelectedDrivers([]);
      setFocusedDriver(null);
      setHoveredPoint(null);
      return;
    }
    setSelectedDrivers(analysis.drivers.map((driver) => driver.driver_name));
    setFocusedDriver(analysis.drivers[0]?.driver_name || null);
    setHoveredPoint(null);
  }, [analysis]);

  if (!analysis?.drivers?.length) {
    return null;
  }

  const visibleDrivers = analysis.drivers.filter((driver) => selectedDrivers.includes(driver.driver_name));
  const comparisonDrivers = visibleDrivers.length ? visibleDrivers : analysis.drivers.slice(0, 1);
  const fastest = analysis.drivers[0];
  const spotlightDriver = analysis.drivers.find((driver) => driver.driver_name === focusedDriver) || comparisonDrivers[0];
  const maxLapDelta = Math.max(...comparisonDrivers.map((driver) => Number(driver.lap_delta_to_fastest) || 0), 0.1);
  const sectorNames = fastest.sector_comparison?.map((sector) => sector.name) || [];

  function toggleDriver(driverName) {
    setSelectedDrivers((current) => {
      if (current.includes(driverName)) {
        return current.length === 1 ? current : current.filter((name) => name !== driverName);
      }
      return [...current, driverName];
    });
    setFocusedDriver(driverName);
  }

  return (
    <div className="grid gap-5">
      <article className="app-panel p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Comparison Focus</p>
            <h3 className="mt-1 text-lg font-semibold">Choose who appears on the charts</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {analysis.drivers.map((driver, index) => {
              const active = selectedDrivers.includes(driver.driver_name);
              return (
                <button
                  key={driver.driver_name}
                  className={`pill selection-pill px-3 py-2 text-xs ${active ? "is-selected" : "pill-neutral"}`}
                  onClick={() => toggleDriver(driver.driver_name)}
                  type="button"
                >
                  <span className="selection-pill-marker" aria-hidden="true">✓</span>
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: DRIVER_COLORS[index % DRIVER_COLORS.length] }} />
                  {driver.driver_name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <SpotlightCard label="Focused Driver" value={spotlightDriver?.driver_name || "-"} />
          <SpotlightCard label="Best Lap" value={formatSeconds(spotlightDriver?.best_lap)} />
          <SpotlightCard label="Gap To Fastest" value={formatSeconds(spotlightDriver?.lap_delta_to_fastest, true)} />
          <SpotlightCard label="Consistency" value={formatSeconds(spotlightDriver?.consistency)} />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <SpotlightCard label="Time Loss" value={spotlightDriver?.time_loss_hint || "-"} compact />
          <SpotlightCard label="Avg Top 3 Speed" value={formatNumber(spotlightDriver?.average_best_3_speed, " mph")} compact />
          <SpotlightCard label="Min Corner Speed" value={formatNumber(spotlightDriver?.minimum_corner_speed, " mph")} compact />
        </div>
      </article>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="app-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Lap Delta</p>
              <h3 className="mt-1 text-lg font-semibold">Gap to fastest driver</h3>
            </div>
            <span className="badge">{fastest.driver_name} benchmark</span>
          </div>
          <div className="mt-5 grid gap-4">
            {comparisonDrivers.map((driver, index) => (
              <div key={driver.driver_name} className="grid gap-2">
                <div className="flex items-center justify-between text-sm">
                  <button className="text-left" onClick={() => setFocusedDriver(driver.driver_name)} type="button">{driver.driver_name}</button>
                  <span className="muted">{formatSeconds(driver.lap_delta_to_fastest, true)}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-950/60">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max((Math.abs(Number(driver.lap_delta_to_fastest) || 0) / maxLapDelta) * 100, driver.lap_delta_to_fastest === 0 ? 8 : 0)}%`,
                      background: DRIVER_COLORS[index % DRIVER_COLORS.length]
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="app-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Sector Comparison</p>
              <h3 className="mt-1 text-lg font-semibold">Best sector times by driver</h3>
            </div>
          </div>
          <SectorBars drivers={comparisonDrivers} sectorNames={sectorNames} onFocusDriver={setFocusedDriver} />
        </article>
      </div>

      <article className="app-panel p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Lap Trend</p>
            <h3 className="mt-1 text-lg font-semibold">Lap-by-lap delta overlay</h3>
          </div>
          <span className="badge">Best lap as zero line</span>
        </div>
        <LapDeltaLineChart drivers={comparisonDrivers} hoveredPoint={hoveredPoint} onFocusDriver={setFocusedDriver} onHoverPoint={setHoveredPoint} />
        <div className="mt-4 grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <p className="text-sm font-medium">Hover Readout</p>
            <p className="mt-3 text-sm muted">
              {hoveredPoint
                ? `${hoveredPoint.driver_name} lap ${hoveredPoint.lap_number}: ${formatSeconds(hoveredPoint.lap_time)} (${formatSeconds(hoveredPoint.delta, true)} to fastest on that lap)`
                : "Hover a point on the lap trend chart to inspect that lap's delta."}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <p className="text-sm font-medium">Quick Comparison</p>
            <div className="mt-3 grid gap-2 text-sm muted">
              {comparisonDrivers.map((driver) => (
                <div key={driver.driver_name} className="flex items-center justify-between gap-4">
                  <button className="text-left text-slate-100" onClick={() => setFocusedDriver(driver.driver_name)} type="button">{driver.driver_name}</button>
                  <span>{formatSeconds(driver.best_lap)} best lap</span>
                  <span>{formatSeconds(driver.lap_delta_to_fastest, true)} delta</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

function SectorBars({ drivers, sectorNames, onFocusDriver }) {
  if (!sectorNames.length) {
    return <p className="mt-4 text-sm muted">No sector data detected in this upload.</p>;
  }

  const sectorMaxima = sectorNames.map((sectorName) => {
    return Math.max(
      ...drivers.map((driver) => getSectorMetric(driver, sectorName, "best") || 0),
      0.001
    );
  });

  return (
    <div className="mt-5 grid gap-5">
      {sectorNames.map((sectorName, sectorIndex) => (
        <div key={sectorName} className="grid gap-3">
          <div className="flex items-center justify-between text-sm">
            <span>{sectorName}</span>
            <span className="muted">Best time lower is better</span>
          </div>
          {drivers.map((driver, index) => {
            const value = getSectorMetric(driver, sectorName, "best");
            const width = value ? (value / sectorMaxima[sectorIndex]) * 100 : 0;
            return (
              <div key={`${sectorName}-${driver.driver_name}`} className="grid gap-2">
                <div className="flex items-center justify-between text-xs muted">
                  <button className="text-left text-slate-100" onClick={() => onFocusDriver(driver.driver_name)} type="button">{driver.driver_name}</button>
                  <span>{formatSeconds(value)}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-950/60">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(width, 4)}%`,
                      background: DRIVER_COLORS[index % DRIVER_COLORS.length]
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function LapDeltaLineChart({ drivers, hoveredPoint, onFocusDriver, onHoverPoint }) {
  const series = buildLapDeltaSeries(drivers);
  if (!series.length) {
    return <p className="mt-4 text-sm muted">No lap table data detected in this upload.</p>;
  }

  const width = 920;
  const height = 260;
  const padding = 28;
  const maxLaps = Math.max(...series.map((driver) => driver.points.length), 1);
  const maxDelta = Math.max(...series.flatMap((driver) => driver.points.map((point) => point.delta)), 0.1);

  const xFor = (lapNumber) => {
    if (maxLaps <= 1) return padding;
    return padding + ((lapNumber - 1) / (maxLaps - 1)) * (width - padding * 2);
  };
  const yFor = (delta) => {
    return height - padding - (delta / maxDelta) * (height - padding * 2);
  };

  return (
    <div className="mt-5">
      <svg className="w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Lap delta chart">
        <rect x="0" y="0" width={width} height={height} rx="16" fill="rgba(7, 14, 25, 0.45)" />
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = padding + tick * (height - padding * 2);
          const deltaLabel = formatSeconds((1 - tick) * maxDelta, true);
          return (
            <g key={tick}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="rgba(148, 167, 198, 0.18)" strokeDasharray="4 6" />
              <text x="4" y={y + 4} fontSize="10" fill="#94a7c6">{deltaLabel}</text>
            </g>
          );
        })}
        {Array.from({ length: maxLaps }).map((_, index) => {
          const x = xFor(index + 1);
          return (
            <g key={index}>
              <line x1={x} y1={padding} x2={x} y2={height - padding} stroke="rgba(148, 167, 198, 0.1)" />
              <text x={x} y={height - 6} fontSize="10" fill="#94a7c6" textAnchor="middle">L{index + 1}</text>
            </g>
          );
        })}
        {series.map((driver, index) => {
          const color = DRIVER_COLORS[index % DRIVER_COLORS.length];
          const path = driver.points.map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${xFor(point.lap_number)} ${yFor(point.delta)}`).join(" ");
          return (
            <g key={driver.driver_name}>
              <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              {driver.points.map((point) => (
                <circle
                  key={`${driver.driver_name}-${point.lap_number}`}
                  cx={xFor(point.lap_number)}
                  cy={yFor(point.delta)}
                  r={hoveredPoint?.driver_name === driver.driver_name && hoveredPoint?.lap_number === point.lap_number ? "6" : "4"}
                  fill={color}
                  onClick={() => onFocusDriver(driver.driver_name)}
                  onMouseEnter={() => onHoverPoint(point)}
                  onMouseLeave={() => onHoverPoint(null)}
                  style={{ cursor: "pointer" }}
                />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="mt-4 flex flex-wrap gap-3">
        {series.map((driver, index) => (
          <div key={driver.driver_name} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: DRIVER_COLORS[index % DRIVER_COLORS.length] }} />
            <span>{driver.driver_name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildLapDeltaSeries(drivers) {
  const allLapTimes = drivers.map((driver) => driver.lap_table || []);
  const fastestByLap = {};

  allLapTimes.forEach((laps) => {
    laps.forEach((lap) => {
      if (fastestByLap[lap.lap_number] === undefined || lap.lap_time < fastestByLap[lap.lap_number]) {
        fastestByLap[lap.lap_number] = lap.lap_time;
      }
    });
  });

  return drivers.map((driver) => ({
    driver_name: driver.driver_name,
    points: (driver.lap_table || []).map((lap) => ({
      lap_number: lap.lap_number,
      lap_time: lap.lap_time,
      delta: round(lap.lap_time - fastestByLap[lap.lap_number], 3)
    }))
  })).filter((driver) => driver.points.length);
}

function getSectorMetric(driver, sectorName, key) {
  return driver.sector_comparison?.find((sector) => sector.name === sectorName)?.[key] ?? null;
}

function formatSeconds(value, signed = false) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  const numeric = Number(value);
  const fixed = numeric.toFixed(3);
  return signed && numeric > 0 ? `+${fixed}s` : `${fixed}s`;
}

function formatNumber(value, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return `${Number(value).toFixed(1)}${suffix}`;
}

function SpotlightCard({ label, value, compact = false }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-slate-950/35 p-4 ${compact ? "min-h-0" : ""}`}>
      <p className="text-sm muted">{label}</p>
      <p className={`mt-2 ${compact ? "text-sm" : "text-lg"} font-semibold`}>{value}</p>
    </div>
  );
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
