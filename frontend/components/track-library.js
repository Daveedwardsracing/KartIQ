"use client";

import { useEffect, useMemo, useState } from "react";
import { buildGoogleMapsLink, buildTrackCardMapUrl } from "@/lib/tracks";

export default function TrackLibrary({ mapsApiKey, selectedTrackName, tracks = [], onSaveTrack }) {
  const [search, setSearch] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [draft, setDraft] = useState(null);
  const filteredTracks = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) {
      return tracks;
    }
    return tracks.filter((track) => {
      return [track.name, track.venue, track.postcode].some((field) => field.toLowerCase().includes(normalized));
    });
  }, [search, tracks]);

  useEffect(() => {
    const preferred = tracks.find((track) => track.name.toLowerCase() === String(selectedTrackName || "").toLowerCase()) || tracks[0] || null;
    if (preferred && !selectedTrackId) {
      setSelectedTrackId(preferred.id);
    }
  }, [tracks, selectedTrackName, selectedTrackId]);

  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) || null;

  useEffect(() => {
    if (!selectedTrack) {
      setDraft(null);
      return;
    }
    setDraft({
      layoutNotes: selectedTrack.layoutNotes || "",
      coachingFocusText: (selectedTrack.coachingFocus || []).join("\n"),
      cornerDefinitions: (selectedTrack.cornerDefinitions?.length ? selectedTrack.cornerDefinitions : (selectedTrack.cornerNotes || []).map((note, index) => ({
        name: `Corner ${index + 1}`,
        sequence: index + 1,
        section_type: "",
        note,
      }))).map((item, index) => ({
        name: item.name || `Corner ${index + 1}`,
        sequence: item.sequence || index + 1,
        section_type: item.section_type || "",
        note: item.note || "",
      })),
    });
  }, [selectedTrack]);

  return (
    <div className="workspace-page">
      <section className="workspace-hero workspace-hero-premium">
        <div className="workspace-hero-premium-grid">
          <div className="workspace-hero-copy">
            <p className="workspace-section-label">Track Database</p>
            <h2 className="workspace-hero-title">Build a proper circuit intelligence library, not just a list of venues.</h2>
            <p className="workspace-hero-text">Keep satellite imagery, layout notes, coaching focus, and corner definitions ready so every upload and debrief has stronger track context from the start.</p>
          </div>
          <div className="workspace-hero-grid">
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Tracks loaded</p>
              <p className="workspace-kpi-value">{tracks.length}</p>
              <p className="workspace-kpi-detail">Circuit records available in the library.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Search results</p>
              <p className="workspace-kpi-value">{filteredTracks.length}</p>
              <p className="workspace-kpi-detail">Tracks matching the current search and selection.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Maps</p>
              <p className="workspace-kpi-value">{mapsApiKey ? "Live" : "Link only"}</p>
              <p className="workspace-kpi-detail">{mapsApiKey ? "Static map imagery is available in-track." : "Add a Google Static Maps key for inline imagery."}</p>
            </div>
          </div>
        </div>
      </section>

      <article className="app-panel p-5">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="workspace-section-label">Track Workspace</p>
            <h2 className="mt-2 text-2xl font-semibold">Search, select, and edit the circuit context</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-[260px_260px]">
            <input
              className="workspace-field"
              placeholder="Search track or venue"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select className="workspace-field" value={selectedTrackId} onChange={(event) => setSelectedTrackId(event.target.value)}>
              {tracks.map((track) => (
                <option key={track.id} value={track.id}>{track.name}</option>
              ))}
            </select>
          </div>
        </div>

        {!mapsApiKey ? (
          <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-400/10 p-4 text-sm text-amber-100">
            Add a Google Static Maps API key in General Settings to show live satellite images in the app. The track cards still include direct Google Maps links without it.
          </div>
        ) : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="grid gap-5">
            {filteredTracks.map((track) => (
              <TrackCard key={track.id} track={track} mapsApiKey={mapsApiKey} active={track.id === selectedTrackId || selectedTrackName?.toLowerCase() === track.name.toLowerCase()} onSelect={() => setSelectedTrackId(track.id)} />
            ))}
          </div>
          <TrackEditor
            draft={draft}
            track={selectedTrack}
            onChange={setDraft}
            onSave={async () => {
              if (!selectedTrack || !draft) return;
              await onSaveTrack(selectedTrack.id, {
                layout_notes: draft.layoutNotes,
                coaching_focus: draft.coachingFocusText.split("\n").map((item) => item.trim()).filter(Boolean),
                corner_notes: draft.cornerDefinitions.map((item) => item.note).filter(Boolean),
                corner_definitions: draft.cornerDefinitions.map((item, index) => ({
                  name: item.name || `Corner ${index + 1}`,
                  sequence: Number(item.sequence) || index + 1,
                  section_type: item.section_type || "",
                  note: item.note || "",
                })),
              });
            }}
          />
        </div>
      </article>
    </div>
  );
}

