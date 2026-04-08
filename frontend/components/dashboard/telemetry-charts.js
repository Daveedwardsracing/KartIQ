import { useState } from "react";
import { formatMetric } from "@/lib/dashboard-utils";

const SVG_WIDTH = 960;
const SVG_HEIGHT = 420;
const PADDING = { top: 28, right: 28, bottom: 44, left: 56 };

export function LapTimeTrendChart({ drivers }) {
  const series = buildSeries(drivers, "time");
  return (
    <TelemetryChartCard
      title="Lap Time Trend"
      description="See how each driver's lap times evolve across the session."
      emptyMessage="No lap-time data available for this session."
    >
      <LineChart
        series={series}
        valueFormatter={(value) => `${value.toFixed(3)}s`}
        yAxisLabel="Lap time"
      />
    </TelemetryChartCard>
  );
}

export function LapDeltaTrendChart({ drivers }) {
  const series = buildSeries(drivers, "delta");
  return (
    <TelemetryChartCard
      title="Lap Delta To Driver Best"
      description="Track how far each lap sits away from that driver's own best lap."
      emptyMessage="No lap-delta data available for this session."
    >
      <LineChart
        series={series}
        valueFormatter={(value) => `${value.toFixed(3)}s`}
        yAxisLabel="Delta"
      />
    </TelemetryChartCard>
  );
}

export function CustomLapMetricChart({ drivers, metricKey, title, description, unit, mode = "line", valueTransform }) {
  const series = buildSeries(drivers, metricKey);
  const bars = [];
  drivers.forEach((driver) => {
    driver.lapRows.forEach((lap) => {
      if (typeof lap?.[metricKey] === "number" && Number.isFinite(lap[metricKey])) {
        bars.push({
          id: `${driver.id}-${lap.label}`,
          label: `${driver.name} ${lap.label}`,
          shortLabel: lap.label,
          groupLabel: driver.name,
          colour: driver.colour,
          value: lap[metricKey],
        });
      }
    });
  });

  return (
    <TelemetryChartCard title={title} description={description} emptyMessage={`No ${title.toLowerCase()} data available for the selected laps.`}>
      {mode === "bar" ? (
        <GroupedBarChart bars={bars} unit={unit} />
      ) : (
        <LineChart
          series={series}
          valueFormatter={(value) => {
            const displayValue = typeof valueTransform === "function" ? valueTransform(value) : value;
            return `${formatMetric(displayValue, 3)}${unit ? ` ${unit}` : ""}`;
          }}
          yAxisLabel={title}
        />
      )}
    </TelemetryChartCard>
  );
}

export function LapMetricBarChart({ drivers, metricKey, title, description, unit, valueTransform }) {
  const bars = [];
  drivers.forEach((driver) => {
    driver.lapRows.forEach((lap) => {
      if (typeof lap[metricKey] === "number" && Number.isFinite(lap[metricKey])) {
        bars.push({
          id: `${driver.id}-${lap.label}`,
          label: `${driver.name} ${lap.label}`,
          shortLabel: lap.label,
          groupLabel: driver.name,
          colour: driver.colour,
          value: lap[metricKey],
        });
      }
    });
  });

  return (
    <TelemetryChartCard title={title} description={description} emptyMessage={`No ${title.toLowerCase()} data available.`}>
      <GroupedBarChart bars={bars} unit={unit} valueTransform={valueTransform} />
    </TelemetryChartCard>
  );
}

export function BestLapTraceChart({ drivers, channelKey, channelLabel }) {
  const series = drivers
    .filter((driver) => Array.isArray(driver.bestLapTrace) && driver.bestLapTrace.length)
    .map((driver) => ({
      id: driver.id,
      label: driver.name,
      colour: driver.colour,
      points: driver.bestLapTrace
        .filter((point) => typeof point?.normalized_distance === "number" && typeof point?.[channelKey] === "number")
        .map((point) => ({
          x: point.normalized_distance,
          y: point[channelKey],
        })),
    }))
    .filter((driver) => driver.points.length > 1);

  return (
    <TelemetryChartCard
      title={`Best Lap ${channelLabel} Trace`}
      description={`Overlay each driver's best lap ${channelLabel.toLowerCase()} trace across the lap distance.`}
      emptyMessage={`No ${channelLabel.toLowerCase()} trace data available for this session.`}
    >
      <LineChart
        series={series}
        valueFormatter={(value) => `${formatMetric(value, 3)}`}
        yAxisLabel={channelLabel}
        xAxisLabel="Lap distance"
        domain={{ min: 0, max: 1 }}
        xValueFormatter={(value) => `${Math.round(value * 100)}%`}
      />
    </TelemetryChartCard>
  );
}

