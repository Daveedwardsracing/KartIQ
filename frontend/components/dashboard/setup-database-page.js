"use client";

import { useEffect, useMemo, useState } from "react";

const SETUP_FIELD_LABELS = {
  front_sprocket: "Front sprocket",
  rear_sprocket: "Rear sprocket",
  carb_jet: "Carb jet",
  axle_length: "Axle length",
  axle_type: "Axle type",
  tyre_type: "Tyre type",
  front_tyre_pressure: "Front tyre pressure",
  rear_tyre_pressure: "Rear tyre pressure",
  torsion_bar_type: "Torsion bar",
  caster_type: "Caster",
  ride_height: "Ride height",
};

const AI_PROMPT_PRESETS = [
  "What rear sprocket tends to work best here in dry conditions?",
  "Which setups have produced the best laps for this class?",
  "What setup pattern looks strongest for short sessions at this track?",
];

function formatSetupValue(value) {
  if (value === "" || value == null) return "Not set";
  return `${value}`;
}

function formatFieldLabel(field) {
  return SETUP_FIELD_LABELS[field] || field.replaceAll("_", " ");
}

function formatMetric(value, decimals = 3) {
  if (value == null || value === "") return "Not available";
  return Number(value).toFixed(decimals);
}

function formatBestLap(bestResult) {
  if (!bestResult?.best_lap) return "No linked upload";
  const delta = bestResult.lap_delta_to_fastest == null ? "" : ` / +${bestResult.lap_delta_to_fastest.toFixed(3)}s`;
  return `${bestResult.best_lap.toFixed(3)}${delta}`;
}

function commonValueLabel(items = []) {
  if (!items.length) return "No pattern yet";
  return items.map((item) => `${item.value} (${item.count})`).join(" / ");
}

function weatherMatchesFilter(entry, value) {
  if (!value) return true;
  const haystack = [entry.weather, entry.track_condition, entry.tyre_condition].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(value.toLowerCase());
}

function dateInRange(entry, fromDate, toDate) {
  const entryDate = entry.session_date || "";
  if (fromDate && entryDate && entryDate < fromDate) return false;
  if (toDate && entryDate && entryDate > toDate) return false;
  return true;
}

function compareSetupValues(left, right) {
  const changes = [];
  for (const field of Object.keys(SETUP_FIELD_LABELS)) {
    const leftValue = left?.setup?.[field];
    const rightValue = right?.setup?.[field];
    if (`${leftValue ?? ""}` !== `${rightValue ?? ""}`) {
      changes.push({
        field,
        left: formatSetupValue(leftValue),
        right: formatSetupValue(rightValue),
      });
    }
  }
  return changes;
}

