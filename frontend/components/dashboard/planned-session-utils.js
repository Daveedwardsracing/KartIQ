export function normalizeDriverSetup(setup = {}) {
  return {
    front_sprocket: setup?.front_sprocket || "",
    rear_sprocket: setup?.rear_sprocket || "",
    carb_jet: setup?.carb_jet || "",
    axle_length: setup?.axle_length || "",
    axle_type: setup?.axle_type || "",
    tyre_type: setup?.tyre_type || "",
    front_tyre_pressure: setup?.front_tyre_pressure ?? "",
    rear_tyre_pressure: setup?.rear_tyre_pressure ?? "",
    torsion_bar_type: setup?.torsion_bar_type || "",
    caster_type: setup?.caster_type || "",
    ride_height: setup?.ride_height || "",
  };
}

export function serializeDriverSetup(setup = {}) {
  const normalized = normalizeDriverSetup(setup);
  return {
    ...normalized,
    front_tyre_pressure: normalized.front_tyre_pressure === "" ? null : Number(normalized.front_tyre_pressure),
    rear_tyre_pressure: normalized.rear_tyre_pressure === "" ? null : Number(normalized.rear_tyre_pressure),
  };
}

export function buildDriverSetupSummary(setup = {}) {
  const normalized = normalizeDriverSetup(setup);
  return [
    { label: "Front Sprocket", value: normalized.front_sprocket || "Not set" },
    { label: "Rear Sprocket", value: normalized.rear_sprocket || "Not set" },
    { label: "Carb Jet", value: normalized.carb_jet || "Not set" },
    { label: "Axle Length", value: normalized.axle_length || "Not set" },
    { label: "Axle Type", value: normalized.axle_type || "Not set" },
    { label: "Tyre Type", value: normalized.tyre_type || "Not set" },
    { label: "Front Tyre Pressure", value: normalized.front_tyre_pressure === "" ? "Not set" : `${normalized.front_tyre_pressure}` },
    { label: "Rear Tyre Pressure", value: normalized.rear_tyre_pressure === "" ? "Not set" : `${normalized.rear_tyre_pressure}` },
    { label: "Torsion Bar", value: normalized.torsion_bar_type || "Not set" },
    { label: "Caster", value: normalized.caster_type || "Not set" },
    { label: "Ride Height", value: normalized.ride_height || "Not set" },
  ];
}

export function formatLap(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "Not set";
  }
  return Number(value).toFixed(3);
}

export function getUploadedRunDriverMap(sessionRecord) {
  const snapshotDrivers = sessionRecord?.planned_session_snapshot?.drivers || [];
  return Object.fromEntries(snapshotDrivers.map((driver) => [driver.id, driver]));
}