export function DistancePlaybackChart({
  series,
  title,
  description,
  yAxisLabel,
  valueFormatter,
  hoveredDistance = null,
  onHoverDistanceChange,
  zoomWindow = { min: 0, max: 1 },
  onZoomWindowChange,
  scrubberValue = null,
  onScrubberValueChange,
  onResetScrubber,
  compact = false,
}) {
  const scrubberDistance = scrubberValue ?? hoveredDistance;
  const zoomMin = typeof zoomWindow?.min === "number" ? zoomWindow.min : 0;
  const zoomMax = typeof zoomWindow?.max === "number" ? zoomWindow.max : 1;
  const zoomPercent = Math.round((zoomMax - zoomMin) * 100);
  const zoomCenter = typeof scrubberDistance === "number" ? scrubberDistance : (zoomMin + zoomMax) / 2;

  const updateZoomWindow = (nextMin, nextMax) => {
    onZoomWindowChange?.({
      min: clamp(nextMin, 0, 1),
      max: clamp(nextMax, 0, 1),
    });
  };

  const zoomAroundCenter = (factor) => {
    const currentWidth = Math.max(zoomMax - zoomMin, 0.02);
    const nextWidth = clamp(currentWidth * factor, 0.02, 1);
    let nextMin = zoomCenter - (nextWidth / 2);
    let nextMax = zoomCenter + (nextWidth / 2);
    if (nextMin < 0) {
      nextMax -= nextMin;
      nextMin = 0;
    }
    if (nextMax > 1) {
      nextMin -= (nextMax - 1);
      nextMax = 1;
    }
    updateZoomWindow(nextMin, nextMax);
  };

  return (
    <TelemetryChartCard
      title={title}
      description={description}
      emptyMessage={`No ${title.toLowerCase()} data is available for the selected laps.`}
      className={compact ? "telemetry-chart-card-compact" : ""}
    >
      <div className="telemetry-zoom-toolbar">
        <div className="telemetry-zoom-chip">Viewing {zoomPercent}% of lap</div>
        <div className="telemetry-zoom-actions">
          <button className="telemetry-zoom-button" type="button" onClick={() => zoomAroundCenter(0.6)}>
            Zoom in
          </button>
          <button className="telemetry-zoom-button" type="button" onClick={() => zoomAroundCenter(1.6)}>
            Zoom out
          </button>
          <button className="telemetry-zoom-button" type="button" onClick={() => updateZoomWindow(0, 1)}>
            Reset zoom
          </button>
        </div>
      </div>
      <InteractiveDistanceLineChart
        series={series}
        valueFormatter={valueFormatter}
        xValueFormatter={(value) => `${Math.round(value * 100)}%`}
        xAxisLabel="Lap distance"
        yAxisLabel={yAxisLabel}
        domain={{ min: zoomMin, max: zoomMax }}
        hoveredDistance={scrubberDistance}
        onHoverDistanceChange={onHoverDistanceChange}
      />
      <div className="telemetry-scrubber-row">
        <label className="telemetry-scrubber-label" htmlFor={`scrubber-${title.replace(/\s+/g, "-").toLowerCase()}`}>
          Scrub position
        </label>
        <input
          id={`scrubber-${title.replace(/\s+/g, "-").toLowerCase()}`}
          className="telemetry-scrubber-input"
          type="range"
          min="0"
          max="1000"
          step="1"
          value={Math.round((scrubberDistance ?? 0) * 1000)}
          onChange={(event) => onScrubberValueChange?.(Number(event.target.value) / 1000)}
        />
        <div className="telemetry-scrubber-meta">
          <span>{Math.round((scrubberDistance ?? 0) * 100)}%</span>
          <button className="telemetry-scrubber-reset" onClick={onResetScrubber} type="button">
            Reset
          </button>
        </div>
      </div>
    </TelemetryChartCard>
  );
}

function TelemetryChartCard({ title, description, emptyMessage, children, className = "" }) {
  const hasContent = Boolean(children);
  return (
    <article className={`telemetry-chart-card ${className}`.trim()}>
      <div className="telemetry-chart-card-header">
        <div>
          <p className="workspace-section-label">{title}</p>
          <p className="telemetry-chart-card-description">{description}</p>
        </div>
      </div>
      {hasContent ? children : <p className="muted">{emptyMessage}</p>}
    </article>
  );
}