function compareNamedSummary(leftSummary = [], rightSummary = [], key) {
  const rightMap = new Map((rightSummary || []).map((item) => [item.name, item]));
  return (leftSummary || [])
    .map((left) => {
      const right = rightMap.get(left.name);
      if (!right) return null;
      const leftValue = left[key];
      const rightValue = right[key];
      if (leftValue == null || rightValue == null) return null;
      return {
        name: left.name,
        left: leftValue,
        right: rightValue,
        delta: Number(leftValue) - Number(rightValue),
      };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function buildTrackSavePayload(track, nextSetupNotes, nextBaseline) {
  return {
    layout_notes: track.layoutNotes || "",
    coaching_focus: track.coachingFocus || [],
    corner_notes: track.cornerNotes || [],
    corner_marker_offsets: track.cornerMarkerOffsets || {},
    corner_definitions: track.cornerDefinitions || [],
    setup_notes: nextSetupNotes || [],
    preferred_setup_baseline: nextBaseline || {},
  };
}

function buildBaselineDraft(selectedTrack) {
  const baseline = selectedTrack?.recommended_baseline || {};
  return {
    source: baseline.source || "derived",
    entry_id: baseline.entry_id || "",
    label: baseline.label || "",
    notes: baseline.notes || "",
    setup: baseline.setup || {},
  };
}

export default function SetupDatabasePage({
  setupDatabase,
  loading,
  onOpenPlannedSession,
  onOpenUploadSession,
  onSaveTrackConfig,
  onAnalyseTrackSetups,
}) {
  const tracks = setupDatabase?.tracks || [];
  const [search, setSearch] = useState("");
  const [selectedTrackName, setSelectedTrackName] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const [weatherFilter, setWeatherFilter] = useState("");
  const [sessionTypeFilter, setSessionTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [compareIds, setCompareIds] = useState([]);
  const [setupNotesDraft, setSetupNotesDraft] = useState([{ label: "", note: "" }]);
  const [baselineDraft, setBaselineDraft] = useState(buildBaselineDraft(null));
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");

  useEffect(() => {
    if (!tracks.length) {
      setSelectedTrackName("");
      return;
    }
    if (!selectedTrackName || !tracks.some((item) => item.track_name === selectedTrackName)) {
      setSelectedTrackName(tracks[0].track_name);
    }
  }, [tracks, selectedTrackName]);

  const trackOptions = useMemo(() => tracks.map((track) => track.track_name), [tracks]);
  const selectedTrack = tracks.find((item) => item.track_name === selectedTrackName) || tracks[0] || null;

  useEffect(() => {
    setCompareIds([]);
    setAiReply("");
    setAiPrompt("");
    const setupNotes = selectedTrack?.track?.setupNotes || [];
    setSetupNotesDraft(setupNotes.length ? setupNotes : [{ label: "", note: "" }]);
    setBaselineDraft(buildBaselineDraft(selectedTrack));
    setSaveNotice("");
  }, [selectedTrackName, selectedTrack]);

  const allEntries = selectedTrack?.entries || [];
  const classOptions = useMemo(() => [...new Set(allEntries.map((entry) => entry.class_name).filter(Boolean))], [allEntries]);
  const driverOptions = useMemo(() => [...new Set(allEntries.map((entry) => entry.driver_name).filter(Boolean))], [allEntries]);
  const sessionTypeOptions = useMemo(() => [...new Set(allEntries.map((entry) => entry.session_type).filter(Boolean))], [allEntries]);

  const filteredEntries = useMemo(() => {
    return allEntries.filter((entry) => {
      const searchHaystack = [
        entry.driver_name,
        entry.class_name,
        entry.session_name,
        entry.session_type,
        entry.weather,
        entry.track_condition,
        entry.tyre_condition,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (search && !searchHaystack.includes(search.toLowerCase())) return false;
      if (classFilter && entry.class_name !== classFilter) return false;
      if (driverFilter && entry.driver_name !== driverFilter) return false;
      if (sessionTypeFilter && entry.session_type !== sessionTypeFilter) return false;
      if (!weatherMatchesFilter(entry, weatherFilter)) return false;
      if (!dateInRange(entry, dateFrom, dateTo)) return false;
      return true;
    });
  }, [allEntries, search, classFilter, driverFilter, sessionTypeFilter, weatherFilter, dateFrom, dateTo]);

  const compareEntries = compareIds
    .map((id) => filteredEntries.find((entry) => entry.id === id))
    .filter(Boolean)
    .slice(0, 2);

  const compareSetupChanges =
    compareEntries.length === 2 ? compareSetupValues(compareEntries[0], compareEntries[1]) : [];
  const compareSectorChanges =
    compareEntries.length === 2
      ? compareNamedSummary(compareEntries[0].best_result?.sector_summary, compareEntries[1].best_result?.sector_summary, "delta_to_fastest")
      : [];
  const compareCornerChanges =
    compareEntries.length === 2
      ? compareNamedSummary(compareEntries[0].best_result?.corner_summary, compareEntries[1].best_result?.corner_summary, "delta_to_reference")
      : [];

  const totalUploads = useMemo(
    () => (setupDatabase?.entries || []).reduce((total, entry) => total + (entry.upload_count || 0), 0),
    [setupDatabase]
  );

  async function handleSaveTrackNotes() {
    if (!selectedTrack?.track?.id || !onSaveTrackConfig) return;
    const cleanedNotes = setupNotesDraft
      .map((item) => ({
        label: item.label?.trim() || "",
        note: item.note?.trim() || "",
      }))
      .filter((item) => item.label || item.note);
    await onSaveTrackConfig(
      selectedTrack.track.id,
      buildTrackSavePayload(selectedTrack.track, cleanedNotes, baselineDraft)
    );
    setSaveNotice(`Track setup notes saved for ${selectedTrack.track_name}.`);
  }

  async function handlePinBaselineFromEntry(entry) {
    if (!selectedTrack?.track?.id || !onSaveTrackConfig) return;
    const nextBaseline = {
      source: "pinned",
      entry_id: entry.id,
      label: `${entry.driver_name} / ${entry.session_name}`,
      notes: baselineDraft.notes || "",
      setup: entry.setup || {},
    };
    setBaselineDraft(nextBaseline);
    await onSaveTrackConfig(
      selectedTrack.track.id,
      buildTrackSavePayload(selectedTrack.track, setupNotesDraft, nextBaseline)
    );
    setSaveNotice(`Pinned baseline saved for ${selectedTrack.track_name}.`);
  }

  async function handleSaveBaselineNotes() {
    if (!selectedTrack?.track?.id || !onSaveTrackConfig) return;
    await onSaveTrackConfig(
      selectedTrack.track.id,
      buildTrackSavePayload(selectedTrack.track, setupNotesDraft, baselineDraft)
    );
    setSaveNotice(`Baseline notes saved for ${selectedTrack.track_name}.`);
  }

  async function handleRunAiAnalysis(prompt) {
    if (!selectedTrack?.track_name || !onAnalyseTrackSetups) return;
    setAiLoading(true);
    setAiReply("");
    try {
      const reply = await onAnalyseTrackSetups(prompt, selectedTrack.track_name);
      setAiReply(reply || "No reply returned.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="workspace-page">
      <section className="workspace-hero workspace-hero-premium">
        <div className="workspace-hero-premium-grid">
          <div className="workspace-hero-copy">
            <p className="workspace-section-label">Setup Database</p>
            <h2 className="workspace-hero-title">Turn planned-session setups into a live track setup intelligence bank.</h2>
            <p className="workspace-hero-text">
              This page scores saved setups by outcome, lets you pin a preferred baseline per track, compare two setup
              records directly, save track-specific setup notes, and ask the AI to reason over the setup bank.
            </p>
          </div>
          <div className="workspace-hero-grid">
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Tracks covered</p>
              <p className="workspace-kpi-value">{setupDatabase?.total_tracks || 0}</p>
              <p className="workspace-kpi-detail">Tracks with at least one saved setup.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Saved setups</p>
              <p className="workspace-kpi-value">{setupDatabase?.total_entries || 0}</p>
              <p className="workspace-kpi-detail">Driver setup records currently in the library.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Linked uploads</p>
              <p className="workspace-kpi-value">{totalUploads}</p>
              <p className="workspace-kpi-detail">Uploaded runs tied back to those setup records.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="workspace-two-column mt-6">
        <aside className="app-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="workspace-section-label">Track Library</p>
              <h3 className="mt-2 text-xl font-semibold">Setup banks by venue</h3>
            </div>
            <span className="pill pill-neutral">{trackOptions.length} listed</span>
          </div>
          <div className="library-list mt-4">
            {tracks.map((track) => {
              const isActive = selectedTrack?.track_name === track.track_name;
              const baseline = track.recommended_baseline || {};
              return (
                <button
                  key={track.track_name}
                  className={`library-item library-item-main text-left ${isActive ? "active" : ""}`}
                  type="button"
                  onClick={() => setSelectedTrackName(track.track_name)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-white">{track.track_name}</p>
                      <p className="mt-1 text-sm muted">
                        {track.setup_count} setups / {track.session_count} sessions / {track.driver_count} drivers
                      </p>
                    </div>
                    {track.latest_date ? <span className="pill pill-neutral">{track.latest_date}</span> : null}
                  </div>
                  <div className="chip-row mt-3">
                    <span className="pill pill-neutral">{baseline.source === "pinned" ? "Pinned baseline" : "Derived baseline"}</span>
                    <span className="pill pill-neutral">Rear: {commonValueLabel(track.common_values?.rear_sprocket || [])}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="grid gap-5">
          <article className="app-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="workspace-section-label">Track Setup Bank</p>
                <h3 className="mt-2 text-2xl font-semibold">{selectedTrack?.track_name || "Choose a track"}</h3>
              </div>
              {selectedTrack ? <span className="pill">{selectedTrack.setup_count} saved setups</span> : null}
            </div>
            {selectedTrack ? (
              <>
                <div className="workspace-hero-grid mt-5">
                  <div className="workspace-kpi">
                    <p className="workspace-kpi-label">Best lap setup</p>
                    <p className="workspace-kpi-value text-[1.1rem]">{selectedTrack.leaders?.best_lap?.driver_name || "No leader yet"}</p>
                    <p className="workspace-kpi-detail">{formatMetric(selectedTrack.leaders?.best_lap?.value)}</p>
                  </div>
                  <div className="workspace-kpi">
                    <p className="workspace-kpi-label">Best sector sum</p>
                    <p className="workspace-kpi-value text-[1.1rem]">{selectedTrack.leaders?.best_sector_sum?.driver_name || "No leader yet"}</p>
                    <p className="workspace-kpi-detail">{formatMetric(selectedTrack.leaders?.best_sector_sum?.value)}</p>
                  </div>
                  <div className="workspace-kpi">
                    <p className="workspace-kpi-label">Top speed leader</p>
                    <p className="workspace-kpi-value text-[1.1rem]">{selectedTrack.leaders?.top_speed?.driver_name || "No leader yet"}</p>
                    <p className="workspace-kpi-detail">{selectedTrack.leaders?.top_speed?.value != null ? `${selectedTrack.leaders.top_speed.value}` : "Not available"}</p>
                  </div>
                </div>
                <div className="workspace-subtle-card mt-5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="workspace-section-label">Recommended Baseline</p>
                      <h4 className="mt-2 text-lg font-semibold text-white">{baselineDraft.label || "Recommended baseline"}</h4>
                      <p className="mt-2 text-sm muted">{baselineDraft.notes || "Use this as the working baseline for this track."}</p>
                    </div>
                    <span className="pill pill-neutral">{baselineDraft.source === "pinned" ? "Pinned baseline" : "Derived baseline"}</span>
                  </div>
                  <div className="setup-db-grid mt-4">
                    {Object.entries(baselineDraft.setup || {}).map(([field, value]) => (
                      <div key={`baseline-${field}`} className="workspace-subtle-card p-3">
                        <p className="workspace-section-label">{formatFieldLabel(field)}</p>
                        <p className="mt-2 text-base font-semibold text-white">{formatSetupValue(value)}</p>
                      </div>
                    ))}
                  </div>
                  <textarea
                    className="mt-4"
                    placeholder="Add track-level baseline notes"
                    value={baselineDraft.notes || ""}
                    onChange={(event) => setBaselineDraft((current) => ({ ...current, notes: event.target.value }))}
                  />
                  <div className="library-item-actions mt-4">
                    <button className="workspace-primary px-4 py-3 text-sm text-white" type="button" disabled={loading} onClick={handleSaveBaselineNotes}>
                      Save baseline notes
                    </button>
                    {saveNotice ? <span className="pill">{saveNotice}</span> : null}
                  </div>
                </div>
              </>
            ) : null}
          </article>

          <article className="app-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="workspace-section-label">Filters</p>
                <h3 className="mt-2 text-xl font-semibold">Slice the setup library by context</h3>
              </div>
              <span className="pill pill-neutral">{filteredEntries.length} matches</span>
            </div>
            <div className="setup-db-filters mt-4">
              <input placeholder="Search driver, session, or conditions" type="text" value={search} onChange={(event) => setSearch(event.target.value)} />
              <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
                <option value="">All classes</option>
                {classOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <select value={driverFilter} onChange={(event) => setDriverFilter(event.target.value)}>
                <option value="">All drivers</option>
                {driverOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <select value={sessionTypeFilter} onChange={(event) => setSessionTypeFilter(event.target.value)}>
                <option value="">All session types</option>
                {sessionTypeOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <input placeholder="Weather / condition" type="text" value={weatherFilter} onChange={(event) => setWeatherFilter(event.target.value)} />
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>
          </article>

          <article className="app-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="workspace-section-label">Track Setup Notes</p>
                <h3 className="mt-2 text-xl font-semibold">Save reusable setup notes for this track</h3>
              </div>
            </div>
            <div className="library-list mt-4">
              {setupNotesDraft.map((item, index) => (
                <div key={`setup-note-${index}`} className="workspace-subtle-card p-4">
                  <input
                    placeholder="Label, for example Wet fallback"
                    type="text"
                    value={item.label}
                    onChange={(event) => {
                      const next = [...setupNotesDraft];
                      next[index] = { ...next[index], label: event.target.value };
                      setSetupNotesDraft(next);
                    }}
                  />
                  <textarea
                    className="mt-3"
                    placeholder="Track-level setup note"
                    value={item.note}
                    onChange={(event) => {
                      const next = [...setupNotesDraft];
                      next[index] = { ...next[index], note: event.target.value };
                      setSetupNotesDraft(next);
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="library-item-actions mt-4">
              <button className="workspace-ghost px-4 py-3 text-sm" type="button" onClick={() => setSetupNotesDraft((current) => [...current, { label: "", note: "" }])}>
                Add note
              </button>
              <button className="workspace-primary px-4 py-3 text-sm text-white" type="button" disabled={loading} onClick={handleSaveTrackNotes}>
                Save track notes
              </button>
            </div>
          </article>

          <article className="app-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="workspace-section-label">AI Setup Analysis</p>
                <h3 className="mt-2 text-xl font-semibold">Ask the assistant to analyse this track setup bank</h3>
              </div>
            </div>
            <div className="chip-row mt-4">
              {AI_PROMPT_PRESETS.map((prompt) => (
                <button key={prompt} className="selection-pill" type="button" onClick={() => setAiPrompt(prompt)}>
                  <span>{prompt}</span>
                </button>
              ))}
            </div>
            <textarea
              className="mt-4"
              placeholder="Ask about sprockets, tyre pressures, classes, conditions, or strongest setup patterns at this track"
              value={aiPrompt}
              onChange={(event) => setAiPrompt(event.target.value)}
            />
            <div className="library-item-actions mt-4">
              <button className="workspace-primary px-4 py-3 text-sm text-white" type="button" disabled={aiLoading || !aiPrompt.trim()} onClick={() => handleRunAiAnalysis(aiPrompt)}>
                {aiLoading ? "Analysing..." : "Analyse setup database for this track"}
              </button>
            </div>
            {aiReply ? (
              <div className="workspace-subtle-card mt-4 p-4">
                <p className="font-medium text-white">AI summary</p>
                <p className="mt-2 whitespace-pre-wrap text-sm muted">{aiReply}</p>
              </div>
            ) : null}
          </article>

          <article className="app-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="workspace-section-label">Setup Entries</p>
                <h3 className="mt-2 text-xl font-semibold">Scored setup records</h3>
              </div>
              <span className="pill pill-neutral">Select two to compare</span>
            </div>
            <div className="library-list mt-4">
              {filteredEntries.map((entry) => {
                const selected = compareIds.includes(entry.id);
                return (
                  <div key={entry.id} className="library-item">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-semibold text-white">{entry.driver_name} {entry.driver_number ? `#${entry.driver_number}` : ""}</p>
                        <p className="mt-1 text-sm muted">{entry.session_name} / {entry.session_type} / {entry.session_date || "No date"}</p>
                        <div className="chip-row mt-3">
                          {entry.class_name ? <span className="pill pill-neutral">{entry.class_name}</span> : null}
                          <span className="pill pill-neutral">{entry.session_status}</span>
                          <span className="pill pill-neutral">{entry.upload_count} linked uploads</span>
                          <span className="pill">{entry.outcome_score} pts</span>
                          {(entry.outcome_badges || []).map((badge) => <span key={`${entry.id}-${badge}`} className="pill pill-neutral">{badge}</span>)}
                        </div>
                      </div>
                      <div className="library-item-actions">
                        <button
                          className="workspace-ghost px-4 py-3 text-sm"
                          type="button"
                          onClick={() => {
                            setCompareIds((current) => {
                              if (current.includes(entry.id)) return current.filter((item) => item !== entry.id);
                              return [...current, entry.id].slice(-2);
                            });
                          }}
                        >
                          {selected ? "Selected" : "Compare"}
                        </button>
                        <button className="workspace-ghost px-4 py-3 text-sm" type="button" onClick={() => onOpenPlannedSession?.(entry.test_session_id)}>
                          Open planned session
                        </button>
                        <button className="workspace-ghost px-4 py-3 text-sm" type="button" onClick={() => onOpenUploadSession?.(entry.test_session_id)}>
                          Open upload flow
                        </button>
                        <button className="workspace-ghost px-4 py-3 text-sm" type="button" onClick={() => handlePinBaselineFromEntry(entry)}>
                          Pin as baseline
                        </button>
                      </div>
                    </div>

                    <div className="workspace-hero-grid mt-4">
                      <div className="workspace-kpi">
                        <p className="workspace-kpi-label">Best linked lap</p>
                        <p className="workspace-kpi-value text-[1.1rem]">{formatBestLap(entry.best_result)}</p>
                        <p className="workspace-kpi-detail">Best uploaded pace with this setup.</p>
                      </div>
                      <div className="workspace-kpi">
                        <p className="workspace-kpi-label">Best sector sum</p>
                        <p className="workspace-kpi-value text-[1.1rem]">{formatMetric(entry.best_result?.best_sector_sum)}</p>
                        <p className="workspace-kpi-detail">Summed best sectors from linked uploads.</p>
                      </div>
                      <div className="workspace-kpi">
                        <p className="workspace-kpi-label">Top speed</p>
                        <p className="workspace-kpi-value text-[1.1rem]">{entry.best_result?.top_speed != null ? `${entry.best_result.top_speed}` : "Not available"}</p>
                        <p className="workspace-kpi-detail">{entry.weather || "No weather logged"}</p>
                      </div>
                    </div>

                    <div className="setup-db-grid mt-4">
                      {Object.entries(entry.setup || {}).map(([field, value]) => (
                        <div key={`${entry.id}-${field}`} className="workspace-subtle-card p-3">
                          <p className="workspace-section-label">{formatFieldLabel(field)}</p>
                          <p className="mt-2 text-base font-semibold text-white">{formatSetupValue(value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          {compareEntries.length === 2 ? (
            <article className="app-panel p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="workspace-section-label">Setup Comparison</p>
                  <h3 className="mt-2 text-xl font-semibold">{compareEntries[0].driver_name} vs {compareEntries[1].driver_name}</h3>
                </div>
                <span className="pill">{compareSetupChanges.length} setup changes</span>
              </div>
              <div className="library-list mt-4">
                <div className="workspace-subtle-card p-4">
                  <p className="font-medium text-white">Outcome deltas</p>
                  <div className="setup-db-compare-grid mt-3">
                    <div className="workspace-kpi">
                      <p className="workspace-kpi-label">Best lap delta</p>
                      <p className="workspace-kpi-value text-[1.1rem]">
                        {compareEntries[0].best_result?.best_lap != null && compareEntries[1].best_result?.best_lap != null
                          ? `${(compareEntries[0].best_result.best_lap - compareEntries[1].best_result.best_lap).toFixed(3)}s`
                          : "Not available"}
                      </p>
                    </div>
                    <div className="workspace-kpi">
                      <p className="workspace-kpi-label">Best sector sum delta</p>
                      <p className="workspace-kpi-value text-[1.1rem]">
                        {compareEntries[0].best_result?.best_sector_sum != null && compareEntries[1].best_result?.best_sector_sum != null
                          ? `${(compareEntries[0].best_result.best_sector_sum - compareEntries[1].best_result.best_sector_sum).toFixed(3)}s`
                          : "Not available"}
                      </p>
                    </div>
                    <div className="workspace-kpi">
                      <p className="workspace-kpi-label">Top speed delta</p>
                      <p className="workspace-kpi-value text-[1.1rem]">
                        {compareEntries[0].best_result?.top_speed != null && compareEntries[1].best_result?.top_speed != null
                          ? `${(compareEntries[0].best_result.top_speed - compareEntries[1].best_result.top_speed).toFixed(2)}`
                          : "Not available"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="workspace-subtle-card p-4">
                  <p className="font-medium text-white">What changed in the setup</p>
                  <div className="library-list mt-3">
                    {compareSetupChanges.map((change) => (
                      <div key={change.field} className="compare-row">
                        <div>
                          <p className="workspace-section-label">{formatFieldLabel(change.field)}</p>
                          <p className="mt-2 text-sm muted">{compareEntries[0].driver_name}: {change.left}</p>
                        </div>
                        <div className="text-right">
                          <p className="workspace-section-label">New value</p>
                          <p className="mt-2 text-sm text-white">{compareEntries[1].driver_name}: {change.right}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="workspace-subtle-card p-4">
                  <p className="font-medium text-white">Biggest sector differences</p>
                  <div className="library-list mt-3">
                    {compareSectorChanges.slice(0, 4).map((item) => (
                      <div key={item.name} className="compare-row">
                        <div>
                          <p className="workspace-section-label">{item.name}</p>
                          <p className="mt-2 text-sm muted">{compareEntries[0].driver_name}: {formatMetric(item.left)}</p>
                        </div>
                        <div className="text-right">
                          <p className="workspace-section-label">Delta</p>
                          <p className="mt-2 text-sm text-white">{item.delta.toFixed(3)}s vs {compareEntries[1].driver_name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="workspace-subtle-card p-4">
                  <p className="font-medium text-white">Biggest corner differences</p>
                  <div className="library-list mt-3">
                    {compareCornerChanges.slice(0, 4).map((item) => (
                      <div key={item.name} className="compare-row">
                        <div>
                          <p className="workspace-section-label">{item.name}</p>
                          <p className="mt-2 text-sm muted">{compareEntries[0].driver_name}: {formatMetric(item.left)}</p>
                        </div>
                        <div className="text-right">
                          <p className="workspace-section-label">Delta</p>
                          <p className="mt-2 text-sm text-white">{item.delta.toFixed(3)}s vs {compareEntries[1].driver_name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ) : null}
        </section>
      </div>
    </div>
  );
}