export function buildUploadedRunComparisons(selectedUploads = []) {
  if (!selectedUploads.length) return [];
  const orderedUploads = selectedUploads
    .slice()
    .sort((left, right) => new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime());
  const bestLapFloor = Math.min(
    ...orderedUploads
      .map((item) => Number(item.analysis_summary?.best_lap))
      .filter((value) => Number.isFinite(value))
  );
  return orderedUploads.map((item, index) => {
    const bestLap = Number(item.analysis_summary?.best_lap);
    const delta = Number.isFinite(bestLap) && Number.isFinite(bestLapFloor) ? bestLap - bestLapFloor : null;
    const previous = index > 0 ? orderedUploads[index - 1] : null;
    const previousBestLap = Number(previous?.analysis_summary?.best_lap);
    const previousAverageBestLap = Number(previous?.analysis_summary?.average_best_lap);
    const averageBestLap = Number(item.analysis_summary?.average_best_lap);
    const bestLapChange = Number.isFinite(bestLap) && Number.isFinite(previousBestLap) ? previousBestLap - bestLap : null;
    const averageBestLapChange = Number.isFinite(averageBestLap) && Number.isFinite(previousAverageBestLap) ? previousAverageBestLap - averageBestLap : null;
    const improvementLabel = !previous
      ? "Baseline selected run"
      : Number.isFinite(bestLapChange)
        ? bestLapChange > 0.0005
          ? `Improved by ${bestLapChange.toFixed(3)}s vs previous selected run`
          : bestLapChange < -0.0005
            ? `Slower by ${Math.abs(bestLapChange).toFixed(3)}s vs previous selected run`
            : "Matched previous selected run"
        : "No valid lap delta to previous run";
    const averageLabel = !previous
      ? "Baseline average"
      : Number.isFinite(averageBestLapChange)
        ? averageBestLapChange > 0.0005
          ? `Average improved by ${averageBestLapChange.toFixed(3)}s`
          : averageBestLapChange < -0.0005
            ? `Average slowed by ${Math.abs(averageBestLapChange).toFixed(3)}s`
            : "Average pace unchanged"
        : "Average pace unavailable";
    return {
      id: item.id,
      name: item.event_round || item.event_name || "Uploaded run",
      createdAt: item.created_at || "",
      bestLap: Number.isFinite(bestLap) ? bestLap : null,
      averageBestLap: Number.isFinite(averageBestLap) ? averageBestLap : null,
      fastestDriver: item.analysis_summary?.fastest_driver || "",
      deltaToFastest: delta ?? 0,
      deltaLabel: delta === null ? "No lap data" : delta <= 0 ? "Fastest selected run" : `+${delta.toFixed(3)}s`,
      improvementLabel,
      averageLabel,
      setupChangeCount: 0,
    };
  });
}

export function buildSetupDeltaGroups(selectedUploads = []) {
  if (selectedUploads.length < 2) return [];
  const orderedUploads = selectedUploads
    .slice()
    .sort((left, right) => new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime());
  const groups = {};
  for (let index = 1; index < orderedUploads.length; index += 1) {
    const previous = orderedUploads[index - 1];
    const current = orderedUploads[index];
    const previousDrivers = getUploadedRunDriverMap(previous);
    const currentDrivers = getUploadedRunDriverMap(current);
    const driverIds = Array.from(new Set([...Object.keys(previousDrivers), ...Object.keys(currentDrivers)]));
    driverIds.forEach((driverId) => {
      const previousSetup = normalizeDriverSetup(previousDrivers[driverId]?.setup || {});
      const currentSetup = normalizeDriverSetup(currentDrivers[driverId]?.setup || {});
      const previousSummary = buildDriverSetupSummary(previousSetup);
      const changedFields = buildDriverSetupSummary(currentSetup)
        .map((field) => ({
          field: field.label,
          label: field.label,
          fromValue: previousSummary.find((item) => item.label === field.label)?.value || "Not set",
          toValue: field.value,
        }))
        .filter((field) => field.fromValue !== field.toValue);
      if (!changedFields.length) return;
      if (!groups[driverId]) {
        groups[driverId] = {
          driverId,
          driverName: currentDrivers[driverId]?.name || previousDrivers[driverId]?.name || "Driver",
          changes: [],
        };
      }
      changedFields.forEach((field) => {
        groups[driverId].changes.push({
          ...field,
          fromRun: previous.event_round || previous.event_name || "Previous run",
          toRun: current.event_round || current.event_name || "Current run",
        });
      });
    });
  }
  return Object.values(groups);
}

export function applySetupChangeCounts(runComparisons = [], setupDeltaGroups = []) {
  if (!runComparisons.length) return [];
  const countsByRun = {};
  setupDeltaGroups.forEach((group) => {
    (group.changes || []).forEach((change) => {
      countsByRun[change.toRun] = (countsByRun[change.toRun] || 0) + 1;
    });
  });
  return runComparisons.map((entry) => ({
    ...entry,
    setupChangeCount: countsByRun[entry.name] || 0,
  }));
}

