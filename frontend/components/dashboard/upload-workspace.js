"use client";

import { useEffect, useState } from "react";
import UploadValidationSummary from "@/components/dashboard/upload-validation-summary";
import { getUploadValidationSummary } from "@/lib/upload-flow";

export default function UploadWorkspace({
  analysis,
  currentTrack,
  drivers,
  error,
  eventsStore,
  formState,
  loading,
  onAudienceChange,
  onOpenTracks,
  onUpload,
  reports,
  reportsStore,
  selectedTestSession,
  sessionsStore,
}) {
  const trackAddress = Array.isArray(currentTrack?.address) ? currentTrack.address.join(", ") : currentTrack?.venue || "";
  const trackFocus = Array.isArray(currentTrack?.coachingFocus) ? currentTrack.coachingFocus.slice(0, 2) : [];
  const [driverFiles, setDriverFiles] = useState({});

  useEffect(() => {
    setDriverFiles({});
  }, [selectedTestSession?.id]);

  const assignedDrivers = selectedTestSession?.drivers || [];
  const readyUploads = assignedDrivers.filter((driver) => driverFiles[driver.id]).length;
  const validationSummary = getUploadValidationSummary(analysis, selectedTestSession);

  return (
    <div className="workspace-page">
      <section className="workspace-hero workspace-hero-premium">
        <div className="workspace-hero-premium-grid">
          <div className="workspace-hero-copy">
            <p className="workspace-section-label">Upload Session</p>
            <h2 className="workspace-hero-title">Bring telemetry in through a clear race-engineering intake.</h2>
            <p className="workspace-hero-text">Confirm the session, attach the right UniPro files to the right drivers, validate what came back, then move straight into analysis and reporting.</p>
          </div>
          <div className="workspace-hero-grid">
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Assigned drivers</p>
              <p className="workspace-kpi-value">{assignedDrivers.length}</p>
              <p className="workspace-kpi-detail">Drivers expected in this upload batch.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Files attached</p>
              <p className="workspace-kpi-value">{readyUploads}</p>
              <p className="workspace-kpi-detail">Driver files already matched and ready to process.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Audience target</p>
              <p className="workspace-kpi-value">{formState.audience}</p>
              <p className="workspace-kpi-detail">Who the next feedback pack is being shaped for.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="upload-intake-grid">
        <article className="app-panel p-5 upload-intake-card">
          <p className="workspace-section-label">Session Intake</p>
          <h3 className="mt-2 text-2xl font-semibold">What this upload is about</h3>
          <p className="mt-3 text-sm muted">
            {selectedTestSession
              ? `${selectedTestSession.name} is the selected planned session. Attach the matching UniPro export for each driver below and process them as one clean run batch.`
              : "Choose a planned session from Events before attaching any driver files."}
          </p>
          <div className="mt-4 grid gap-3">
            <div className="session-debrief-row">
              <span>Planned session</span>
              <span>{selectedTestSession?.name || "Not selected"}</span>
            </div>
            <div className="session-debrief-row">
              <span>Venue</span>
              <span>{selectedTestSession?.venue || formState.eventName || "Unknown"}</span>
            </div>
            <div className="session-debrief-row">
              <span>Session type</span>
              <span>{selectedTestSession?.session_type || formState.sessionType || "Unknown"}</span>
            </div>
            <div className="session-debrief-row">
              <span>Upload readiness</span>
              <span>{readyUploads} / {assignedDrivers.length || 0} files attached</span>
            </div>
          </div>
        </article>

        <article className="app-panel p-5 upload-intake-card">
          <p className="workspace-section-label">Next Action</p>
          <h3 className="mt-2 text-2xl font-semibold">How to complete this intake</h3>
          <div className="home-steps mt-4">
            {[
              "Confirm the planned session and assigned driver list",
              "Attach the correct UniPro TSV to each driver below",
              "Process the upload batch and review validation",
              "Move straight into analysis and report generation"
            ].map((item, index) => (
              <div key={item} className="home-step">
                <span className="home-step-index">{index + 1}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <div className="workflow-grid">
      <div className="workflow-stack">
        <article className="workflow-card">
          <div className="flex items-center gap-3">
            <span className="workflow-step">1</span>
            <div>
              <p className="workspace-section-label">Chosen Session</p>
              <h3 className="mt-1 text-xl font-semibold">Upload into the planned session you selected from Events</h3>
            </div>
          </div>
          {selectedTestSession ? (
            <div className="workspace-subtle-card mt-5 p-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-lg font-semibold text-white">{selectedTestSession.name}</p>
                  <p className="mt-1 text-sm muted">{selectedTestSession.venue} / {selectedTestSession.session_type} / {selectedTestSession.date || "No date"}</p>
                </div>
                <span className="pill pill-neutral">{selectedTestSession.drivers.length} assigned drivers</span>
              </div>
              <div className="workflow-chip-grid mt-4">
                {selectedTestSession.drivers.map((driver) => (
                  <span key={driver.id} className="pill pill-neutral">{driver.name} - {driver.class_name || "No class"}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="workspace-subtle-card mt-5 p-5">
              <p className="text-sm font-medium text-white">No planned session selected</p>
              <p className="mt-2 text-sm muted">Go to the Events page, choose the event, open the session list, and click the session you want to upload into first.</p>
            </div>
          )}
        </article>

        <article className="workflow-card">
          <div className="flex items-center gap-3">
            <span className="workflow-step">2</span>
            <div>
              <p className="workspace-section-label">Session Scope</p>
              <h3 className="mt-1 text-xl font-semibold">Review the event details that will be attached to this upload</h3>
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <input className="workspace-field" readOnly placeholder="Track / venue" value={formState.eventName} />
            <input className="workspace-field" readOnly placeholder="Round / event name" value={formState.eventRound} />
            <input className="workspace-field" readOnly placeholder="Session type" value={formState.sessionType} />
          </div>
        </article>

        <article className="workflow-card">
          <div className="flex items-center gap-3">
            <span className="workflow-step">3</span>
            <div>
              <p className="workspace-section-label">Upload Files</p>
              <h3 className="mt-1 text-xl font-semibold">Attach the correct UniPro TSV to each driver</h3>
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {selectedTestSession ? assignedDrivers.map((driver) => (
              <label key={driver.id} className="overlay-driver-row cursor-pointer">
                <span className="overlay-driver-swatch" style={{ background: "#5d8fff" }} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{driver.name}</p>
                  <p className="mt-1 text-sm muted">{driver.class_name || "No class set"}</p>
                  <p className="mt-2 text-sm text-slate-300">{driverFiles[driver.id]?.name || "Choose a TSV file for this driver"}</p>
                </div>
                <input
                  className="hidden"
                  type="file"
                  accept=".tsv,.txt"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setDriverFiles((current) => ({ ...current, [driver.id]: file }));
                  }}
                />
                <span className="pill pill-neutral">{driverFiles[driver.id] ? "Attached" : "Waiting"}</span>
              </label>
            )) : (
              <div className="workspace-subtle-card p-5">
                <p className="text-sm font-medium text-white">No planned session selected</p>
                <p className="mt-2 text-sm muted">Choose a planned session from Events before attaching driver files.</p>
              </div>
            )}
          </div>
          {selectedTestSession ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm muted">{readyUploads} of {assignedDrivers.length} assigned drivers have a file attached.</p>
              <button
                className="workspace-primary px-4 py-3 text-sm font-medium text-white"
                disabled={!readyUploads || loading}
                onClick={() => onUpload(assignedDrivers.filter((driver) => driverFiles[driver.id]).map((driver) => ({ driverId: driver.id, file: driverFiles[driver.id] })))}
                type="button"
              >
                {loading ? "Processing upload..." : "Upload selected driver files"}
              </button>
            </div>
          ) : null}
          {loading ? <p className="mt-4 text-sm muted">Processing request...</p> : null}
          {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
        </article>
      </div>

      <div className="workflow-stack">
        <UploadValidationSummary summary={validationSummary} />

        <article className="workflow-card">
          <p className="workspace-section-label">Current Scope</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {[
              ["Drivers", drivers.length || 0],
              ["Reports", reports?.reports?.length || 0],
              ["Saved Events", eventsStore.length || 0],
              ["Saved Sessions", sessionsStore.length || 0],
              ["Report History", reportsStore.length || 0],
              ["Audience", formState.audience]
            ].map(([label, value]) => (
              <div key={label} className="workspace-stat p-4">
                <p className="text-sm muted">{label}</p>
                <p className="mt-2 text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <label className="mt-4 grid gap-2 text-sm">
            <span className="muted">Feedback audience</span>
            <select className="workspace-field" value={formState.audience} onChange={(event) => onAudienceChange(event.target.value)}>
              <option value="coach">Coach format</option>
              <option value="driver">Driver format</option>
              <option value="parent">Parent-friendly format</option>
            </select>
          </label>
        </article>

        <article className="workflow-card">
          <p className="workspace-section-label">Track Context</p>
          {currentTrack ? (
            <div className="mt-4 grid gap-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{currentTrack.name}</p>
                  <p className="mt-1 text-sm muted">{currentTrack.venue}</p>
                </div>
                <button className="workspace-ghost px-3 py-2 text-xs" onClick={onOpenTracks} type="button">Open track card</button>
              </div>
              <p className="text-sm muted">{trackAddress}</p>
              <div className="workspace-subtle-card p-4">
                <p className="text-sm font-medium text-white">Layout notes</p>
                <p className="mt-2 text-sm muted">{currentTrack.layoutNotes}</p>
              </div>
              <div className="workspace-subtle-card p-4">
                <p className="text-sm font-medium text-white">Track focus</p>
                <ul className="mt-3 grid gap-2 text-sm muted">
                  {trackFocus.map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm muted">Choose a recognised track to bring map data and coaching context into the session.</p>
          )}
        </article>
      </div>
      </div>
    </div>
  );
}
