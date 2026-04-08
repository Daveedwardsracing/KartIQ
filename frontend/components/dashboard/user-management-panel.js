import { formatRoleLabel, getInitials } from "@/lib/dashboard-utils";

export default function UserManagementPanel({
  accessLevelDraft,
  accessLevelsStore,
  driversStore,
  editingAccessLevelId,
  editingUserAccountId,
  mode,
  onAccessLevelCancel,
  onAccessLevelChange,
  onAccessLevelEdit,
  onAccessLevelSubmit,
  onUserAccountCancel,
  onUserAccountChange,
  onUserAccountApprove,
  onUserAccountApproveManual,
  onUserAccountDelete,
  onUserAccountEdit,
  onUserAccountResendApproval,
  onUserAccountReject,
  onUserAccountSubmit,
  userAccountDraft,
  userAccountsStore
}) {
  const permissionKeys = [
    ["view_sessions", "View sessions"],
    ["view_feedback", "View feedback"],
    ["view_history", "View history"]
  ];
  const adminCount = userAccountsStore.filter((account) => ["admin", "manager"].includes(account.role)).length;
  const parentCount = userAccountsStore.filter((account) => account.role === "parent").length;
  const isAdminMode = mode === "Administrator Management";
  const isDriverMode = mode === "Driver Management";
  const isParentMode = mode === "Parent Management";
  const filteredAccounts = userAccountsStore.filter((account) => {
    if (isAdminMode) return ["admin", "manager"].includes(account.role);
    if (isDriverMode) return account.role === "driver";
    if (isParentMode) return account.role === "parent";
    return true;
  });
  const currentTitle = isAdminMode
    ? "Administrator accounts"
    : isDriverMode
      ? "Driver accounts"
      : "Parent accounts";
  const currentDescription = isAdminMode
    ? "Create and manage admin or manager access separately from portal users."
    : isDriverMode
      ? "Manage driver logins and make sure each account is linked to the right driver profile."
      : "Assign drivers to each parent account so family access stays clean and controlled.";
  const fixedRole = isAdminMode ? "manager" : isDriverMode ? "driver" : "parent";
  const availableRoleOptions = isAdminMode
    ? [
        { value: "manager", label: "Manager" },
        { value: "admin", label: "Admin" }
      ]
    : [{ value: fixedRole, label: formatRoleLabel(fixedRole) }];
  const accountCount = filteredAccounts.length;
  const modeSummaryValue = isAdminMode ? adminCount : isDriverMode ? userAccountsStore.filter((account) => account.role === "driver").length : parentCount;
  const safeDraft = {
    name: "",
    email: "",
    password: "",
    role: fixedRole,
    access_level_id: "",
    linked_driver_id: "",
    assigned_driver_ids: [],
    ...userAccountDraft,
    assigned_driver_ids: Array.isArray(userAccountDraft?.assigned_driver_ids) ? userAccountDraft.assigned_driver_ids : []
  };

  return (
    <div className="workspace-page">
      <section className="workspace-hero workspace-hero-premium">
        <div className="workspace-hero-premium-grid">
          <div className="workspace-hero-copy max-w-3xl">
            <p className="workspace-section-label">{mode}</p>
            <h2 className="workspace-hero-title">{currentTitle}</h2>
            <p className="workspace-hero-text">{currentDescription}</p>
          </div>
          <div className="workspace-hero-grid">
          <div className="workspace-kpi">
            <p className="workspace-kpi-label">Accounts in view</p>
            <p className="workspace-kpi-value">{modeSummaryValue}</p>
            <p className="workspace-kpi-detail">{currentDescription}</p>
          </div>
          <div className="workspace-kpi">
            <p className="workspace-kpi-label">Parent portals</p>
            <p className="workspace-kpi-value">{parentCount}</p>
            <p className="workspace-kpi-detail">Parent accounts linked to one or more assigned drivers.</p>
          </div>
          <div className="workspace-kpi">
            <p className="workspace-kpi-label">Permission templates</p>
            <p className="workspace-kpi-value">{accessLevelsStore.length}</p>
            <p className="workspace-kpi-detail">Reusable access levels that keep portal permissions consistent.</p>
          </div>
        </div>
        </div>
      </section>

      <div className={`grid gap-5 ${isAdminMode ? "xl:grid-cols-[0.9fr_1.1fr]" : ""}`}>
        {isAdminMode ? (
          <article className="app-panel p-5">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="workspace-section-label">Access Levels</p>
                <h2 className="mt-2 text-2xl font-semibold">{editingAccessLevelId ? "Edit access level" : "Create access level"}</h2>
              </div>
              <span className="pill pill-neutral">{accessLevelsStore.length} total</span>
            </div>
            <form className="mt-5 grid gap-4" onSubmit={onAccessLevelSubmit}>
              <input className="workspace-field" placeholder="Level name" value={accessLevelDraft.name} onChange={(event) => onAccessLevelChange((current) => ({ ...current, name: event.target.value }))} />
              <div className="grid gap-3 md:grid-cols-3">
                {permissionKeys.map(([key, label]) => (
                  <label key={key} className="workspace-subtle-card flex items-center gap-3 px-4 py-3 text-sm">
                    <input checked={Boolean(accessLevelDraft.permissions[key])} type="checkbox" onChange={(event) => onAccessLevelChange((current) => ({ ...current, permissions: { ...current.permissions, [key]: event.target.checked } }))} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <div className="profile-actions">
                <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" type="submit">{editingAccessLevelId ? "Save level" : "Create level"}</button>
                {editingAccessLevelId ? <button className="workspace-ghost px-4 py-3 text-sm" onClick={onAccessLevelCancel} type="button">Cancel</button> : null}
              </div>
            </form>
            <div className="entity-list mt-6">
              {accessLevelsStore.map((item) => (
                <div key={item.id} className="entity-row">
                  <div>
                    <p className="entity-title">{item.name}</p>
                    <p className="entity-subtitle">{Object.entries(item.permissions || {}).filter(([, allowed]) => allowed).map(([key]) => key.replace("view_", "").replace("_", " ")).join(", ") || "No permissions"}</p>
                  </div>
                  <div className="entity-actions">
                    <button className="workspace-ghost px-3 py-2 text-sm" onClick={() => onAccessLevelEdit(item)} type="button">Edit</button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ) : null}

        <article className="app-panel p-5">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="workspace-section-label">Account Editor</p>
              <h2 className="mt-2 text-2xl font-semibold">{editingUserAccountId ? `Update ${fixedRole} account` : `Create ${fixedRole} account`}</h2>
            </div>
            <span className="pill">{accountCount} accounts</span>
          </div>
          <form className="mt-5 grid gap-4" onSubmit={onUserAccountSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <input className="workspace-field" placeholder="Full name" value={safeDraft.name} onChange={(event) => onUserAccountChange((current) => ({ ...current, name: event.target.value }))} />
              <input className="workspace-field" placeholder="Email" value={safeDraft.email} onChange={(event) => onUserAccountChange((current) => ({ ...current, email: event.target.value }))} />
              <select className="workspace-field" value={safeDraft.role || fixedRole} onChange={(event) => onUserAccountChange((current) => ({ ...current, role: event.target.value }))}>
                {availableRoleOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <input className="workspace-field" placeholder={editingUserAccountId ? "New password (optional)" : "Password"} type="password" value={safeDraft.password} onChange={(event) => onUserAccountChange((current) => ({ ...current, password: event.target.value }))} />
              <select className="workspace-field" value={safeDraft.access_level_id} onChange={(event) => onUserAccountChange((current) => ({ ...current, access_level_id: event.target.value }))}>
                <option value="">No access level</option>
                {accessLevelsStore.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              {isDriverMode ? (
                <select className="workspace-field" value={safeDraft.linked_driver_id} onChange={(event) => onUserAccountChange((current) => ({ ...current, linked_driver_id: event.target.value }))}>
                  <option value="">No linked driver</option>
                  {driversStore.map((driver) => (
                    <option key={driver.id} value={driver.id}>{driver.name}</option>
                  ))}
                </select>
              ) : null}
            </div>
            {isParentMode ? (
              <div className="workspace-subtle-card p-4">
                <p className="text-sm font-medium text-white">Assigned drivers for parent access</p>
                <div className="mt-3 chip-row">
                  {driversStore.map((driver) => {
                    const checked = safeDraft.assigned_driver_ids.includes(driver.id);
                    return (
                      <label key={driver.id} className={`pill selection-pill ${checked ? "is-selected" : "pill-neutral"} cursor-pointer`}>
                        <input checked={checked} className="hidden" type="checkbox" onChange={(event) => onUserAccountChange((current) => ({
                          ...current,
                          assigned_driver_ids: event.target.checked
                            ? [...current.assigned_driver_ids, driver.id]
                            : current.assigned_driver_ids.filter((id) => id !== driver.id)
                        }))} />
                        <span className="selection-pill-marker" aria-hidden="true">✓</span>
                        <span>{driver.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="profile-actions">
              <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" type="submit">{editingUserAccountId ? "Save account" : "Create account"}</button>
              {editingUserAccountId ? <button className="workspace-ghost px-4 py-3 text-sm" onClick={onUserAccountCancel} type="button">Cancel</button> : null}
            </div>
          </form>
        </article>

        <article className={`app-panel p-5 ${isAdminMode ? "xl:col-span-2" : ""}`}>
          <div className="flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="workspace-section-label">Team Directory</p>
              <h3 className="mt-2 text-2xl font-semibold">{currentTitle}</h3>
            </div>
            <span className="pill">{accountCount} listed</span>
          </div>
          <div className="member-list mt-5">
            {filteredAccounts.length ? filteredAccounts.map((account) => (
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
                    <span className={`pill ${account.role === "admin" ? "pill-danger" : account.role === "parent" ? "pill-warn" : ""}`}>{formatRoleLabel(account.role)}</span>
                    {account.access_level_name ? <span className="pill pill-neutral">{account.access_level_name}</span> : null}
                    <span className={`pill ${account.status === "pending" ? "pill-warn" : account.status === "rejected" ? "pill-danger" : "pill-neutral"}`}>{formatRoleLabel(account.status || "approved")}</span>
                    {account.must_change_password ? <span className="pill pill-neutral">Must change password</span> : null}
                  </div>
                </div>
                <div>
                  <p className="member-block-label">Drivers</p>
                  <div className="chip-row mt-2">
                    {account.linked_driver_id ? <span className="pill">{driversStore.find((driver) => driver.id === account.linked_driver_id)?.name || "Linked driver"}</span> : null}
                    {account.assigned_drivers?.length ? account.assigned_drivers.map((driver) => (
                      <span key={driver.id} className="pill pill-neutral">{driver.name}</span>
                    )) : !account.linked_driver_id ? <span className="pill pill-neutral">No assigned drivers</span> : null}
                  </div>
                </div>
                <div>
                  <p className="member-block-label">Portal summary</p>
                  <p className="entity-subtitle mt-2">{account.role === "parent" ? "Can view assigned drivers" : account.role === "driver" ? "Personal driver portal" : "Team-level access"}</p>
                </div>
                <div className="entity-actions">
                  <button className="workspace-ghost px-3 py-2 text-sm" onClick={() => onUserAccountEdit(account)} type="button">Edit</button>
                  {account.status === "pending" ? (
                    <>
                      <button className="workspace-primary px-3 py-2 text-sm text-white" onClick={() => onUserAccountApprove(account.id)} type="button">Approve</button>
                      <button className="workspace-ghost px-3 py-2 text-sm" onClick={() => onUserAccountResendApproval(account.id)} type="button">Resend email</button>
                      <button className="workspace-ghost px-3 py-2 text-sm" onClick={() => onUserAccountApproveManual(account.id)} type="button">Approve without email</button>
                      <button className="workspace-danger px-3 py-2 text-sm" onClick={() => onUserAccountReject(account.id)} type="button">Reject</button>
                    </>
                  ) : null}
                  <button className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" onClick={() => onUserAccountDelete(account.id)} type="button">Delete</button>
                </div>
              </div>
            )) : (
              <div className="workspace-subtle-card p-6 text-sm muted">No accounts created yet for this role. Add one here to keep access clean and role-specific.</div>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