export function buildSetupPerformanceCorrelations(selectedUploads = []) {
  if (selectedUploads.length < 2) return [];
  const orderedUploads = selectedUploads
    .slice()
    .sort((left, right) => new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime());
  const correlations = [];

  for (let index = 1; index < orderedUploads.length; index += 1) {
    const previous = orderedUploads[index - 1];
    const current = orderedUploads[index];
    const previousDrivers = getUploadedRunDriverMap(previous);
    const currentDrivers = getUploadedRunDriverMap(current);
    const previousPerformance = buildDriverPerformanceMap(previous);
    const currentPerformance = buildDriverPerformanceMap(current);
    const previousSectors = buildSectorPerformanceMap(previous);
    const currentSectors = buildSectorPerformanceMap(current);
    const previousCorners = buildCornerPerformanceMap(previous);
    const currentCorners = buildCornerPerformanceMap(current);

    const driverIds = Array.from(new Set([...Object.keys(previousDrivers), ...Object.keys(currentDrivers)]));
    driverIds.forEach((driverId) => {
      const previousSetup = normalizeDriverSetup(previousDrivers[driverId]?.setup || {});
      const currentSetup = normalizeDriverSetup(currentDrivers[driverId]?.setup || {});
      const setupChanges = buildDriverSetupSummary(currentSetup)
        .map((field) => ({
          field: field.label,
          label: field.label,
          fromValue: buildDriverSetupSummary(previousSetup).find((item) => item.label === field.label)?.value || "Not set",
          toValue: field.value,
        }))
        .filter((field) => field.fromValue !== field.toValue);
      if (!setupChanges.length) return;

      const driverName = currentDrivers[driverId]?.name || previousDrivers[driverId]?.name || currentPerformance[driverId]?.driver_name || previousPerformance[driverId]?.driver_name || "Driver";
      const pace = buildPaceCorrelation(previousPerformance[driverId], currentPerformance[driverId]);
      const sectorHighlights = buildSectorHighlights(driverId, previousSectors, currentSectors);
      const cornerHighlights = buildCornerHighlights(driverId, previousCorners, currentCorners);

      correlations.push({
        driverId,
        driverName,
        fromRun: previous.event_round || previous.event_name || "Previous run",
        toRun: current.event_round || current.event_name || "Current run",
        setupChanges,
        pace,
        sectorHighlights,
        cornerHighlights,
        coachingSummary: buildCoachingSummary(setupChanges, pace, sectorHighlights, cornerHighlights),
      });
    });
  }

  return correlations;
}

function buildDriverPerformanceMap(sessionRecord) {
  const drivers = sessionRecord?.analysis_summary?.drivers || [];
  const map = {};
  drivers.forEach((driver) => {
    const key = driver.driver_id || driver.driver_name;
    if (!key) return;
    map[key] = driver;
  });
  return map;
}

function buildSectorPerformanceMap(sessionRecord) {
  const sectors = sessionRecord?.analysis_summary?.sector_summary || [];
  const map = {};
  sectors.forEach((sector) => {
    map[sector.sector_name] = {};
    (sector.drivers || []).forEach((driver) => {
      const key = driver.driver_id || driver.driver_name;
      if (!key) return;
      map[sector.sector_name][key] = driver;
    });
  });
  return map;
}

function buildCornerPerformanceMap(sessionRecord) {
  const corners = sessionRecord?.analysis_summary?.corner_summary || [];
  const map = {};
  corners.forEach((corner) => {
    const cornerKey = `${corner.corner_number || ""}-${corner.name || "Corner"}`;
    map[cornerKey] = {
      name: corner.name || "Corner",
      metricsByDriver: {},
    };
    (corner.drivers || []).forEach((driver) => {
      const key = driver.driver_id || driver.driver_name;
      if (!key) return;
      map[cornerKey].metricsByDriver[key] = driver;
    });
  });
  return map;
}

