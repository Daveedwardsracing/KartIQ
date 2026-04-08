import { formatRoleLabel, getInitials } from "@/lib/dashboard-utils";

export default function DriverManager({
  screen,
  driversStore,
  driverDraft,
  classesStore,
  editingDriverId,
  selectedDriverTimeline,
  selectedDriverTimelineId,
  accessLevelsStore,
  editingUserAccountId,
  userAccountDraft,
  userAccountsStore,
  onCancel,
  onChange,
  onDelete,
  onEdit,
  onOpenTimeline,
  onSubmit,
  onUserAccountCancel,
  onUserAccountChange,
  onUserAccountDelete,
  onUserAccountEdit,
  onUserAccountSubmit
}) {
  const isProfilesScreen = screen === "Driver Profiles";
  const isAccountsScreen = screen === "Driver Accounts";
  const driverCount = driversStore.length;
  const driversWithPortal = driversStore.filter((driver) => driver.email).length;
  const aliasCount = driversStore.reduce((total, driver) => total + (driver.aliases?.length || 0), 0);
  const driverAccounts = userAccountsStore.filter((account) => account.role === "driver");
  const linkedDriverAccounts = driverAccounts.filter((account) => account.linked_driver_id).length;
  const safeAccountDraft = {
    name: "",
    email: "",
    password: "",
    role: "driver",
    access_level_id: "",
    linked_driver_id: "",
    assigned_driver_ids: [],
    ...userAccountDraft
  };

  return (
    <div className="workspace-page">
      <section className="workspace-hero workspace-hero-premium">
        <div className="workspace-hero-premium-grid">
          <div className="workspace-hero-copy max-w-3xl">
            <p className="workspace-section-label">{isProfilesScreen ? "Driver Profiles" : "Driver Accounts"}</p>
            <h2 className="workspace-hero-title">
              {isProfilesScreen
                ? "Keep every driver profile clean, searchable, and ready for session analysis."
                : "Manage which driver accounts can sign in and which profile each login belongs to."}
            </h2>
            <p className="workspace-hero-text">
              {isProfilesScreen
                ? "Build a polished roster with login credentials, kart class assignments, and name aliases that match the way UniPro exports are actually labelled."
                : "Create the portal logins separately from the driver roster so linked access, passwords, and account permissions stay easy to manage."}
            </p>
          </div>
          <div className="workspace-hero-grid">
          <div className="workspace-kpi">
            <p className="workspace-kpi-label">{isProfilesScreen ? "Roster size" : "Driver accounts"}</p>
            <p className="workspace-kpi-value">{isProfilesScreen ? driverCount : driverAccounts.length}</p>
            <p className="workspace-kpi-detail">
              {isProfilesScreen
                ? "Drivers currently available for uploads, reports, and planning."
                : "Portal logins created for drivers in the platform."}
            </p>
          </div>
          <div className="workspace-kpi">
            <p className="workspace-kpi-label">{isProfilesScreen ? "Portal ready" : "Linked logins"}</p>
            <p className="workspace-kpi-value">{isProfilesScreen ? driversWithPortal : linkedDriverAccounts}</p>
            <p className="workspace-kpi-detail">
              {isProfilesScreen
                ? "Profiles with an email set up for direct driver access."
                : "Accounts already tied to a specific driver profile."}
            </p>
          </div>
          <div className="workspace-kpi">
            <p className="workspace-kpi-label">{isProfilesScreen ? "Aliases stored" : "Access levels"}</p>
            <p className="workspace-kpi-value">{isProfilesScreen ? aliasCount : accessLevelsStore.length}</p>
            <p className="workspace-kpi-detail">
              {isProfilesScreen
                ? "Matching names that help uploaded UniPro files map cleanly."
              : "Reusable access templates available for account setup."}
            </p>
          </div>
        </div>
        </div>
      </section>

      {isProfilesScreen ? (
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="app-panel p-5 workspace-form-card">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="workspace-section-label">Profile Editor</p>
              <h3 className="mt-2 text-2xl font-semibold">{editingDriverId ? "Update driver" : "Add a new driver"}</h3>
            </div>
            <span className="pill pill-neutral">{editingDriverId ? "Editing" : "New profile"}</span>
          </div>

          <form className="mt-5 grid gap-4" onSubmit={onSubmit}>
            <input className="workspace-field" placeholder="Driver name" value={driverDraft.name} onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))} />
            <div className="grid gap-4 md:grid-cols-2">
              <input className="workspace-field" placeholder="Number" value={driverDraft.number} onChange={(event) => onChange((current) => ({ ...current, number: event.target.value }))} />
              <select className="workspace-field" value={driverDraft.class_name} onChange={(event) => onChange((current) => ({ ...current, class_name: event.target.value }))}>
                <option value="">Select class</option>
                {classesStore.map((kartClass) => (
                  <option key={kartClass.id} value={kartClass.name}>{kartClass.name}</option>
                ))}
              </select>
            </div>
            <input className="workspace-field" placeholder="Aliases (comma separated)" value={driverDraft.aliases_text} onChange={(event) => onChange((current) => ({ ...current, aliases_text: event.target.value }))} />
            <input className="workspace-field" placeholder="Driver email" value={driverDraft.email} onChange={(event) => onChange((current) => ({ ...current, email: event.target.value }))} />
            <input className="workspace-field" placeholder={editingDriverId ? "New password (optional)" : "Driver password"} type="password" value={driverDraft.password} onChange={(event) => onChange((current) => ({ ...current, password: event.target.value }))} />
            <div className="profile-actions pt-1">
              <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" type="submit">{editingDriverId ? "Save driver" : "Create driver"}</button>
              {editingDriverId ? (
                <button className="workspace-ghost px-4 py-3 text-sm" onClick={onCancel} type="button">Cancel</button>
              ) : null}
            </div>
          </form>
        </article>

        <article className="app-panel p-5">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="workspace-section-label">Team Directory</p>
              <h3 className="mt-2 text-2xl font-semibold">Driver profiles</h3>
            </div>
            <span className="pill">{driverCount} listed</span>
          </div>

          <div className="member-list mt-5">
            {driversStore.length ? driversStore.map((driver) => (
              <div key={driver.id} className="member-row">
                <div className="member-identity">
                  <div className="member-avatar">{getInitials(driver.name)}</div>
                  <div>
                    <p className="member-heading">{driver.name}</p>
                    <p className="entity-subtitle">{driver.number ? `Driver #${driver.number}` : "Race number not set"}</p>
                  </div>
                </div>
                <div>
                  <p className="member-block-label">Class and aliases</p>
                  <div className="chip-row mt-2">
                    <span className={`pill ${driver.class_name ? "" : "pill-neutral"}`}>{driver.class_name || "No class"}</span>
                    {driver.aliases?.length ? driver.aliases.map((alias) => (
                      <span key={alias} className="pill pill-neutral">{alias}</span>
                    )) : <span className="pill pill-neutral">No aliases</span>}
                  </div>
                </div>
                <div>
                  <p className="member-block-label">Portal login</p>
                  <p className="entity-subtitle mt-2">{driver.email || "Not configured"}</p>
                </div>
                <div>
                  <p className="member-block-label">Matching status</p>
                  <p className="entity-subtitle mt-2">{driver.aliases?.length ? "Alias ready for file matching" : "Direct name only"}</p>
                </div>
                <div className="entity-actions">
                  <button className="workspace-ghost px-3 py-2 text-sm" onClick={() => onEdit(driver)} type="button">Edit profile</button>
                  <button className="workspace-ghost px-3 py-2 text-sm" onClick={() => onOpenTimeline(driver.id)} type="button">View timeline</button>
                  <button className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" onClick={() => onDelete(driver.id)} type="button">Delete</button>
                </div>
              </div>
            )) : (
              <div className="workspace-subtle-card p-6 text-sm muted">No drivers added yet. Create the first driver profile to start building your team roster.</div>
            )}
          </div>
        </article>
      </div>
      ) : null}

      {isProfilesScreen ? (
      <article className="app-panel p-5">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="workspace-section-label">Improvement Timeline</p>
            <h3 className="mt-2 text-2xl font-semibold">{selectedDriverTimeline?.driver?.name || "Select a driver timeline"}</h3>
          </div>
          {selectedDriverTimelineId ? <span className="pill">{selectedDriverTimeline?.timeline?.length || 0} sessions</span> : null}
        </div>
        {selectedDriverTimeline?.driver ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
              <p className="text-sm font-medium">Performance over time</p>
              <div className="mt-4 grid gap-3">
                {(selectedDriverTimeline.timeline || []).length ? selectedDriverTimeline.timeline.slice(0, 8).map((item) => (
                  <div key={item.session_id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{item.event_round}</p>
                        <p className="mt-1 text-sm muted">{item.event_name} / {item.session_type}</p>
                      </div>
                      <span className="pill pill-neutral">{item.status || "uploaded"}</span>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <TimelineMetric label="Best lap" value={item.best_lap} />
                      <TimelineMetric label="Best 3 avg" value={item.best_three_average} />
                      <TimelineMetric label="Consistency" value={item.consistency} />
                      <TimelineMetric label="Rank" value={item.session_rank} />
                    </div>
                  </div>
                )) : <p className="muted">No uploaded sessions for this driver yet.</p>}
              </div>
            </div>
            <div className="grid gap-4">
              <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                <p className="text-sm font-medium">Recent report history</p>
                <div className="mt-3 grid gap-3">
                  {(selectedDriverTimeline.reports || []).length ? selectedDriverTimeline.reports.slice(0, 5).map((item) => (
                    <div key={item.report_id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="pill pill-neutral">{item.audience}</span>
                        <span className="pill">{item.status}</span>
                      </div>
                      <p className="mt-3 text-sm">{item.summary}</p>
                    </div>
                  )) : <p className="muted">No reports generated for this driver yet.</p>}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                <p className="text-sm font-medium">Quick summary</p>
                <p className="mt-3 text-sm muted">
                  {(selectedDriverTimeline.timeline || []).length
                    ? `${selectedDriverTimeline.driver.name} has ${selectedDriverTimeline.timeline.length} stored session${selectedDriverTimeline.timeline.length === 1 ? "" : "s"} and ${(selectedDriverTimeline.reports || []).length} generated report${(selectedDriverTimeline.reports || []).length === 1 ? "" : "s"}.`
                    : "Open a driver timeline to start building a picture of progress over time."}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 workspace-subtle-card p-6 text-sm muted">Choose a driver and open their timeline to see best lap, consistency, ranking, and report history across sessions.</div>
        )}
      </article>
      ) : null}

      {isAccountsScreen ? (
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="app-panel p-5">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="workspace-section-label">Driver Accounts</p>
              <h3 className="mt-2 text-2xl font-semibold">{editingUserAccountId ? "Update driver account" : "Create driver account"}</h3>
            </div>
            <span className="pill">{driverAccounts.length} accounts</span>
          </div>
          <form className="mt-5 grid gap-4" onSubmit={onUserAccountSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <input className="workspace-field" placeholder="Full name" value={safeAccountDraft.name} onChange={(event) => onUserAccountChange((current) => ({ ...current, name: event.target.value }))} />
              <input className="workspace-field" placeholder="Email" value={safeAccountDraft.email} onChange={(event) => onUserAccountChange((current) => ({ ...current, email: event.target.value }))} />
              <select className="workspace-field" value={safeAccountDraft.role || "driver"} onChange={(event) => onUserAccountChange((current) => ({ ...current, role: event.target.value }))}>
                <option value="driver">Driver</option>
              </select>
              <input className="workspace-field" placeholder={editingUserAccountId ? "New password (optional)" : "Password"} type="password" value={safeAccountDraft.password} onChange={(event) => onUserAccountChange((current) => ({ ...current, password: event.target.value }))} />
              <select className="workspace-field" value={safeAccountDraft.access_level_id} onChange={(event) => onUserAccountChange((current) => ({ ...current, access_level_id: event.target.value }))}>
                <option value="">No access level</option>
                {accessLevelsStore.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <select className="workspace-field" value={safeAccountDraft.linked_driver_id} onChange={(event) => onUserAccountChange((current) => ({ ...current, linked_driver_id: event.target.value }))}>
                <option value="">No linked driver</option>
                {driversStore.map((driver) => (
                  <option key={driver.id} value={driver.id}>{driver.name}</option>
                ))}
              </select>
            </div>
            <div className="profile-actions">
              <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" type="submit">{editingUserAccountId ? "Save account" : "Create account"}</button>
              {editingUserAccountId ? <button className="workspace-ghost px-4 py-3 text-sm" onClick={onUserAccountCancel} type="button">Cancel</button> : null}
            </div>
          </form>
        </article>

        <article className="app-panel p-5">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="workspace-section-label">Driver Login Directory</p>
              <h3 className="mt-2 text-2xl font-semibold">All driver accounts</h3>
            </div>
            <span className="pill">{driverAccounts.length} linked</span>
          </div>
          <div className="member-list mt-5">
            {driverAccounts.length ? driverAccounts.map((account) => (
              <div key={account.id} className="member-row">
                <div className="member-identity">
                  <div className="member-avatar">{getInitials(account.name)}</div>
                  <div>
                    <p className="member-heading">{account.name}</p>
                    <p className="entity-subtitle">{account.email}</p>
                  </div>
                </div>
                <div>
                  <p className="member-block-label">Role</p>
                  <div className="chip-row mt-2">
                    <span className="pill">{formatRoleLabel(account.role)}</span>
                    {account.access_level_name ? <span className="pill pill-neutral">{account.access_level_name}</span> : null}
                  </div>
                </div>
                <div>
                  <p className="member-block-label">Linked driver</p>
                  <div className="chip-row mt-2">
                    {account.linked_driver_id ? <span className="pill pill-neutral">{driversStore.find((driver) => driver.id === account.linked_driver_id)?.name || "Linked driver"}</span> : <span className="pill pill-neutral">No linked driver</span>}
                  </div>
                </div>
                <div>
                  <p className="member-block-label">Portal summary</p>
                  <p className="entity-subtitle mt-2">Personal driver portal access</p>
                </div>
                <div className="entity-actions">
                  <button className="workspace-ghost px-3 py-2 text-sm" onClick={() => onUserAccountEdit(account)} type="button">Edit</button>
                  <button className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" onClick={() => onUserAccountDelete(account.id)} type="button">Delete</button>
                </div>
              </div>
            )) : (
              <div className="workspace-subtle-card p-6 text-sm muted">No driver accounts created yet. Create one here and link it to a driver profile.</div>
            )}
          </div>
        </article>
      </div>
      ) : null}
    </div>
  );
}

function TimelineMetric({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
      <p className="text-xs muted">{label}</p>
      <p className="mt-1 font-medium">{value ?? "-"}</p>
    </div>
  );
}