function LineChart({
  series,
  valueFormatter,
  xValueFormatter = (value) => String(value),
  xAxisLabel = "Lap",
  yAxisLabel = "",
  domain = null,
}) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const flatPoints = series.flatMap((item) => item.points || []);
  if (!flatPoints.length) {
    return null;
  }

  const xMin = domain?.min ?? Math.min(...flatPoints.map((point) => point.x));
  const xMax = domain?.max ?? Math.max(...flatPoints.map((point) => point.x));
  const yMinRaw = Math.min(...flatPoints.map((point) => point.y));
  const yMaxRaw = Math.max(...flatPoints.map((point) => point.y));
  const yPadding = yMinRaw === yMaxRaw ? 1 : (yMaxRaw - yMinRaw) * 0.12;
  const yMin = yMinRaw - yPadding;
  const yMax = yMaxRaw + yPadding;
  const chartWidth = SVG_WIDTH - PADDING.left - PADDING.right;
  const chartHeight = SVG_HEIGHT - PADDING.top - PADDING.bottom;

  const toX = (value) => PADDING.left + (((value - xMin) / Math.max(xMax - xMin, 1e-9)) * chartWidth);
  const toY = (value) => PADDING.top + chartHeight - (((value - yMin) / Math.max(yMax - yMin, 1e-9)) * chartHeight);

  const yTicks = buildTicks(yMin, yMax, 5);
  const xTicks = domain ? buildTicks(xMin, xMax, 5) : buildLapTicks(series);

  return (
    <div className="telemetry-chart-shell">
      {hoveredPoint ? (
        <div
          className="telemetry-chart-tooltip"
          style={{
            left: `${Math.max(12, Math.min(88, (hoveredPoint.cx / SVG_WIDTH) * 100))}%`,
            top: `${Math.max(8, ((hoveredPoint.cy / SVG_HEIGHT) * 100) - 10)}%`,
          }}
        >
          <p className="telemetry-chart-tooltip-label">{hoveredPoint.label}</p>
          <p className="telemetry-chart-tooltip-value">{hoveredPoint.xLabel}</p>
          <p className="telemetry-chart-tooltip-value">{hoveredPoint.yLabel}</p>
        </div>
      ) : null}
      <svg className="telemetry-chart-svg" viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} preserveAspectRatio="none">
        {yTicks.map((tick) => (
          <g key={`y-${tick.value}`}>
            <line className="telemetry-grid-line" x1={PADDING.left} x2={SVG_WIDTH - PADDING.right} y1={toY(tick.value)} y2={toY(tick.value)} />
            <text className="telemetry-axis-label" x={PADDING.left - 10} y={toY(tick.value) + 4} textAnchor="end">
              {valueFormatter(tick.value)}
            </text>
          </g>
        ))}

        {xTicks.map((tick) => (
          <g key={`x-${tick.value}`}>
            <line className="telemetry-grid-line telemetry-grid-line-vertical" x1={toX(tick.value)} x2={toX(tick.value)} y1={PADDING.top} y2={SVG_HEIGHT - PADDING.bottom} />
            <text className="telemetry-axis-label" x={toX(tick.value)} y={SVG_HEIGHT - 10} textAnchor="middle">
              {xValueFormatter(tick.value)}
            </text>
          </g>
        ))}

        {series.map((item) => (
          <g key={item.id}>
            <path
              d={buildLinePath(item.points, toX, toY)}
              fill="none"
              stroke={item.colour}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {item.points.map((point, index) => (
              <g key={`${item.id}-${index}`}>
                <circle
                  className="telemetry-point-hitbox"
                  cx={toX(point.x)}
                  cy={toY(point.y)}
                  r="12"
                  fill="transparent"
                  onMouseEnter={() => setHoveredPoint({
                    label: item.label,
                    xLabel: `${xAxisLabel}: ${xValueFormatter(point.x)}`,
                    yLabel: `${yAxisLabel || "Value"}: ${valueFormatter(point.y)}`,
                    cx: toX(point.x),
                    cy: toY(point.y),
                  })}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
                <circle
                  className="telemetry-point-dot"
                  cx={toX(point.x)}
                  cy={toY(point.y)}
                  r="4.5"
                  fill={item.colour}
                />
              </g>
            ))}
          </g>
        ))}

        {yAxisLabel ? (
          <text className="telemetry-axis-title" x="18" y={SVG_HEIGHT / 2} textAnchor="middle" transform={`rotate(-90 18 ${SVG_HEIGHT / 2})`}>
            {yAxisLabel}
          </text>
        ) : null}
        <text className="telemetry-axis-title" x={SVG_WIDTH / 2} y={SVG_HEIGHT - 2} textAnchor="middle">
          {xAxisLabel}
        </text>
      </svg>

      <div className="telemetry-chart-legend">
        {series.map((item) => (
          <div key={item.id} className="telemetry-chart-legend-item">
            <span className="telemetry-chart-legend-swatch" style={{ backgroundColor: item.colour }} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupedBarChart({ bars, unit, valueTransform }) {
  if (!bars.length) {
    return null;
  }
  const maxValue = Math.max(...bars.map((bar) => bar.value), 1);
  return (
    <div className="telemetry-bar-list">
      {bars.map((bar) => (
        <div key={bar.id} className="telemetry-bar-row">
          <div className="telemetry-bar-meta">
            <span className="telemetry-bar-group" style={{ color: bar.colour }}>{bar.groupLabel}</span>
            <span className="telemetry-bar-label">{bar.shortLabel}</span>
          </div>
          <div className="telemetry-bar-track">
            <div className="telemetry-bar-fill" style={{ width: `${(bar.value / maxValue) * 100}%`, backgroundColor: bar.colour }} />
          </div>
          <span className="telemetry-bar-value">{formatMetric(typeof valueTransform === "function" ? valueTransform(bar.value) : bar.value, 3)}{unit ? ` ${unit}` : ""}</span>
        </div>
      ))}
    </div>
  );
}

function InteractiveDistanceLineChart({
  series,
  valueFormatter,
  xValueFormatter,
  xAxisLabel,
  yAxisLabel,
  domain,
  hoveredDistance,
  onHoverDistanceChange,
}) {
  const flatPoints = series
    .flatMap((item) => item.points || [])
    .filter((point) => point.x >= (domain?.min ?? 0) && point.x <= (domain?.max ?? 1));
  if (!flatPoints.length) {
    return null;
  }

  const xMin = domain?.min ?? Math.min(...flatPoints.map((point) => point.x));
  const xMax = domain?.max ?? Math.max(...flatPoints.map((point) => point.x));
  const yMinRaw = Math.min(...flatPoints.map((point) => point.y));
  const yMaxRaw = Math.max(...flatPoints.map((point) => point.y));
  const yPadding = yMinRaw === yMaxRaw ? 1 : (yMaxRaw - yMinRaw) * 0.12;
  const yMin = yMinRaw - yPadding;
  const yMax = yMaxRaw + yPadding;
  const chartWidth = SVG_WIDTH - PADDING.left - PADDING.right;
  const chartHeight = SVG_HEIGHT - PADDING.top - PADDING.bottom;

  const toX = (value) => PADDING.left + (((value - xMin) / Math.max(xMax - xMin, 1e-9)) * chartWidth);
  const toY = (value) => PADDING.top + chartHeight - (((value - yMin) / Math.max(yMax - yMin, 1e-9)) * chartHeight);
  const fromX = (pixelX) => xMin + (((pixelX - PADDING.left) / Math.max(chartWidth, 1e-9)) * (xMax - xMin));

  const yTicks = buildTicks(yMin, yMax, 5);
  const xTicks = buildTicks(xMin, xMax, 5);
  const hoverX = hoveredDistance !== null && hoveredDistance !== undefined ? Math.max(xMin, Math.min(xMax, hoveredDistance)) : null;
  const hoverValues = hoverX === null
    ? []
    : series
        .map((item) => {
          const point = interpolateSeriesPoint(item.points, hoverX);
          if (!point) {
            return null;
          }
          return {
            id: item.id,
            label: item.label,
            colour: item.colour,
            x: hoverX,
            y: point.y,
          };
        })
        .filter(Boolean);

  const updateHoverFromEvent = (event) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const cursor = point.matrixTransform(svg.getScreenCTM()?.inverse());
    onHoverDistanceChange?.(Math.max(xMin, Math.min(xMax, fromX(cursor.x))));
  };

  return (
    <div className="telemetry-chart-shell">
      {hoverX !== null && hoverValues.length ? (
        <div
          className="telemetry-chart-tooltip"
          style={{
            left: `${Math.max(12, Math.min(88, (toX(hoverX) / SVG_WIDTH) * 100))}%`,
            top: "10%",
          }}
        >
          <p className="telemetry-chart-tooltip-label">{xAxisLabel}: {xValueFormatter(hoverX)}</p>
          {hoverValues.map((value) => (
            <p key={value.id} className="telemetry-chart-tooltip-value">
              <span style={{ color: value.colour }}>{value.label}</span>: {valueFormatter(value.y)}
            </p>
          ))}
        </div>
      ) : null}
      <svg
        className="telemetry-chart-svg"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        preserveAspectRatio="none"
      >
        {yTicks.map((tick) => (
          <g key={`y-${tick.value}`}>
            <line className="telemetry-grid-line" x1={PADDING.left} x2={SVG_WIDTH - PADDING.right} y1={toY(tick.value)} y2={toY(tick.value)} />
            <text className="telemetry-axis-label" x={PADDING.left - 10} y={toY(tick.value) + 4} textAnchor="end">
              {valueFormatter(tick.value)}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <g key={`x-${tick.value}`}>
            <line className="telemetry-grid-line telemetry-grid-line-vertical" x1={toX(tick.value)} x2={toX(tick.value)} y1={PADDING.top} y2={SVG_HEIGHT - PADDING.bottom} />
            <text className="telemetry-axis-label" x={toX(tick.value)} y={SVG_HEIGHT - 10} textAnchor="middle">
              {xValueFormatter(tick.value)}
            </text>
          </g>
        ))}
        {series.map((item) => (
          <path
            key={item.id}
            d={buildLinePath(
              (item.points || []).filter((point) => point.x >= xMin && point.x <= xMax),
              toX,
              toY,
            )}
            fill="none"
            stroke={item.colour}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {hoverX !== null ? (
          <line className="telemetry-hover-line" x1={toX(hoverX)} x2={toX(hoverX)} y1={PADDING.top} y2={SVG_HEIGHT - PADDING.bottom} />
        ) : null}
        {hoverValues.map((value) => (
          <circle key={`hover-${value.id}`} cx={toX(value.x)} cy={toY(value.y)} r="5.5" fill={value.colour} />
        ))}
        <rect
          x={PADDING.left}
          y={PADDING.top}
          width={chartWidth}
          height={chartHeight}
          fill="transparent"
          style={{ touchAction: "none", cursor: "crosshair" }}
          onMouseMove={updateHoverFromEvent}
          onPointerDown={updateHoverFromEvent}
          onPointerMove={(event) => {
            if (event.pointerType === "touch" || event.buttons === 1) {
              updateHoverFromEvent(event);
            }
          }}
        />
        {yAxisLabel ? (
          <text className="telemetry-axis-title" x="18" y={SVG_HEIGHT / 2} textAnchor="middle" transform={`rotate(-90 18 ${SVG_HEIGHT / 2})`}>
            {yAxisLabel}
          </text>
        ) : null}
        <text className="telemetry-axis-title" x={SVG_WIDTH / 2} y={SVG_HEIGHT - 2} textAnchor="middle">
          {xAxisLabel}
        </text>
      </svg>
      <div className="telemetry-chart-legend">
        {series.map((item) => (
          <div key={item.id} className="telemetry-chart-legend-item">
            <span className="telemetry-chart-legend-swatch" style={{ backgroundColor: item.colour }} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildSeries(drivers, field) {
  return drivers
    .map((driver) => ({
      id: driver.id,
      label: driver.name,
      colour: driver.colour,
      points: (driver.lapRows || [])
        .filter((lap) => typeof lap?.[field] === "number" && Number.isFinite(lap[field]))
        .map((lap) => ({
          x: lap.lapNumber,
          y: lap[field],
        })),
    }))
    .filter((driver) => driver.points.length > 0);
}

function buildLinePath(points, toX, toY) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${toX(point.x)} ${toY(point.y)}`).join(" ");
}

function interpolateSeriesPoint(points, x) {
  if (!points?.length) {
    return null;
  }
  if (x <= points[0].x) {
    return points[0];
  }
  if (x >= points[points.length - 1].x) {
    return points[points.length - 1];
  }
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (x <= next.x) {
      const span = Math.max(next.x - previous.x, 1e-9);
      const ratio = (x - previous.x) / span;
      return {
        x,
        y: previous.y + ((next.y - previous.y) * ratio),
      };
    }
  }
  return points[points.length - 1];
}

function buildTicks(min, max, count) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [];
  }
  if (min === max) {
    return [{ value: min }];
  }
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, index) => ({
    value: min + (step * index),
  }));
}

function buildLapTicks(series) {
  const xValues = Array.from(new Set(series.flatMap((item) => item.points.map((point) => point.x)))).sort((a, b) => a - b);
  if (xValues.length <= 8) {
    return xValues.map((value) => ({ value }));
  }
  const step = Math.ceil(xValues.length / 8);
  return xValues.filter((_, index) => index % step === 0).map((value) => ({ value }));
}