function buildPaceCorrelation(previousDriver, currentDriver) {
  const previousBestLap = Number(previousDriver?.best_lap);
  const currentBestLap = Number(currentDriver?.best_lap);
  const delta = Number.isFinite(previousBestLap) && Number.isFinite(currentBestLap)
    ? currentBestLap - previousBestLap
    : null;
  let summary = "No pace delta available.";
  if (Number.isFinite(delta)) {
    if (delta < -0.0005) {
      summary = `Pace improved by ${Math.abs(delta).toFixed(3)}s.`;
    } else if (delta > 0.0005) {
      summary = `Pace worsened by ${delta.toFixed(3)}s.`;
    } else {
      summary = "Pace was effectively unchanged.";
    }
  }
  return {
    previousBestLap: Number.isFinite(previousBestLap) ? previousBestLap : null,
    currentBestLap: Number.isFinite(currentBestLap) ? currentBestLap : null,
    delta,
    summary,
  };
}

function buildSectorHighlights(driverId, previousSectors, currentSectors) {
  const deltas = Object.keys(currentSectors).map((sectorName) => {
    const previousMetric = previousSectors[sectorName]?.[driverId];
    const currentMetric = currentSectors[sectorName]?.[driverId];
    const previousTime = Number(previousMetric?.time);
    const currentTime = Number(currentMetric?.time);
    const delta = Number.isFinite(previousTime) && Number.isFinite(currentTime) ? currentTime - previousTime : null;
    return {
      sectorName,
      delta,
      previousTime: Number.isFinite(previousTime) ? previousTime : null,
      currentTime: Number.isFinite(currentTime) ? currentTime : null,
    };
  }).filter((item) => Number.isFinite(item.delta));

  const improved = deltas.filter((item) => item.delta < -0.0005).sort((left, right) => left.delta - right.delta).slice(0, 2);
  const worsened = deltas.filter((item) => item.delta > 0.0005).sort((left, right) => right.delta - left.delta).slice(0, 2);
  return {
    improved,
    worsened,
  };
}

function buildCornerHighlights(driverId, previousCorners, currentCorners) {
  const deltas = Object.keys(currentCorners).map((cornerKey) => {
    const cornerName = currentCorners[cornerKey]?.name || previousCorners[cornerKey]?.name || "Corner";
    const previousMetric = previousCorners[cornerKey]?.metricsByDriver?.[driverId];
    const currentMetric = currentCorners[cornerKey]?.metricsByDriver?.[driverId];
    const previousCornerTime = Number(previousMetric?.corner_time);
    const currentCornerTime = Number(currentMetric?.corner_time);
    const cornerTimeDelta = Number.isFinite(previousCornerTime) && Number.isFinite(currentCornerTime)
      ? currentCornerTime - previousCornerTime
      : null;
    const previousExitSpeed = Number(previousMetric?.exit_speed);
    const currentExitSpeed = Number(currentMetric?.exit_speed);
    const exitSpeedDelta = Number.isFinite(previousExitSpeed) && Number.isFinite(currentExitSpeed)
      ? currentExitSpeed - previousExitSpeed
      : null;
    const previousMinimumSpeed = Number(previousMetric?.minimum_speed);
    const currentMinimumSpeed = Number(currentMetric?.minimum_speed);
    const minimumSpeedDelta = Number.isFinite(previousMinimumSpeed) && Number.isFinite(currentMinimumSpeed)
      ? currentMinimumSpeed - previousMinimumSpeed
      : null;
    return {
      cornerKey,
      cornerName,
      cornerTimeDelta,
      exitSpeedDelta,
      minimumSpeedDelta,
    };
  });

  const timeImproved = deltas
    .filter((item) => Number.isFinite(item.cornerTimeDelta) && item.cornerTimeDelta < -0.0005)
    .sort((left, right) => left.cornerTimeDelta - right.cornerTimeDelta)
    .slice(0, 2);
  const timeWorsened = deltas
    .filter((item) => Number.isFinite(item.cornerTimeDelta) && item.cornerTimeDelta > 0.0005)
    .sort((left, right) => right.cornerTimeDelta - left.cornerTimeDelta)
    .slice(0, 2);
  const exitImproved = deltas
    .filter((item) => Number.isFinite(item.exitSpeedDelta) && item.exitSpeedDelta > 0.2)
    .sort((left, right) => right.exitSpeedDelta - left.exitSpeedDelta)
    .slice(0, 2);
  const minimumImproved = deltas
    .filter((item) => Number.isFinite(item.minimumSpeedDelta) && item.minimumSpeedDelta > 0.2)
    .sort((left, right) => right.minimumSpeedDelta - left.minimumSpeedDelta)
    .slice(0, 2);
  return {
    timeImproved,
    timeWorsened,
    exitImproved,
    minimumImproved,
  };
}