function TrackCard({ track, mapsApiKey, active, onSelect }) {
  const staticMapUrl = buildTrackCardMapUrl(track, mapsApiKey);
  const googleMapsUrl = buildGoogleMapsLink(track);

  return (
    <button className={`overflow-hidden rounded-2xl border text-left ${active ? "border-blue-400/35 bg-blue-500/8" : "border-white/10 bg-white/5"}`} onClick={onSelect} type="button">
      {staticMapUrl ? (
        <img alt={`${track.name} Google Maps satellite view`} className="block h-56 w-full object-cover object-center" src={staticMapUrl} />
      ) : (
        <div className="track-placeholder flex h-56 items-end p-5">
          <div>
            <span className="badge">Google Maps ready</span>
            <p className="mt-3 text-lg font-semibold">{track.name}</p>
            <p className="mt-1 text-sm text-slate-200">{track.venue}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{track.name}</h3>
            <p className="mt-1 text-sm muted">{track.venue}</p>
          </div>
          {active ? <span className="badge">Selected track</span> : null}
        </div>
        <div className="grid gap-1 text-sm muted">
          {track.address.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
          <p className="text-sm font-medium">Layout Notes</p>
          <p className="mt-2 text-sm muted">{track.layoutNotes}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <TrackNotes title="Coaching Focus" items={track.coachingFocus} />
          <TrackNotes title="Corner Definitions" items={(track.cornerDefinitions || []).map((item) => `${item.name}${item.section_type ? ` (${item.section_type})` : ""}`)} />
        </div>
        <div className="flex flex-wrap gap-3">
          <a className="rounded-xl bg-blue-500 px-4 py-3 text-sm font-medium text-white" href={googleMapsUrl} rel="noreferrer" target="_blank" onClick={(event) => event.stopPropagation()}>
            Open in Google Maps
          </a>
          <a className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium" href={track.officialUrl} rel="noreferrer" target="_blank" onClick={(event) => event.stopPropagation()}>
            Track Website
          </a>
        </div>
      </div>
    </button>
  );
}

function TrackEditor({ track, draft, onChange, onSave }) {
  if (!track || !draft) {
    return (
      <div className="workspace-subtle-card p-6 text-sm muted">Select a track to edit its layout notes and corner database.</div>
    );
  }

  return (
    <article className="app-panel p-5">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <p className="workspace-section-label">Corner Editor</p>
          <h3 className="mt-2 text-2xl font-semibold">{track.name}</h3>
        </div>
        <span className="pill">{draft.cornerDefinitions.length} corners</span>
      </div>
      <div className="mt-5 grid gap-4">
        <label className="grid gap-2 text-sm">
          <span className="muted">Layout notes</span>
          <textarea className="workspace-field min-h-[110px]" value={draft.layoutNotes} onChange={(event) => onChange((current) => ({ ...current, layoutNotes: event.target.value }))} />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="muted">Coaching focus points</span>
          <textarea className="workspace-field min-h-[110px]" value={draft.coachingFocusText} onChange={(event) => onChange((current) => ({ ...current, coachingFocusText: event.target.value }))} />
        </label>
        <div className="grid gap-3">
          {draft.cornerDefinitions.map((corner, index) => (
            <div key={`${track.id}-corner-${index}`} className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
              <div className="grid gap-3 md:grid-cols-[120px_1fr_180px]">
                <input className="workspace-field" placeholder="Sequence" type="number" value={corner.sequence} onChange={(event) => updateCornerDraft(onChange, index, "sequence", event.target.value)} />
                <input className="workspace-field" placeholder="Corner name" value={corner.name} onChange={(event) => updateCornerDraft(onChange, index, "name", event.target.value)} />
                <select className="workspace-field" value={corner.section_type} onChange={(event) => updateCornerDraft(onChange, index, "section_type", event.target.value)}>
                  <option value="">Section type</option>
                  <option value="braking">Braking</option>
                  <option value="entry">Entry</option>
                  <option value="mid-corner">Mid-corner</option>
                  <option value="exit">Exit</option>
                  <option value="straight">Straight</option>
                  <option value="chicane">Chicane</option>
                </select>
              </div>
              <textarea className="workspace-field mt-3 min-h-[90px]" placeholder="Corner note / expected coaching focus" value={corner.note} onChange={(event) => updateCornerDraft(onChange, index, "note", event.target.value)} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="workspace-ghost px-4 py-3 text-sm" onClick={() => onChange((current) => ({
            ...current,
            cornerDefinitions: [
              ...current.cornerDefinitions,
              { name: `Corner ${current.cornerDefinitions.length + 1}`, sequence: current.cornerDefinitions.length + 1, section_type: "", note: "" },
            ],
          }))} type="button">
            Add corner
          </button>
          <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" onClick={onSave} type="button">Save track editor</button>
        </div>
      </div>
    </article>
  );
}

function updateCornerDraft(onChange, index, key, value) {
  onChange((current) => ({
    ...current,
    cornerDefinitions: current.cornerDefinitions.map((corner, cornerIndex) => cornerIndex === index ? { ...corner, [key]: value } : corner),
  }));
}

function TrackNotes({ title, items }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-3 grid gap-2 text-sm muted">
        {items.length ? items.map((item) => (
          <li key={item}>- {item}</li>
        )) : <li>- None configured</li>}
      </ul>
    </div>
  );
}