function buildCoachingSummary(setupChanges, pace, sectorHighlights, cornerHighlights) {
  const setupLine = buildSetupSummarySentence(setupChanges);
  const paceLine = buildPaceSummarySentence(pace);
  const sectorLine = buildSectorSummarySentence(sectorHighlights);
  const cornerLine = buildCornerSummarySentence(cornerHighlights);
  return [setupLine, paceLine, sectorLine, cornerLine].filter(Boolean);
}

function buildSetupSummarySentence(setupChanges) {
  if (!setupChanges.length) return "";
  const topChanges = setupChanges.slice(0, 2).map((change) => {
    if (change.fromValue === "Not set") {
      return `${change.label} was set to ${change.toValue}`;
    }
    return `${change.label} changed from ${change.fromValue} to ${change.toValue}`;
  });
  return topChanges.join(". ") + ".";
}

function buildPaceSummarySentence(pace) {
  if (!Number.isFinite(pace?.delta)) {
    return "There is no clean pace comparison for these two runs.";
  }
  if (pace.delta < -0.0005) {
    return `Overall pace improved by ${Math.abs(pace.delta).toFixed(3)}s on best lap.`;
  }
  if (pace.delta > 0.0005) {
    return `Overall pace worsened by ${pace.delta.toFixed(3)}s on best lap.`;
  }
  return "Overall pace stayed effectively unchanged.";
}

function buildSectorSummarySentence(sectorHighlights) {
  const improved = sectorHighlights?.improved || [];
  const worsened = sectorHighlights?.worsened || [];
  if (!improved.length && !worsened.length) {
    return "Sector times did not move enough to call out a clear gain or loss.";
  }
  const parts = [];
  if (improved.length) {
    parts.push(`The main gain came in ${improved.map((item) => item.sectorName).join(" and ")}`);
  }
  if (worsened.length) {
    parts.push(`time was given away in ${worsened.map((item) => item.sectorName).join(" and ")}`);
  }
  return parts.join(", ") + ".";
}

function buildCornerSummarySentence(cornerHighlights) {
  const improved = cornerHighlights?.timeImproved || [];
  const worsened = cornerHighlights?.timeWorsened || [];
  const exitImproved = cornerHighlights?.exitImproved || [];
  const minimumImproved = cornerHighlights?.minimumImproved || [];
  const parts = [];
  if (improved.length) {
    parts.push(`Corner-time gains showed up most at ${improved.map((item) => item.cornerName).join(" and ")}`);
  }
  if (worsened.length) {
    parts.push(`time was lost at ${worsened.map((item) => item.cornerName).join(" and ")}`);
  }
  if (exitImproved.length) {
    parts.push(`exit speed improved at ${exitImproved.map((item) => item.cornerName).join(" and ")}`);
  }
  if (minimumImproved.length) {
    parts.push(`minimum speed improved at ${minimumImproved.map((item) => item.cornerName).join(" and ")}`);
  }
  return parts.length ? parts.join(", ") + "." : "No strong corner-specific gain or loss stands out yet.";
}
