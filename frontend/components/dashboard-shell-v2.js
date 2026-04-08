"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TrackLibrary from "@/components/track-library";
import HomeDashboard from "@/components/dashboard/home-dashboard";
import DriverManager from "@/components/dashboard/driver-manager";
import UserManagementPanel from "@/components/dashboard/user-management-panel";
import PlanningCalendar from "@/components/dashboard/planning-calendar";
import ReportBuilderPanel from "@/components/dashboard/report-builder";
import OperationsPanel from "@/components/dashboard/operations-panel";
import UploadWorkspace from "@/components/dashboard/upload-workspace";
import { AnalysisPanel, ReportsPanel } from "@/components/dashboard/analysis-panels";
import { EventManager, SessionEditorPage, SessionListPage } from "@/components/dashboard/event-management-pages";
import { PlannedSessionPage } from "@/components/dashboard/planned-session-page";
import SetupDatabasePage from "@/components/dashboard/setup-database-page";
import { HistoryPanel, DriverPortalPanel, ParentPortalPanel, SessionResultsPage } from "@/components/dashboard/history-and-portals";
import {
  normalizeDriverSetup,
  serializeDriverSetup
} from "@/components/dashboard/planned-session-utils";
import { findTrackByName } from "@/lib/tracks";
import { buildAppStateSnapshot, buildSessionSelectionFormState, buildTestSessionEditorDraft } from "@/lib/dashboard-navigation";
import { buildUploadFormData } from "@/lib/upload-flow";
import {
  buildDriverPayload,
  createEmptyAccountDraftForScreen,
  formatRoleLabel,
  getManagementScreenForRole,
  slugify
} from "@/lib/dashboard-utils";
import {
  aiHealth,
  approveUserAccountManual,
  chatWithAi,
  changePassword,
  confirmPasswordReset,
  approveUserAccount,
  createBackup,
  createAiMemory,
  createAccessLevel,
  createCoachingNote,
  createDriver,
  createEvent,
  createSessionPreset,
  createTestSession,
  createUserAccount,
  deleteCoachingNote,
  deleteAiMemory,
  deleteUserAccount,
  deleteDriver,
  deleteEvent,
  getEmailSettings,
  deleteTestSession,
  deleteSession,
  deleteSessionPreset,
  exportPdf,
  exportOperationalData,
  generateFeedback,
  getAppSettings,
  getDriverTimeline,
  getDriverPortal,
  getOperationsHealth,
  getRestoreGuidance,
  getSessionDetail,
  getUserAccountPortal,
  listAuthAudit,
  listBackups,
  listAccessLevels,
  listEmailDelivery,
  listDrivers,
  listEvents,
  listKartClasses,
  listAiChatHistory,
  listAiMemory,
  listReports,
  listSessions,
  listSetupDatabase,
  listTestSessions,
  listTracks,
  listUserAccounts,
  login,
    register,
    refreshTestSessionWeather,
    resendApprovalEmail,
  rejectUserAccount,
  reportEngineHealth,
  requestPasswordReset,
  sendTestEmail,
  updateAppSettings,
  updateAccessLevel,
  updateDriver,
  updateEmailSettings,
  updateEvent,
  updateTrack,
  updateReportPublish,
  updateSessionStatus,
  updateTestSession,
  updateUserAccount,
  uploadSessions
} from "@/lib/api";

const ADMIN_NAV_GROUPS = [
  { label: "Workspace", items: ["Home", "Chat Bot", "Reports", "History"] },
  {
    label: "Team",
    items: [{
      label: "User Management",
      children: [
        { label: "Driver Management", children: ["Driver Profiles", "Driver Accounts"] },
        "Parent Management",
        "Administrator Management"
      ]
    }]
  },
  { label: "Planning", items: [{ label: "Events", children: ["Create Event", "View Upcoming Events", "View Past Events"] }, "Calendar", "Tracks", "Setup Database"] }
];
const SETTINGS_NAV_GROUP = { label: "Settings", items: [{ label: "Settings", children: ["General Settings", "AI Settings", "Email Settings", "Operations"] }] };
const PORTAL_NAV_GROUPS = [
  { label: "Portal", items: ["My Portal", "History"] }
];
const SCREEN_META = {
  Home: {
    eyebrow: "Overview",
    title: "Run the coaching operation from one clean team dashboard.",
    subtitle: "See what is coming up, where sessions are waiting for uploads, and which areas of the platform need attention next."
  },
  "Upload Session": {
    eyebrow: "Session Workflow",
    title: "Upload, validate, analyse, and generate feedback in one guided flow.",
    subtitle: "Set the event scope, align it with a planned test session if needed, then upload UniPro files and turn the processed comparison into reports."
  },
  "Reports": {
    eyebrow: "Report Studio",
    title: "Review structured feedback and export clean debrief packs.",
    subtitle: "Keep the analysis and AI summary side by side so coaches can sense-check the numbers before sharing the output."
  },
  "Chat Bot": {
    eyebrow: "Assistant",
    title: "Chat with the selected AI provider using your stored sessions, notes, and memory.",
    subtitle: "Use the chatbot for coaching questions, workflow help, track planning, and quick operational support, with retrieval pulled from the app's own data."
  },
  "History": {
    eyebrow: "Session Archive",
    title: "Reopen past uploads and keep your coaching history easy to navigate.",
    subtitle: "Stored sessions, generated reports, and portal-ready views all stay accessible in one session library."
  },
  "Session Results": {
    eyebrow: "Session Results",
    title: "Review one uploaded session as a complete coaching result set.",
    subtitle: "Move from overview to driver comparison to published reports without hunting through separate admin panels."
  },
  "Driver Management": {
    eyebrow: "Driver Management",
    title: "Manage driver profiles and driver logins in one combined workspace.",
    subtitle: "Keep the roster, aliases, class details, and driver account access together so the team only has one driver management flow."
  },
  "Driver Profiles": {
    eyebrow: "Driver Management",
    title: "Build and maintain the clean roster behind every session, upload, and report.",
    subtitle: "Keep aliases, kart classes, portal-ready contact details, and progress history on a dedicated driver profile page."
  },
  "Driver Accounts": {
    eyebrow: "Driver Management",
    title: "Manage the sign-in accounts that give drivers access to their own portal.",
    subtitle: "Handle linked logins, passwords, and access-level templates separately from the driver profile editor."
  },
  "Parent Management": {
    eyebrow: "Parent Accounts",
    title: "Control which drivers each parent account is allowed to follow.",
    subtitle: "Assign one or more drivers to each parent and keep family access separate from team administration."
  },
  "Administrator Management": {
    eyebrow: "Administrator Access",
    title: "Manage elevated accounts, managers, and permission templates separately from portal users.",
    subtitle: "Keep full-access roles, coaching staff accounts, and reusable access levels in one dedicated admin workspace."
  },
  "Create Event": {
    eyebrow: "Event Setup",
    title: "Create a new event in its own focused planning workspace.",
    subtitle: "Define the venue, round, date, and driver pool first so the rest of the session workflow starts from a clean event record."
  },
  "View Upcoming Events": {
    eyebrow: "Upcoming Events",
    title: "See future events and open the session plan from a cleaner schedule view.",
    subtitle: "Keep upcoming rounds and test days easy to browse before telemetry starts arriving."
  },
  "View Past Events": {
    eyebrow: "Past Events",
    title: "Review completed events and reopen their session plans when needed.",
    subtitle: "Use the event archive to jump back into older rounds without mixing them into the forward-planning workflow."
  },
  Calendar: {
    eyebrow: "Calendar",
    title: "See created events on a proper planning calendar.",
    subtitle: "Use a month view to understand the schedule at a glance and jump into event planning from the dates themselves."
  },
  "Event Sessions": {
    eyebrow: "Event Sessions",
    title: "Choose the session inside the selected event before uploading data.",
    subtitle: "Work inside one event at a time so session planning, driver assignment, and uploads stay clean and easy to follow."
  },
  "Planned Session": {
    eyebrow: "Planned Session",
    title: "Open the planned session before you upload or edit it.",
    subtitle: "Review the assigned drivers and session details first, then jump into upload or editing from the session itself."
  },
  "Create Session": {
    eyebrow: "Session Setup",
    title: "Create or edit a single planned session in its own focused workspace.",
    subtitle: "Set the session details, assign the event's drivers, then save it back into the selected event."
  },
  "Tracks": {
    eyebrow: "Track Database",
    title: "Browse your track library and bring coaching context into every session.",
    subtitle: "Keep maps, layout notes, and track-specific coaching prompts ready while planning events and uploads."
  },
  "Setup Database": {
    eyebrow: "Setup Database",
    title: "Turn saved session setups into a searchable track-by-track setup library.",
    subtitle: "Every planned-session setup now feeds a shared setup database so coaches can compare trends, reuse proven baselines, and let AI reason across the history."
  },
  "General Settings": {
    eyebrow: "Settings",
    title: "Control the platform defaults that shape planning, uploads, portals, and reports.",
    subtitle: "Keep the everyday admin preferences in one tidy settings page instead of scattering them across the workflow."
  },
  "AI Settings": {
    eyebrow: "Settings",
    title: "Control the active AI provider, model, retrieval, and persistent memory.",
    subtitle: "Choose Ollama or OpenAI, decide how much app context to retrieve, and store recurring memory the AI should keep using."
  },
  "Email Settings": {
    eyebrow: "Settings",
    title: "Configure SMTP email delivery for approvals, temporary passwords, and resets.",
    subtitle: "Keep account emails flowing from one dedicated email settings page."
  },
  "Operations": {
    eyebrow: "Operations",
    title: "Monitor beta health, account activity, backups, and delivery status from one operations console.",
    subtitle: "Keep a close eye on auth activity, SMTP delivery, AI availability, backups, and export safeguards while the live beta is running."
  },
  "My Portal": {
    eyebrow: "Portal",
    title: "Stay focused on the sessions, reports, and trends that matter to this account.",
    subtitle: "A cleaner portal view keeps drivers and parents on their own feedback without exposing the admin workspace."
  }
};
const EMPTY_DRIVER = { name: "", number: "", class_name: "", aliases_text: "", email: "", password: "" };
const EMPTY_EVENT = { venue: "", name: "", session_type: "", start_date: "", end_date: "", driver_ids: [] };
const EMPTY_DRIVER_SETUP = {
  front_sprocket: "",
  rear_sprocket: "",
  carb_jet: "",
  axle_length: "",
  axle_type: "",
  tyre_type: "",
  front_tyre_pressure: "",
  rear_tyre_pressure: "",
  torsion_bar_type: "",
  caster_type: "",
  ride_height: "",
};
const EMPTY_TEST_SESSION = {
  name: "",
  venue: "",
  session_type: "Test Session",
  date: "",
  start_time: "",
  end_time: "",
  event_id: "",
  status: "planned",
  weather: "",
  track_condition: "",
  tyre_condition: "",
  mechanic_notes: "",
  coach_notes: "",
  driver_ids: [],
  driver_setups: {}
};
const EMPTY_ACCESS_LEVEL = { name: "", permissions: { view_sessions: true, view_feedback: true, view_history: true } };
const EMPTY_ACCOUNT = { name: "", email: "", password: "", role: "driver", access_level_id: "", linked_driver_id: "", assigned_driver_ids: [], status: "approved", must_change_password: false };
const EMPTY_RESET_REQUEST = { email: "" };
const EMPTY_RESET_CONFIRM = { token: "", password: "", confirmPassword: "" };
const EMPTY_REGISTER = { name: "", email: "", role: "driver", linked_driver_id: "", assigned_driver_ids: [] };
const EMPTY_PASSWORD_CHANGE = { email: "", current_password: "", password: "", confirmPassword: "" };
const DEFAULT_APP_SETTINGS = {
  organisationName: "Dave Edwards Racing",
  supportEmail: "dave@daveedwardsracing.co.uk",
  timezone: "Europe/London",
  dateFormat: "en-GB",
  defaultLandingScreen: "Home",
  defaultAudience: "coach",
  defaultSessionType: "Saturday Practice",
  defaultEventRoundPrefix: "",
  defaultTrackName: "",
  mapsApiKey: "",
  speedUnit: "kmh",
  aiProvider: "ollama",
  aiModel: "gemma3:4b",
  openAiModel: "gpt-5.4-mini",
  openAiApiKey: "",
  openAiApiKeyConfigured: false,
  aiRetrievalEnabled: true,
  aiMemoryEnabled: true,
  showTrackMaps: true,
  autoOpenLatestPortalSession: true,
  autoReturnToUpcomingEvents: true,
  compactTables: false,
  pdfFilePrefix: "DER",
  portalLastSeenSessionAt: "",
  portalLastSeenReportAt: ""
};
const DEFAULT_EMAIL_SETTINGS = {
  smtpHost: "",
  smtpPort: "587",
  smtpUsername: "",
  smtpPassword: "",
  fromName: "DER Telemetry Analysis Software",
  fromEmail: "",
  useTls: true,
  useSsl: false,
  allowInvalidCertificates: false,
  testEmail: ""
};
const EMPTY_AI_MEMORY = { title: "", content: "", tags: "" };
const APP_STATE_STORAGE_KEY = "der-unipro-app-state-v1";

function normalizeScreenName(screenName) {
  return screenName === "Driver Management" ? "Driver Profiles" : screenName;
}

function getPathForScreen(screen) {
  if (screen === "History") {
    return "/history";
  }
  if (screen === "Session Results") {
    return "/sessions";
  }
  if (screen === "Reports") {
    return "/reports";
  }
  if (screen === "Setup Database") {
    return "/setups";
  }
  if (screen === "General Settings") {
    return "/settings";
  }
  if (screen === "AI Settings") {
    return "/settings/ai";
  }
  if (screen === "Email Settings") {
    return "/settings/email";
  }
  if (screen === "Operations") {
    return "/settings/operations";
  }
  if (["Create Event", "View Upcoming Events", "View Past Events", "Calendar"].includes(screen)) {
    return "/events";
  }
  if (["Event Sessions", "Planned Session", "Create Session"].includes(screen)) {
    return "/events";
  }
  return "/";
}

function getPathForState(snapshot) {
  if (snapshot?.screen === "Session Results" && snapshot?.selectedSessionId) {
    return `/sessions/${snapshot.selectedSessionId}`;
  }
  if (["Event Sessions", "Planned Session", "Create Session"].includes(snapshot?.screen) && snapshot?.selectedPlannerEventId) {
    return `/events/${snapshot.selectedPlannerEventId}`;
  }
  return getPathForScreen(snapshot?.screen);
}

function buildSettingsScope(session) {
  return {
    user_account_id: session?.user_account_id || "",
    email: session?.email || "",
    role: session?.role || ""
  };
}

export default function DashboardShellV2({ initialScreen = "Home", initialSessionId = null, initialEventId = null }) {
  const historyReadyRef = useRef(false);
  const suppressHistoryPushRef = useRef(false);
  const lastHistorySnapshotRef = useRef("");
  const [session, setSession] = useState(null);
  const [screen, setScreen] = useState(initialScreen);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [reports, setReports] = useState(null);
  const [driversStore, setDriversStore] = useState([]);
  const [eventsStore, setEventsStore] = useState([]);
  const [classesStore, setClassesStore] = useState([]);
  const [tracksStore, setTracksStore] = useState([]);
  const [setupDatabaseStore, setSetupDatabaseStore] = useState({ tracks: [], entries: [], total_tracks: 0, total_entries: 0 });
  const [sessionsStore, setSessionsStore] = useState([]);
  const [testSessionsStore, setTestSessionsStore] = useState([]);
  const [reportsStore, setReportsStore] = useState([]);
  const [accessLevelsStore, setAccessLevelsStore] = useState([]);
  const [userAccountsStore, setUserAccountsStore] = useState([]);
  const [portalData, setPortalData] = useState(null);
  const [portalSeenSnapshot, setPortalSeenSnapshot] = useState({ lastSeenSessionAt: "", lastSeenReportAt: "" });
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState(null);
  const [selectedDriverTimeline, setSelectedDriverTimeline] = useState(null);
  const [selectedDriverTimelineId, setSelectedDriverTimelineId] = useState(null);
  const [selectedPlannerEventId, setSelectedPlannerEventId] = useState(initialEventId);
  const [editingDriverId, setEditingDriverId] = useState(null);
  const [editingEventId, setEditingEventId] = useState(null);
  const [editingTestSessionId, setEditingTestSessionId] = useState(null);
  const [editingAccessLevelId, setEditingAccessLevelId] = useState(null);
  const [editingUserAccountId, setEditingUserAccountId] = useState(null);
  const [expandedNavGroups, setExpandedNavGroups] = useState({ "User Management": true, "Driver Management": true, Events: true });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState({ reachable: false, models: [] });
  const [openAiStatus, setOpenAiStatus] = useState({ configured: false, reachable: false, models: [] });
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [authMode, setAuthMode] = useState("login");
  const [authNotice, setAuthNotice] = useState("");
  const [reportNotice, setReportNotice] = useState("");
  const [resetRequest, setResetRequest] = useState(EMPTY_RESET_REQUEST);
  const [resetConfirm, setResetConfirm] = useState(EMPTY_RESET_CONFIRM);
  const [registerDraft, setRegisterDraft] = useState(EMPTY_REGISTER);
  const [pendingPasswordChange, setPendingPasswordChange] = useState(EMPTY_PASSWORD_CHANGE);
  const [appSettings, setAppSettings] = useState(DEFAULT_APP_SETTINGS);
  const [emailSettings, setEmailSettings] = useState(DEFAULT_EMAIL_SETTINGS);
  const [authAuditEntries, setAuthAuditEntries] = useState([]);
  const [emailDeliveryLog, setEmailDeliveryLog] = useState([]);
  const [operationsHealth, setOperationsHealth] = useState(null);
  const [reportHealth, setReportHealth] = useState(null);
  const [backupEntries, setBackupEntries] = useState([]);
  const [restoreGuidance, setRestoreGuidance] = useState(null);
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      role: "assistant",
      content: "Ask about event planning, tracks, driver coaching, session workflow, or telemetry prep and I'll reply using the local Ollama model."
    }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [aiMemoryEntries, setAiMemoryEntries] = useState([]);
  const [aiMemoryDraft, setAiMemoryDraft] = useState(EMPTY_AI_MEMORY);
  const [driverDraft, setDriverDraft] = useState(EMPTY_DRIVER);
  const [eventDraft, setEventDraft] = useState(EMPTY_EVENT);
  const [testSessionDraft, setTestSessionDraft] = useState(EMPTY_TEST_SESSION);
  const [accessLevelDraft, setAccessLevelDraft] = useState(EMPTY_ACCESS_LEVEL);
  const [userAccountDraft, setUserAccountDraft] = useState(EMPTY_ACCOUNT);
  const [mapsApiKey, setMapsApiKey] = useState("");
  const [formState, setFormState] = useState({
    eventName: DEFAULT_APP_SETTINGS.defaultTrackName,
    eventRound: DEFAULT_APP_SETTINGS.defaultEventRoundPrefix,
    sessionType: DEFAULT_APP_SETTINGS.defaultSessionType,
    testSessionId: "",
    audience: DEFAULT_APP_SETTINGS.defaultAudience,
    model: DEFAULT_APP_SETTINGS.aiModel,
  });

  useEffect(() => {
    let cancelled = false;

    const applySnapshot = async (snapshot) => {
      if (!snapshot) return;

      const nextScreen = initialScreen === "History"
        ? "History"
        : initialScreen === "Session Results"
          ? "Session Results"
          : initialScreen === "Reports"
            ? "Reports"
            : initialScreen === "General Settings"
              ? "General Settings"
              : initialScreen === "AI Settings"
                ? "AI Settings"
                : initialScreen === "Email Settings"
                  ? "Email Settings"
                  : initialScreen === "Operations"
                    ? "Operations"
          : initialScreen === "Event Sessions"
            ? "Event Sessions"
            : normalizeScreenName(snapshot.screen || initialScreen || "Home");
      setScreen(nextScreen);
      setSelectedPlannerEventId(snapshot.selectedPlannerEventId || initialEventId || null);
      setSelectedSessionId(snapshot.selectedSessionId || initialSessionId || null);
      setSelectedDriverTimelineId(snapshot.selectedDriverTimelineId || null);
      setFormState((current) => ({
        ...current,
        testSessionId: snapshot.testSessionId || "",
      }));

      if (snapshot.session) {
        setSession(snapshot.session);
        const loadedSettings = await loadSettingsForSession(snapshot.session);
        if (cancelled) return;
        if (["driver", "parent"].includes(snapshot.session.role)) {
          const portal = snapshot.session.user_account_id
            ? await getUserAccountPortal(snapshot.session.user_account_id)
            : await getDriverPortal(snapshot.session.driver_id);
          if (cancelled) return;
          setPortalData(portal);
          if (!snapshot.selectedSessionId && loadedSettings.autoOpenLatestPortalSession) {
            const firstSession = snapshot.session.role === "parent"
              ? (portal.drivers || []).flatMap((item) => item.sessions || [])[0]?.id
              : portal.sessions?.[0]?.id;
            if (firstSession) {
              setSelectedSessionId(firstSession);
              await loadSessionDetail(firstSession);
            }
          }
        }
      }

      if (snapshot.selectedSessionId) {
        await loadSessionDetail(snapshot.selectedSessionId);
        if (cancelled) return;
      }

      if (snapshot.selectedDriverTimelineId) {
        try {
          const timeline = await getDriverTimeline(snapshot.selectedDriverTimelineId);
          if (cancelled) return;
          setSelectedDriverTimeline(timeline);
        } catch {
          // Ignore timeline restore failures.
        }
      }
    };

    const initialise = async () => {
      await hydrateDashboard();
      if (cancelled || typeof window === "undefined") return;

      let historySnapshot = buildAppStateSnapshot({
        session,
        screen,
        selectedSessionId: selectedSessionId || initialSessionId,
        selectedPlannerEventId: selectedPlannerEventId || initialEventId,
        selectedDriverTimelineId,
        testSessionId: formState.testSessionId,
      });
      const raw = window.localStorage.getItem(APP_STATE_STORAGE_KEY);
      if (raw) {
        try {
          const snapshot = JSON.parse(raw);
          if (initialScreen === "History") {
            snapshot.screen = "History";
          } else if (initialScreen === "Session Results") {
            snapshot.screen = "Session Results";
            snapshot.selectedSessionId = initialSessionId || snapshot.selectedSessionId || null;
          } else if (["View Upcoming Events", "View Past Events", "Create Event", "Calendar", "Tracks", "Setup Database"].includes(initialScreen)) {
            snapshot.screen = initialScreen;
            if (initialScreen !== "Tracks") {
              snapshot.selectedPlannerEventId = null;
            }
          } else if (["Reports", "General Settings", "AI Settings", "Email Settings", "Operations"].includes(initialScreen)) {
            snapshot.screen = initialScreen;
          } else if (initialScreen === "Event Sessions") {
            snapshot.screen = "Event Sessions";
            snapshot.selectedPlannerEventId = initialEventId || snapshot.selectedPlannerEventId || null;
          }
          await applySnapshot(snapshot);
          historySnapshot = snapshot;
        } catch {
          window.localStorage.removeItem(APP_STATE_STORAGE_KEY);
        }
      } else if (initialScreen === "Session Results" && initialSessionId) {
        historySnapshot = {
          ...historySnapshot,
          screen: "Session Results",
          selectedSessionId: initialSessionId,
        };
        await applySnapshot(historySnapshot);
      } else if (["View Upcoming Events", "View Past Events", "Create Event", "Calendar", "Tracks", "Setup Database"].includes(initialScreen)) {
        historySnapshot = {
          ...historySnapshot,
          screen: initialScreen,
          selectedPlannerEventId: initialScreen === "Tracks" ? historySnapshot.selectedPlannerEventId : null,
        };
        await applySnapshot(historySnapshot);
      } else if (["Reports", "General Settings", "AI Settings", "Email Settings", "Operations"].includes(initialScreen)) {
        historySnapshot = {
          ...historySnapshot,
          screen: initialScreen,
        };
        await applySnapshot(historySnapshot);
      } else if (initialScreen === "Event Sessions" && initialEventId) {
        historySnapshot = {
          ...historySnapshot,
          screen: "Event Sessions",
          selectedPlannerEventId: initialEventId,
        };
        await applySnapshot(historySnapshot);
      }

      const serialised = JSON.stringify(historySnapshot);
      lastHistorySnapshotRef.current = serialised;
      window.history.replaceState({ derAppState: historySnapshot }, "", getPathForState(historySnapshot));
      historyReadyRef.current = true;
    };

    const handlePopState = async (event) => {
      const snapshot = event.state?.derAppState;
      if (!snapshot) {
        return;
      }
      suppressHistoryPushRef.current = true;
      setSession(snapshot.session || null);
      setScreen(normalizeScreenName(snapshot.screen || initialScreen || "Home"));
      setSelectedPlannerEventId(snapshot.selectedPlannerEventId || initialEventId || null);
      setSelectedSessionId(snapshot.selectedSessionId || null);
      setSelectedDriverTimelineId(snapshot.selectedDriverTimelineId || null);
      setFormState((current) => ({
        ...current,
        testSessionId: snapshot.testSessionId || "",
      }));
      if (snapshot.selectedSessionId) {
        await loadSessionDetail(snapshot.selectedSessionId);
      } else {
        setSelectedSessionDetail(null);
      }
      if (snapshot.selectedDriverTimelineId) {
        try {
          const timeline = await getDriverTimeline(snapshot.selectedDriverTimelineId);
          setSelectedDriverTimeline(timeline);
        } catch {
          setSelectedDriverTimeline(null);
        }
      } else {
        setSelectedDriverTimeline(null);
      }
    };

    initialise();
    window.addEventListener("popstate", handlePopState);
    return () => {
      cancelled = true;
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    if (!session || !["driver", "parent"].includes(session.role) || screen !== "My Portal" || !portalData) {
      return undefined;
    }
    const previousSnapshot = {
      lastSeenSessionAt: appSettings.portalLastSeenSessionAt || "",
      lastSeenReportAt: appSettings.portalLastSeenReportAt || "",
    };
    setPortalSeenSnapshot(previousSnapshot);
    const latestSessionAt = session.role === "parent"
      ? (portalData.drivers || []).flatMap((item) => item.sessions || []).map((item) => item.created_at).sort().slice(-1)[0] || ""
      : portalData.sessions?.[0]?.created_at || "";
    const latestReportAt = session.role === "parent"
      ? (portalData.drivers || []).flatMap((item) => item.reports || []).map((item) => item.created_at).sort().slice(-1)[0] || ""
      : portalData.reports?.[0]?.created_at || "";
    const timer = setTimeout(() => {
      setAppSettings((current) => {
        if (
          (current.portalLastSeenSessionAt || "") === latestSessionAt
          && (current.portalLastSeenReportAt || "") === latestReportAt
        ) {
          return current;
        }
        return {
          ...current,
          portalLastSeenSessionAt: latestSessionAt,
          portalLastSeenReportAt: latestReportAt,
        };
      });
    }, 2500);
    return () => clearTimeout(timer);
  }, [session, screen, portalData]);

  useEffect(() => {
    if (typeof window === "undefined" || !historyReadyRef.current) {
      return;
    }
    const snapshot = buildAppStateSnapshot({
      session,
      screen,
      selectedSessionId,
      selectedPlannerEventId,
      selectedDriverTimelineId,
      testSessionId: formState.testSessionId,
    });
    const serialised = JSON.stringify(snapshot);
    window.localStorage.setItem(APP_STATE_STORAGE_KEY, serialised);
    if (serialised === lastHistorySnapshotRef.current) {
      return;
    }
    if (suppressHistoryPushRef.current) {
      suppressHistoryPushRef.current = false;
      window.history.replaceState({ derAppState: snapshot }, "", getPathForState(snapshot));
    } else {
      window.history.pushState({ derAppState: snapshot }, "", getPathForState(snapshot));
    }
    lastHistorySnapshotRef.current = serialised;
  }, [session, screen, selectedSessionId, selectedPlannerEventId, selectedDriverTimelineId, formState.testSessionId]);

  useEffect(() => {
    setFormState((current) => ({
      ...current,
      audience: appSettings.defaultAudience || current.audience,
      sessionType: current.testSessionId ? current.sessionType : (appSettings.defaultSessionType || current.sessionType),
      eventName: current.eventName || appSettings.defaultTrackName || "",
      eventRound: current.eventRound || appSettings.defaultEventRoundPrefix || ""
    }));
  }, [appSettings.defaultAudience, appSettings.defaultSessionType, appSettings.defaultTrackName, appSettings.defaultEventRoundPrefix]);

  async function hydrateDashboard() {
    try {
      const [driversData, eventsData, accessLevelsData, classesData, tracksData, setupDatabaseData, sessionsData, testSessionsData, reportsData, userAccountsData, aiStatus, emailSettingsData, authAuditData, emailDeliveryData, backupData, restoreData, operationsData, reportData] = await Promise.all([
        listDrivers().catch(() => ({ drivers: [] })),
        listEvents().catch(() => ({ events: [] })),
        listAccessLevels().catch(() => ({ access_levels: [] })),
        listKartClasses().catch(() => ({ classes: [] })),
        listTracks().catch(() => ({ tracks: [] })),
        listSetupDatabase().catch(() => ({ setup_database: { tracks: [], entries: [], total_tracks: 0, total_entries: 0 } })),
        listSessions().catch(() => ({ sessions: [] })),
        listTestSessions().catch(() => ({ test_sessions: [] })),
        listReports().catch(() => ({ reports: [] })),
        listUserAccounts().catch(() => ({ user_accounts: [] })),
        aiHealth().catch(() => ({ ollama: { reachable: false, models: [] }, openai: { configured: false, reachable: false, models: [] } })),
        getEmailSettings().catch(() => ({ settings: {} })),
        listAuthAudit(80).catch(() => ({ entries: [] })),
        listEmailDelivery(40).catch(() => ({ deliveries: [] })),
        listBackups().catch(() => ({ backups: [] })),
        getRestoreGuidance().catch(() => null),
        getOperationsHealth(buildSettingsScope(session)).catch(() => null),
        reportEngineHealth().catch(() => ({ ok: false, error: "Report engine unavailable" }))
      ]);
      setDriversStore(driversData.drivers || []);
      setEventsStore(eventsData.events || []);
      setAccessLevelsStore(accessLevelsData.access_levels || []);
      setClassesStore(classesData.classes || []);
      setTracksStore(tracksData?.tracks || []);
      setSetupDatabaseStore(setupDatabaseData?.setup_database || { tracks: [], entries: [], total_tracks: 0, total_entries: 0 });
      setSessionsStore(sessionsData?.sessions || []);
      setTestSessionsStore(testSessionsData?.test_sessions || []);
      setReportsStore(reportsData?.reports || []);
      setUserAccountsStore(userAccountsData.user_accounts || []);
      setEmailSettings({ ...DEFAULT_EMAIL_SETTINGS, ...(emailSettingsData.settings || {}) });
      setAuthAuditEntries(authAuditData.entries || []);
      setEmailDeliveryLog(emailDeliveryData.deliveries || []);
      setBackupEntries(backupData.backups || []);
      setRestoreGuidance(restoreData);
      setOperationsHealth(operationsData);
      setReportHealth(reportData);
      const nextOllamaStatus = aiStatus.ollama || { reachable: false, models: [] };
      const nextOpenAiStatus = aiStatus.openai || { configured: false, reachable: false, models: [] };
      setOllamaStatus(nextOllamaStatus);
      setOpenAiStatus(nextOpenAiStatus);
      if (nextOllamaStatus.models?.length) {
        setFormState((current) => ({
          ...current,
          model: current.model && nextOllamaStatus.models.includes(current.model)
            ? current.model
            : nextOllamaStatus.models[0]
        }));
      }
    } catch {
      // Leave the page usable even if some background calls fail.
    }
  }

  useEffect(() => {
    if (!session || !settingsReady) {
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        setSettingsSaving(true);
        await updateAppSettings({
          user_account_id: session.user_account_id || "",
          email: session.email || "",
          role: session.role || "",
          settings: {
            ...appSettings,
            mapsApiKey,
            aiModel: appSettings.aiProvider === "ollama" ? formState.model : appSettings.aiModel,
            openAiModel: appSettings.aiProvider === "openai" ? formState.model : appSettings.openAiModel,
          }
        });
      } catch {
        // Leave the app usable if settings persistence fails.
      } finally {
        setSettingsSaving(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [session, settingsReady, appSettings, mapsApiKey, formState.model]);

  async function loadSettingsForSession(nextSession) {
    if (!nextSession) {
      setAppSettings(DEFAULT_APP_SETTINGS);
      setMapsApiKey(DEFAULT_APP_SETTINGS.mapsApiKey);
      setSettingsReady(false);
      return DEFAULT_APP_SETTINGS;
    }
    try {
      const data = await getAppSettings({
        user_account_id: nextSession.user_account_id || "",
        email: nextSession.email || "",
        role: nextSession.role || ""
      });
      const merged = {
        ...DEFAULT_APP_SETTINGS,
        ...(data.settings || {})
      };
      setAppSettings(merged);
      setMapsApiKey(merged.mapsApiKey || "");
      setFormState((current) => ({
        ...current,
        audience: merged.defaultAudience || current.audience,
        sessionType: merged.defaultSessionType || current.sessionType,
        eventName: merged.defaultTrackName || current.eventName,
        eventRound: merged.defaultEventRoundPrefix || current.eventRound,
        model: (merged.aiProvider === "openai" ? merged.openAiModel : merged.aiModel) || current.model
      }));
      await refreshAiProviderStatus(nextSession);
      setSettingsReady(true);
      return merged;
    } catch {
      setAppSettings(DEFAULT_APP_SETTINGS);
      setMapsApiKey(DEFAULT_APP_SETTINGS.mapsApiKey);
      setFormState((current) => ({
        ...current,
        audience: DEFAULT_APP_SETTINGS.defaultAudience,
        sessionType: DEFAULT_APP_SETTINGS.defaultSessionType,
        eventName: DEFAULT_APP_SETTINGS.defaultTrackName,
        eventRound: DEFAULT_APP_SETTINGS.defaultEventRoundPrefix,
        model: DEFAULT_APP_SETTINGS.aiModel
      }));
      await refreshAiProviderStatus(nextSession);
      setSettingsReady(true);
      return DEFAULT_APP_SETTINGS;
    }
  }

  async function refreshAiProviderStatus(nextSession = session) {
    const scope = buildSettingsScope(nextSession);
    try {
      const status = await aiHealth(scope);
      const nextOllamaStatus = status.ollama || { reachable: false, models: [] };
      setOllamaStatus(nextOllamaStatus);
      setOpenAiStatus(status.openai || { configured: false, reachable: false, models: [] });
      if ((nextOllamaStatus.models || []).length && appSettings.aiProvider !== "openai") {
        setFormState((current) => ({
          ...current,
          model: current.model && nextOllamaStatus.models.includes(current.model) ? current.model : nextOllamaStatus.models[0],
        }));
      }
    } catch {
      setOpenAiStatus({ configured: Boolean(appSettings.openAiApiKeyConfigured), reachable: false, models: [] });
    }
  }

  useEffect(() => {
    if (!session || ["driver", "parent"].includes(session.role)) {
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const [memoryData, chatHistory] = await Promise.all([
          listAiMemory({
            user_account_id: session.user_account_id || "",
            email: session.email || "",
            role: session.role || "",
          }).catch(() => ({ memories: [] })),
          listAiChatHistory({
            user_account_id: session.user_account_id || "",
            email: session.email || "",
            role: session.role || "",
          }).catch(() => ({ messages: [] })),
        ]);
        if (cancelled) return;
        setAiMemoryEntries(memoryData.memories || []);
        if ((chatHistory.messages || []).length) {
          setChatMessages(chatHistory.messages);
        }
      } catch {
        // Keep AI screens usable if memory or chat history loading fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const drivers = analysis?.drivers || [];
  const currentTrack = useMemo(() => findTrackByName(tracksStore, formState.eventName), [tracksStore, formState.eventName]);
  const selectedTestSession = useMemo(
    () => testSessionsStore.find((item) => item.id === formState.testSessionId) || null,
    [testSessionsStore, formState.testSessionId]
  );
  const selectedEventLabel = useMemo(() => {
    return [formState.eventName, formState.eventRound, formState.sessionType].filter(Boolean).join(" / ");
  }, [formState]);
  const navGroups = session && ["driver", "parent"].includes(session.role) ? PORTAL_NAV_GROUPS : ADMIN_NAV_GROUPS;
  const screenMeta = SCREEN_META[screen] || {
    eyebrow: "Workspace",
    title: screen,
    subtitle: "Manage the current area of the coaching platform."
  };
  const portalHistorySessions = useMemo(() => {
    if (!portalData) return [];
    if (portalData.portal_type === "parent") {
      return (portalData.drivers || []).flatMap((item) => item.sessions || []);
    }
    return portalData.sessions || [];
  }, [portalData]);
  const homeStats = useMemo(() => {
      const totalPlannedSessions = eventsStore.reduce((total, eventItem) => total + (eventItem.sessions?.length || 0), 0);
      const uploadReadySessions = testSessionsStore.filter((item) => !item.uploaded_session_id).length;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isImportedTelemetryEvent = (eventItem) => {
        const searchable = [eventItem?.name, eventItem?.session_type]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchable.includes("imported telemetry");
      };
      const getEventStart = (eventItem) => {
        const rawDate = eventItem?.start_date || eventItem?.date || eventItem?.end_date;
        if (!rawDate) return null;
        const parsed = new Date(`${rawDate}T00:00:00`);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      };
      const nextEvent = [...eventsStore]
        .filter((item) => !isImportedTelemetryEvent(item))
        .map((item) => ({ item, start: getEventStart(item) }))
        .filter(({ start }) => start && start >= today)
        .sort((left, right) => left.start.getTime() - right.start.getTime())[0]?.item || null;
      const latestUpload = [...sessionsStore]
        .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")))[0] || null;
      const latestReport = [...reportsStore]
        .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")))[0] || null;
  
      return {
        totalPlannedSessions,
        uploadReadySessions,
        nextEvent,
        latestUpload,
        latestReport
      };
    }, [eventsStore, testSessionsStore, sessionsStore, reportsStore]);
  const adminHeaderBadges = useMemo(() => {
    const badges = [];

    if (screen === "Home") {
      badges.push({ label: `${eventsStore.length} events`, tone: "default" });
      badges.push({ label: `${homeStats.totalPlannedSessions} planned sessions`, tone: "neutral" });
    } else if (screen === "Upload Session") {
      if (selectedEventLabel) {
        badges.push({ label: selectedEventLabel, tone: "default" });
      }
      badges.push({ label: `${formState.audience} audience`, tone: "neutral" });
    } else if (screen === "History") {
      badges.push({ label: `${sessionsStore.length} saved sessions`, tone: "default" });
      if (selectedSessionDetail?.session?.event_round) {
        badges.push({ label: selectedSessionDetail.session.event_round, tone: "neutral" });
      }
    } else if (screen === "Reports") {
      badges.push({ label: `${reportsStore.length} stored reports`, tone: "default" });
      if (reports?.reports?.length) {
        badges.push({ label: `${reports.reports.length} active report${reports.reports.length === 1 ? "" : "s"}`, tone: "neutral" });
      } else if (analysis?.event_round) {
        badges.push({ label: analysis.event_round, tone: "neutral" });
      }
    } else if (["Driver Profiles", "Driver Accounts"].includes(screen)) {
      badges.push({ label: `${driversStore.length} driver profiles`, tone: "default" });
      badges.push({ label: `${userAccountsStore.filter((account) => account.role === "driver").length} driver accounts`, tone: "neutral" });
    } else if (["Parent Management", "Administrator Management"].includes(screen)) {
      badges.push({ label: `${userAccountsStore.length} accounts`, tone: "default" });
      badges.push({ label: `${accessLevelsStore.length} access levels`, tone: "neutral" });
    } else if (["Create Event", "View Upcoming Events", "View Past Events", "Calendar"].includes(screen)) {
      badges.push({ label: `${eventsStore.length} saved events`, tone: "default" });
      badges.push({ label: `${testSessionsStore.length} planned test sessions`, tone: "neutral" });
    } else if (screen === "Event Sessions") {
      const selectedEvent = eventsStore.find((item) => item.id === selectedPlannerEventId) || null;
      badges.push({ label: `${selectedEvent?.sessions?.length || 0} sessions`, tone: "default" });
      if (selectedEvent?.name) {
        badges.push({ label: selectedEvent.name, tone: "neutral" });
      }
    } else if (screen === "Create Session") {
      const selectedEvent = eventsStore.find((item) => item.id === (testSessionDraft.event_id || selectedPlannerEventId)) || null;
      badges.push({ label: editingTestSessionId ? "Editing session" : "New session", tone: "default" });
      if (selectedEvent?.name) {
        badges.push({ label: selectedEvent.name, tone: "neutral" });
      }
    } else if (screen === "Tracks") {
      badges.push({ label: `${tracksStore.length} tracks`, tone: "default" });
      if (currentTrack?.name) {
        badges.push({ label: currentTrack.name, tone: "neutral" });
      }
    } else if (screen === "Setup Database") {
      badges.push({ label: `${setupDatabaseStore.total_tracks || 0} tracks`, tone: "default" });
      badges.push({ label: `${setupDatabaseStore.total_entries || 0} saved setups`, tone: "neutral" });
    } else if (screen === "General Settings") {
      badges.push({ label: normalizeScreenName(appSettings.defaultLandingScreen || "Home"), tone: "default" });
      badges.push({ label: appSettings.defaultAudience || "coach", tone: "neutral" });
    } else if (screen === "AI Settings") {
      badges.push({ label: `${appSettings.aiProvider === "openai" ? "OpenAI" : "Ollama"} provider`, tone: "default" });
      if (formState.model) {
        badges.push({ label: formState.model, tone: "neutral" });
      }
      badges.push({ label: appSettings.aiMemoryEnabled ? "Memory on" : "Memory off", tone: "neutral" });
    } else if (screen === "Email Settings") {
      badges.push({ label: emailSettings.smtpHost || "SMTP not configured", tone: "default" });
      badges.push({ label: emailSettings.fromEmail || "No sender email", tone: "neutral" });
    }

    badges.push({
      label: appSettings.aiProvider === "openai"
        ? (openAiStatus.reachable ? "OpenAI ready" : openAiStatus.configured ? "OpenAI unreachable" : "OpenAI not configured")
        : (ollamaStatus.reachable ? "Ollama ready" : "Ollama offline"),
      tone: (appSettings.aiProvider === "openai" ? openAiStatus.reachable : ollamaStatus.reachable) ? "default" : "warn"
    });
    return badges;
  }, [
    screen,
    selectedEventLabel,
    formState.audience,
    sessionsStore.length,
    selectedSessionDetail,
    reportsStore.length,
    reports,
    analysis,
    driversStore.length,
    userAccountsStore.length,
    accessLevelsStore.length,
    eventsStore.length,
    testSessionsStore.length,
    homeStats.totalPlannedSessions,
    tracksStore.length,
    setupDatabaseStore.total_tracks,
    setupDatabaseStore.total_entries,
    currentTrack,
    appSettings.defaultLandingScreen,
    appSettings.defaultAudience,
    appSettings.aiProvider,
    appSettings.aiMemoryEnabled,
    ollamaStatus.reachable,
    ollamaStatus.models,
    openAiStatus.reachable,
    openAiStatus.configured,
    formState.model,
    emailSettings.smtpHost,
    emailSettings.fromEmail
  ]);

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setAuthNotice("");
    setLoading(true);
    try {
      const data = await login(credentials);
      if (data.must_change_password) {
        setPendingPasswordChange({
          email: credentials.email,
          current_password: credentials.password,
          password: "",
          confirmPassword: ""
        });
        setAuthMode("password-change");
        setAuthNotice("Your account has been approved with a temporary password. Please set a new password to continue.");
        return;
      }
      const loadedSettings = await loadSettingsForSession(data);
      setSession(data);
      if (["driver", "parent"].includes(data.role)) {
        const portal = data.user_account_id ? await getUserAccountPortal(data.user_account_id) : await getDriverPortal(data.driver_id);
        setPortalData(portal);
        const firstSession = loadedSettings.autoOpenLatestPortalSession
          ? portal.portal_type === "parent"
            ? (portal.drivers || []).flatMap((item) => item.sessions || [])[0]
            : portal.sessions?.[0]
          : null;
        if (loadedSettings.autoOpenLatestPortalSession && firstSession?.id) {
          await loadSessionDetail(firstSession.id);
        }
        setScreen("My Portal");
      } else {
        setScreen(normalizeScreenName(loadedSettings.defaultLandingScreen || "Home"));
      }
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordResetRequest(event) {
    event.preventDefault();
    setError("");
    setAuthNotice("");
    setLoading(true);
    try {
      const response = await requestPasswordReset({ email: resetRequest.email });
      setAuthNotice(response.message);
      setAuthMode("reset-confirm");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordResetConfirm(event) {
    event.preventDefault();
    setError("");
    setAuthNotice("");
    if (resetConfirm.password !== resetConfirm.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const response = await confirmPasswordReset({
        token: resetConfirm.token,
        password: resetConfirm.password
      });
      setAuthNotice(response.message);
      setCredentials((current) => ({
        ...current,
        email: resetRequest.email || current.email,
        password: ""
      }));
      setResetConfirm(EMPTY_RESET_CONFIRM);
      setAuthMode("login");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegistration(event) {
    event.preventDefault();
    setError("");
    setAuthNotice("");
    setLoading(true);
    try {
      const payload = {
        name: registerDraft.name,
        email: registerDraft.email,
        role: registerDraft.role,
        linked_driver_id: registerDraft.role === "driver" ? registerDraft.linked_driver_id : "",
        assigned_driver_ids: registerDraft.role === "parent" ? registerDraft.assigned_driver_ids : []
      };
      const response = await register(payload);
      setAuthNotice(response.message);
      setRegisterDraft(EMPTY_REGISTER);
      await hydrateDashboard();
      setAuthMode("login");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordChange(event) {
    event.preventDefault();
    setError("");
    setAuthNotice("");
    if (pendingPasswordChange.password !== pendingPasswordChange.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const response = await changePassword({
        email: pendingPasswordChange.email,
        current_password: pendingPasswordChange.current_password,
        password: pendingPasswordChange.password
      });
      setAuthNotice(response.message);
      setCredentials({ email: pendingPasswordChange.email, password: pendingPasswordChange.password });
      setPendingPasswordChange(EMPTY_PASSWORD_CHANGE);
      setAuthMode("login");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(assignments) {
    const formData = buildUploadFormData(assignments, formState);
    if (!formData) return;
    setLoading(true);
    setError("");
    try {
      const data = await uploadSessions(formData);
      setAnalysis(data);
      setReports(null);
      const latestSessions = await listSessions().catch(() => ({ sessions: [] }));
      setSessionsStore(latestSessions.sessions || []);
      if (data.session_id) {
        setSelectedSessionId(data.session_id);
        await loadSessionDetail(data.session_id);
      }
      setScreen("Upload Session");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateFeedback() {
    if (!analysis) {
      setError("No analysed session is loaded yet.");
      return;
    }
    setLoading(true);
    setError("");
    setReportNotice(`Generating ${formState.audience} report...`);
    try {
      const data = await generateFeedback({
        audience: formState.audience,
        provider: appSettings.aiProvider,
        model: formState.model,
        api_key: appSettings.aiProvider === "openai" ? appSettings.openAiApiKey : null,
        analysis,
        user_account_id: session?.user_account_id || "",
        email: session?.email || "",
        role: session?.role || "",
        test_session_id: formState.testSessionId || "",
        use_retrieval: appSettings.aiRetrievalEnabled,
        use_memory: appSettings.aiMemoryEnabled,
      });
      setReports(data);
      const latestReports = await listReports().catch(() => ({ reports: [] }));
      setReportsStore(latestReports.reports || []);
      const latestSessions = await listSessions().catch(() => ({ sessions: [] }));
      setSessionsStore(latestSessions.sessions || []);
      if (analysis?.session_id) {
        await loadSessionDetail(analysis.session_id);
      }
      setReportNotice(`${formState.audience.charAt(0).toUpperCase()}${formState.audience.slice(1)} report generated and saved.`);
      setScreen("Reports");
    } catch (nextError) {
      setReportNotice("");
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExportPdf() {
    const sessionId = selectedSessionDetail?.session?.id;
    if (!sessionId) return;
    setLoading(true);
    setError("");
    try {
      const blob = await exportPdf({
        sessionId,
        audience: formState.audience,
        fileName: `${slugify(selectedSessionDetail?.session?.event_round || formState.eventRound || "session-report")}.pdf`,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${slugify(selectedSessionDetail?.session?.event_round || formState.eventRound || "session-report")}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDriverSubmit(event) {
    event.preventDefault();
    setError("");
    const payload = buildDriverPayload(driverDraft);
    try {
      if (editingDriverId) {
        const updated = await updateDriver(editingDriverId, payload);
        setDriversStore((current) => current.map((driver) => (driver.id === editingDriverId ? updated : driver)));
      } else {
        const created = await createDriver(payload);
        setDriversStore((current) => [...current, created]);
      }
      setDriverDraft(EMPTY_DRIVER);
      setEditingDriverId(null);
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function handleEventSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      if (editingEventId) {
        const updated = await updateEvent(editingEventId, eventDraft);
        setEventsStore((current) => current.map((item) => (item.id === editingEventId ? updated : item)));
      } else {
        const created = await createEvent(eventDraft);
        setEventsStore((current) => [...current, created]);
      }
      setEventDraft({
        ...EMPTY_EVENT,
        venue: appSettings.defaultTrackName || "",
        name: appSettings.defaultEventRoundPrefix || "",
        session_type: appSettings.defaultSessionType || ""
      });
      setEditingEventId(null);
      if (appSettings.autoReturnToUpcomingEvents) {
        setScreen("View Upcoming Events");
      }
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function handleTestSessionSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = {
        ...testSessionDraft,
        status: testSessionDraft.status || "planned",
        start_time: testSessionDraft.start_time || "",
        end_time: testSessionDraft.end_time || "",
        weather: testSessionDraft.weather || "",
        track_condition: testSessionDraft.track_condition || "",
        tyre_condition: testSessionDraft.tyre_condition || "",
        mechanic_notes: testSessionDraft.mechanic_notes || "",
        coach_notes: testSessionDraft.coach_notes || "",
        driver_setups: Object.fromEntries(
          Object.entries(testSessionDraft.driver_setups || {}).map(([driverId, setup]) => [
            driverId,
            serializeDriverSetup(setup),
          ]),
        ),
      };
      let savedSession = null;
      if (editingTestSessionId) {
        savedSession = await updateTestSession(editingTestSessionId, payload);
      } else {
        savedSession = await createTestSession(payload);
      }
      if (savedSession?.id && payload.venue && payload.date) {
        try {
          await refreshTestSessionWeather(savedSession.id);
        } catch {
          setError("Session saved, but the forecast could not be refreshed.");
        }
      }
      const [eventsData, testSessionsData] = await Promise.all([
        listEvents(),
        listTestSessions(),
      ]);
      setEventsStore(eventsData.events);
      setTestSessionsStore(testSessionsData.test_sessions);
      await refreshSetupDatabaseStore();
      setTestSessionDraft(EMPTY_TEST_SESSION);
      setEditingTestSessionId(null);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteDriver(driverId) {
    setError("");
    try {
      await deleteDriver(driverId);
      setDriversStore((current) => current.filter((driver) => driver.id !== driverId));
      if (editingDriverId === driverId) {
        setEditingDriverId(null);
        setDriverDraft(EMPTY_DRIVER);
      }
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function handleDeleteEvent(eventId) {
    setError("");
    try {
      await deleteEvent(eventId);
      setEventsStore((current) => current.filter((item) => item.id !== eventId));
      if (editingEventId === eventId) {
        setEditingEventId(null);
        setEventDraft(EMPTY_EVENT);
      }
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function handleDeleteTestSession(testSessionId) {
    setError("");
    const sessionRecord = testSessionsStore.find((item) => item.id === testSessionId);
    const confirmed = window.confirm(`Delete the planned session "${sessionRecord?.name || "session"}"?`);
    if (!confirmed) return;
    try {
      await deleteTestSession(testSessionId);
      const [eventsData, testSessionsData] = await Promise.all([
        listEvents(),
        listTestSessions(),
      ]);
      setEventsStore(eventsData.events);
      setTestSessionsStore(testSessionsData.test_sessions);
      await refreshSetupDatabaseStore();
      if (editingTestSessionId === testSessionId) {
        setEditingTestSessionId(null);
        const eventItem = eventsData.events.find((item) => item.id === selectedPlannerEventId) || null;
        setTestSessionDraft({
          ...EMPTY_TEST_SESSION,
          event_id: selectedPlannerEventId || "",
          venue: eventItem?.venue || ""
        });
      }
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function handleSavePlannedSessionUpdate(testSessionId, updates = {}) {
    setError("");
    setLoading(true);
    try {
      const currentSession = testSessionsStore.find((item) => item.id === testSessionId);
      if (!currentSession) {
        throw new Error("Planned session not found");
      }
      const nextDriverSetups = updates.driver_setups || updates.driverSetups || Object.fromEntries(
        (currentSession.drivers || []).map((driver) => [driver.id, normalizeDriverSetup(driver.setup)])
      );
      const payload = {
        name: updates.name ?? currentSession.name ?? "",
        venue: updates.venue ?? currentSession.venue ?? "",
        session_type: updates.session_type ?? currentSession.session_type ?? "Test Session",
        date: updates.date ?? currentSession.date ?? "",
        start_time: updates.start_time ?? currentSession.start_time ?? "",
        end_time: updates.end_time ?? currentSession.end_time ?? "",
        event_id: updates.event_id ?? currentSession.event_id ?? "",
        status: updates.status ?? currentSession.status ?? "planned",
        weather: updates.weather ?? currentSession.weather ?? "",
        track_condition: updates.track_condition ?? currentSession.track_condition ?? "",
        tyre_condition: updates.tyre_condition ?? currentSession.tyre_condition ?? "",
        mechanic_notes: updates.mechanic_notes ?? currentSession.mechanic_notes ?? "",
        coach_notes: updates.coach_notes ?? currentSession.coach_notes ?? "",
        driver_ids: updates.driver_ids ?? (currentSession.drivers || []).map((driver) => driver.id),
        driver_setups: Object.fromEntries(
          Object.entries(nextDriverSetups || {}).map(([driverId, setup]) => [
            driverId,
            serializeDriverSetup(setup),
          ]),
        ),
      };
      await updateTestSession(testSessionId, payload);
      const shouldRefreshWeather =
        Boolean(payload.venue && payload.date) &&
        (
          payload.venue !== (currentSession.venue || "")
          || payload.date !== (currentSession.date || "")
          || payload.start_time !== (currentSession.start_time || "")
          || payload.end_time !== (currentSession.end_time || "")
        );
      if (shouldRefreshWeather) {
        try {
          await refreshTestSessionWeather(testSessionId);
        } catch {
          setError("Session saved, but the forecast could not be refreshed.");
        }
      }
      const [eventsData, testSessionsData] = await Promise.all([
        listEvents(),
        listTestSessions(),
      ]);
      setEventsStore(eventsData.events);
      setTestSessionsStore(testSessionsData.test_sessions);
      await refreshSetupDatabaseStore();
    } catch (nextError) {
      setError(nextError.message);
      throw nextError;
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePlannedSessionSetup(testSessionId, driverSetups) {
    return handleSavePlannedSessionUpdate(testSessionId, { driverSetups });
  }

  async function handleRefreshPlannedSessionWeather(testSessionId) {
    setError("");
    setLoading(true);
    try {
      await refreshTestSessionWeather(testSessionId);
      const [eventsData, testSessionsData] = await Promise.all([
        listEvents(),
        listTestSessions(),
      ]);
      setEventsStore(eventsData.events);
      setTestSessionsStore(testSessionsData.test_sessions);
      await refreshSetupDatabaseStore();
    } catch (nextError) {
      setError(nextError.message);
      throw nextError;
    } finally {
      setLoading(false);
    }
  }

  async function handleRefreshEventWeather(eventId) {
    setError("");
    setLoading(true);
    try {
      const eventItem = eventsStore.find((item) => item.id === eventId);
      const sessionIds = (eventItem?.sessions || [])
        .filter((item) => item?.date && item?.venue)
        .map((item) => item.id);
      await Promise.allSettled(sessionIds.map((id) => refreshTestSessionWeather(id)));
      const [eventsData, testSessionsData] = await Promise.all([
        listEvents(),
        listTestSessions(),
      ]);
      setEventsStore(eventsData.events);
      setTestSessionsStore(testSessionsData.test_sessions);
      await refreshSetupDatabaseStore();
    } catch (nextError) {
      setError(nextError.message);
      throw nextError;
    } finally {
      setLoading(false);
    }
  }

  async function handleAccessLevelSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      if (editingAccessLevelId) {
        const updated = await updateAccessLevel(editingAccessLevelId, accessLevelDraft);
        setAccessLevelsStore((current) => current.map((item) => (item.id === editingAccessLevelId ? updated : item)));
      } else {
        const created = await createAccessLevel(accessLevelDraft);
        setAccessLevelsStore((current) => [...current, created]);
      }
      setAccessLevelDraft(EMPTY_ACCESS_LEVEL);
      setEditingAccessLevelId(null);
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function handleUserAccountSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      if (editingUserAccountId) {
        await updateUserAccount(editingUserAccountId, userAccountDraft);
      } else {
        await createUserAccount(userAccountDraft);
      }
      const refreshedAccounts = await listUserAccounts();
      setUserAccountsStore(refreshedAccounts.user_accounts || []);
      setUserAccountDraft(createEmptyAccountDraftForScreen(screen, EMPTY_ACCOUNT));
      setEditingUserAccountId(null);
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function handleDeleteUserAccount(accountId) {
    setError("");
    try {
      await deleteUserAccount(accountId);
      const refreshedAccounts = await listUserAccounts();
      setUserAccountsStore(refreshedAccounts.user_accounts || []);
      if (editingUserAccountId === accountId) {
        setEditingUserAccountId(null);
        setUserAccountDraft(createEmptyAccountDraftForScreen(screen, EMPTY_ACCOUNT));
      }
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function handleApproveUserAccount(accountId) {
    setError("");
    try {
      await approveUserAccount(accountId, { actor_email: session?.email || "" });
      const [refreshedAccounts, auditData, emailData, operationsData] = await Promise.all([
        listUserAccounts(),
        listAuthAudit(80).catch(() => ({ entries: [] })),
        listEmailDelivery(40).catch(() => ({ deliveries: [] })),
        getOperationsHealth(buildSettingsScope(session)).catch(() => null),
      ]);
      setUserAccountsStore(refreshedAccounts.user_accounts || []);
      setAuthAuditEntries(auditData.entries || []);
      setEmailDeliveryLog(emailData.deliveries || []);
      setOperationsHealth(operationsData);
      setAuthNotice("Account approved and temporary password emailed.");
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function handleRejectUserAccount(accountId) {
    setError("");
    try {
      await rejectUserAccount(accountId, { actor_email: session?.email || "" });
      const [refreshedAccounts, auditData] = await Promise.all([
        listUserAccounts(),
        listAuthAudit(80).catch(() => ({ entries: [] })),
      ]);
      setUserAccountsStore(refreshedAccounts.user_accounts || []);
      setAuthAuditEntries(auditData.entries || []);
      setAuthNotice("Account registration rejected.");
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function handleResendApprovalEmail(accountId) {
    setError("");
    try {
      await resendApprovalEmail(accountId, { actor_email: session?.email || "" });
      const [refreshedAccounts, auditData, emailData, operationsData] = await Promise.all([
        listUserAccounts(),
        listAuthAudit(80).catch(() => ({ entries: [] })),
        listEmailDelivery(40).catch(() => ({ deliveries: [] })),
        getOperationsHealth(buildSettingsScope(session)).catch(() => null),
      ]);
      setUserAccountsStore(refreshedAccounts.user_accounts || []);
      setAuthAuditEntries(auditData.entries || []);
      setEmailDeliveryLog(emailData.deliveries || []);
      setOperationsHealth(operationsData);
      setAuthNotice("Approval email resent with a new temporary password.");
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function handleManualApproveUserAccount(accountId) {
    setError("");
    try {
      const response = await approveUserAccountManual(accountId, { actor_email: session?.email || "" });
      const [refreshedAccounts, auditData] = await Promise.all([
        listUserAccounts(),
        listAuthAudit(80).catch(() => ({ entries: [] })),
      ]);
      setUserAccountsStore(refreshedAccounts.user_accounts || []);
      setAuthAuditEntries(auditData.entries || []);
      setAuthNotice(`${response.message} Temporary password: ${response.temporary_password}`);
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function handleChatSubmit(event) {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message) return;
    const nextMessages = [...chatMessages, { role: "user", content: message }];
    setChatMessages(nextMessages);
    setChatInput("");
    setLoading(true);
    setError("");
    try {
      const data = await chatWithAi({
        provider: appSettings.aiProvider,
        model: formState.model,
        api_key: appSettings.aiProvider === "openai" ? appSettings.openAiApiKey : null,
        messages: nextMessages.map((item) => ({ role: item.role, content: item.content })),
        user_account_id: session?.user_account_id || "",
        email: session?.email || "",
        role: session?.role || "",
        session_id: selectedSessionId || "",
        test_session_id: formState.testSessionId || "",
        use_retrieval: appSettings.aiRetrievalEnabled,
        use_memory: appSettings.aiMemoryEnabled,
      });
      setChatMessages((current) => [...current, { role: "assistant", content: data.reply }]);
    } catch (nextError) {
      setError(nextError.message);
      setChatMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `I couldn't reply just now: ${nextError.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateMemory(event) {
    event.preventDefault();
    if (!session || !aiMemoryDraft.content.trim()) return;
    setLoading(true);
    setError("");
    try {
      const memory = await createAiMemory({
        user_account_id: session.user_account_id || "",
        email: session.email || "",
        role: session.role || "",
        title: aiMemoryDraft.title,
        content: aiMemoryDraft.content,
        tags: aiMemoryDraft.tags.split(",").map((item) => item.trim()).filter(Boolean),
        pinned: false,
      });
      setAiMemoryEntries((current) => [memory, ...current]);
      setAiMemoryDraft(EMPTY_AI_MEMORY);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteMemory(memoryId) {
    setLoading(true);
    setError("");
    try {
      await deleteAiMemory(memoryId);
      setAiMemoryEntries((current) => current.filter((item) => item.id !== memoryId));
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshSetupDatabaseStore() {
    try {
      const data = await listSetupDatabase();
      setSetupDatabaseStore(data?.setup_database || { tracks: [], entries: [], total_tracks: 0, total_entries: 0 });
    } catch {
      // Keep the page usable if a background refresh fails.
    }
  }

  async function handleSetupDatabaseAiAnalysis(prompt, trackName = "") {
    if (!prompt?.trim()) return "";
    const messages = [
      {
        role: "user",
        content: trackName
          ? `Use the setup database to analyse ${trackName}. ${prompt}`
          : prompt,
      },
    ];
    const data = await chatWithAi({
      provider: appSettings.aiProvider,
      model: formState.model,
      api_key: appSettings.aiProvider === "openai" ? appSettings.openAiApiKey : null,
      messages,
      user_account_id: session?.user_account_id || "",
      email: session?.email || "",
      role: session?.role || "",
      session_id: selectedSessionId || "",
      test_session_id: formState.testSessionId || "",
      use_retrieval: appSettings.aiRetrievalEnabled,
      use_memory: appSettings.aiMemoryEnabled,
    });
    return data.reply;
  }

  async function handleTrackUpdate(trackId, payload) {
    setError("");
    try {
      const updated = await updateTrack(trackId, payload);
      setTracksStore((current) => current.map((item) => (item.id === trackId ? updated : item)));
      await refreshSetupDatabaseStore();
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function handleSaveEmailSettings() {
    setError("");
    setAuthNotice("");
    setSettingsSaving(true);
    try {
      const response = await updateEmailSettings({ settings: emailSettings });
      setEmailSettings({ ...DEFAULT_EMAIL_SETTINGS, ...(response.settings || {}) });
      setAuthNotice("Email settings saved.");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleSendTestEmail() {
    setError("");
    setAuthNotice("");
    setSettingsSaving(true);
    try {
      const response = await sendTestEmail({ to_email: emailSettings.testEmail || emailSettings.fromEmail });
      const [emailData, operationsData] = await Promise.all([
        listEmailDelivery(40).catch(() => ({ deliveries: [] })),
        getOperationsHealth(buildSettingsScope(session)).catch(() => null),
      ]);
      setEmailDeliveryLog(emailData.deliveries || []);
      setOperationsHealth(operationsData);
      setAuthNotice(response.message);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleCreateBackup() {
    setError("");
    setAuthNotice("");
    setLoading(true);
    try {
      const backup = await createBackup();
      const backupData = await listBackups().catch(() => ({ backups: [] }));
      setBackupEntries(backupData.backups || []);
      setAuthNotice(`Database backup created: ${backup.file_name}`);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExportOperationsData() {
    setError("");
    setAuthNotice("");
    setLoading(true);
    try {
      const blob = await exportOperationalData();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `der-beta-export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setAuthNotice("Operational export downloaded.");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadDriverTimeline(driverId) {
    if (!driverId) return;
    try {
      const data = await getDriverTimeline(driverId);
      setSelectedDriverTimeline(data);
      setSelectedDriverTimelineId(driverId);
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function loadSessionDetail(sessionId) {
    if (!sessionId) return;
    try {
      const data = await getSessionDetail(sessionId);
      setSelectedSessionId(sessionId);
      setSelectedSessionDetail(data);
      setReportNotice("");
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function handleSaveSessionPreset(payload) {
    if (!selectedSessionDetail?.session?.id) return;
    await createSessionPreset(selectedSessionDetail.session.id, payload);
    await loadSessionDetail(selectedSessionDetail.session.id);
  }

  async function handleDeleteSessionPreset(presetId) {
    if (!selectedSessionDetail?.session?.id) return;
    await deleteSessionPreset(selectedSessionDetail.session.id, presetId);
    await loadSessionDetail(selectedSessionDetail.session.id);
  }

  async function handleSaveCoachingNote(payload) {
    if (!selectedSessionDetail?.session?.id) return;
    await createCoachingNote(selectedSessionDetail.session.id, payload);
    await loadSessionDetail(selectedSessionDetail.session.id);
  }

  async function handleDeleteCoachingNote(noteId) {
    if (!selectedSessionDetail?.session?.id) return;
    await deleteCoachingNote(selectedSessionDetail.session.id, noteId);
    await loadSessionDetail(selectedSessionDetail.session.id);
  }

  async function handleDeleteUploadedSession(sessionRecord) {
    if (!sessionRecord?.id) return;
    const confirmed = window.confirm(`Delete the uploaded session "${sessionRecord.event_round || sessionRecord.name || "session"}"? This will also remove its saved reports, notes, and presets.`);
    if (!confirmed) return;
    setLoading(true);
    setError("");
    try {
      await deleteSession(sessionRecord.id);
      const [sessionsData, reportsData] = await Promise.all([
        listSessions(),
        listReports(),
      ]);
      setSessionsStore(sessionsData.sessions);
      setReportsStore(reportsData.reports || []);
      if (selectedSessionId === sessionRecord.id) {
        setSelectedSessionId(null);
        setSelectedSessionDetail(null);
      }
      setScreen("History");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }

  function startEditDriver(driver) {
    setEditingDriverId(driver.id);
    loadDriverTimeline(driver.id);
    setDriverDraft({
      name: driver.name || "",
      number: driver.number || "",
      class_name: driver.class_name || "",
      aliases_text: (driver.aliases || []).join(", "),
      email: driver.email || "",
      password: ""
    });
    setScreen("Driver Profiles");
  }

  function startEditEvent(item) {
    setSelectedPlannerEventId(item.id);
    setEditingEventId(item.id);
    setEventDraft({
      venue: item.venue || "",
      name: item.name || "",
      session_type: item.session_type || "",
      start_date: item.start_date || item.date || "",
      end_date: item.end_date || item.start_date || item.date || "",
      driver_ids: (item.drivers || []).map((driver) => driver.id)
    });
    setFormState((current) => ({
      ...current,
      eventName: item.venue || current.eventName,
      eventRound: item.name || current.eventRound,
      sessionType: item.session_type || current.sessionType
    }));
    setScreen("Create Event");
  }

  function startEditTestSession(testSession) {
    setSelectedPlannerEventId(testSession.event_id || null);
    setEditingTestSessionId(testSession.id);
    setTestSessionDraft(buildTestSessionEditorDraft(testSession, normalizeDriverSetup));
    setScreen("Create Session");
  }

  function openUploadForTestSession(testSession) {
    setSelectedPlannerEventId(testSession.event_id || null);
    setFormState((current) => buildSessionSelectionFormState(testSession, current));
    setMobileMenuOpen(false);
    setScreen("Upload Session");
  }

  function openPlannedSession(testSession) {
    setSelectedPlannerEventId(testSession.event_id || null);
    setFormState((current) => buildSessionSelectionFormState(testSession, current));
    setMobileMenuOpen(false);
    setScreen("Planned Session");
  }

  function openEventSessions(eventId) {
    const eventItem = eventsStore.find((item) => item.id === eventId) || null;
    setSelectedPlannerEventId(eventId);
    setEditingTestSessionId(null);
    setTestSessionDraft({
      ...EMPTY_TEST_SESSION,
      event_id: eventId || "",
      venue: eventItem?.venue || "",
      date: eventItem?.start_date || eventItem?.date || ""
    });
    setMobileMenuOpen(false);
    setScreen("Event Sessions");
  }

  function openCreateSession(eventId) {
    const eventItem = eventsStore.find((item) => item.id === eventId) || null;
    setSelectedPlannerEventId(eventId);
    setEditingTestSessionId(null);
    setTestSessionDraft({
      ...EMPTY_TEST_SESSION,
      event_id: eventId || "",
      venue: eventItem?.venue || "",
      date: eventItem?.start_date || eventItem?.date || ""
    });
    setMobileMenuOpen(false);
    setScreen("Create Session");
  }

  function openManagementScreen(nextScreen) {
    setEditingDriverId(null);
    setEditingUserAccountId(null);
    setEditingAccessLevelId(null);
    setDriverDraft(EMPTY_DRIVER);
    setUserAccountDraft(createEmptyAccountDraftForScreen(nextScreen));
    setAccessLevelDraft(EMPTY_ACCESS_LEVEL);
    setMobileMenuOpen(false);
    setScreen(nextScreen);
  }

  function isNavItemActive(item, currentScreen) {
    if (typeof item === "string") {
      return item === currentScreen;
    }
    return item.children.some((child) => isNavItemActive(child, currentScreen));
  }

  function handleNavItemSelection(item) {
    if (typeof item !== "string") return;
    if (item.includes("Management") || item === "Driver Profiles" || item === "Driver Accounts") {
      openManagementScreen(item);
      return;
    }
    if (item.includes("Event")) {
      openEventScreen(item);
      return;
    }
    setMobileMenuOpen(false);
    setScreen(item);
  }

  function renderNavItem(item, depth = 0) {
    if (typeof item === "string") {
      return (
        <button
          key={`${depth}-${item}`}
          className={`workspace-nav-btn ${depth ? "workspace-nav-child" : ""} ${screen === item ? "active" : ""}`}
          onClick={() => handleNavItemSelection(item)}
          style={depth > 1 ? { marginLeft: `${(depth - 1) * 14}px` } : undefined}
          type="button"
        >
          {item}
        </button>
      );
    }

    const isExpanded = expandedNavGroups[item.label];
    return (
      <div key={`${depth}-${item.label}`} className="workspace-nav-tree">
        <button
          className={`workspace-nav-btn workspace-nav-parent ${isNavItemActive(item, screen) ? "active" : ""}`}
          onClick={() => setExpandedNavGroups((current) => ({ ...current, [item.label]: !current[item.label] }))}
          style={depth > 0 ? { marginLeft: `${depth * 14}px` } : undefined}
          type="button"
        >
          <span>{item.label}</span>
          <span className={`workspace-nav-caret ${isExpanded ? "expanded" : ""}`}>+</span>
        </button>
        {isExpanded ? (
          <div className="workspace-nav-children">
            {item.children.map((child) => renderNavItem(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  function openEventScreen(nextScreen) {
    if (nextScreen === "Create Event") {
      setEditingEventId(null);
      setEventDraft({
        ...EMPTY_EVENT,
        venue: appSettings.defaultTrackName || "",
        name: appSettings.defaultEventRoundPrefix || "",
        session_type: appSettings.defaultSessionType || ""
      });
    }
    setMobileMenuOpen(false);
    setScreen(nextScreen);
  }

  function handleLogout() {
    setSession(null);
    setMobileMenuOpen(false);
    setScreen("Home");
    setError("");
    setAuthMode("login");
    setAuthNotice("");
    setAnalysis(null);
    setReports(null);
    setPortalData(null);
    setSelectedSessionId(null);
    setSelectedSessionDetail(null);
    setCredentials({ email: "", password: "" });
    setResetRequest(EMPTY_RESET_REQUEST);
    setResetConfirm(EMPTY_RESET_CONFIRM);
    setAppSettings(DEFAULT_APP_SETTINGS);
    setMapsApiKey(DEFAULT_APP_SETTINGS.mapsApiKey);
    setSettingsReady(false);
    setSelectedDriverTimeline(null);
    setSelectedDriverTimelineId(null);
    setFormState({
      eventName: DEFAULT_APP_SETTINGS.defaultTrackName,
      eventRound: DEFAULT_APP_SETTINGS.defaultEventRoundPrefix,
      sessionType: DEFAULT_APP_SETTINGS.defaultSessionType,
      testSessionId: "",
      audience: DEFAULT_APP_SETTINGS.defaultAudience,
      model: DEFAULT_APP_SETTINGS.aiModel,
    });
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(APP_STATE_STORAGE_KEY);
      const snapshot = buildAppStateSnapshot({
        session: null,
        screen: "Home",
        selectedSessionId: null,
        selectedPlannerEventId: null,
        selectedDriverTimelineId: null,
        testSessionId: "",
      });
      const serialised = JSON.stringify(snapshot);
      lastHistorySnapshotRef.current = serialised;
      window.history.replaceState({ derAppState: snapshot }, "", window.location.pathname);
    }
  }

  function startEditAccessLevel(item) {
    setEditingAccessLevelId(item.id);
    setAccessLevelDraft({
      name: item.name || "",
      permissions: {
        view_sessions: Boolean(item.permissions?.view_sessions),
        view_feedback: Boolean(item.permissions?.view_feedback),
        view_history: Boolean(item.permissions?.view_history)
      }
    });
    setScreen("Administrator Management");
  }

  function startEditUserAccount(item) {
    const targetScreen = getManagementScreenForRole(item.role);
    setEditingUserAccountId(item.id);
    setUserAccountDraft({
      name: item.name || "",
      email: item.email || "",
      password: "",
      role: item.role || "driver",
      access_level_id: item.access_level_id || "",
      linked_driver_id: item.linked_driver_id || "",
      status: item.status || "approved",
      must_change_password: Boolean(item.must_change_password),
      assigned_driver_ids: Array.isArray(item.assigned_driver_ids)
        ? item.assigned_driver_ids
        : (item.assigned_drivers || []).map((driver) => driver.id)
    });
    setEditingAccessLevelId(null);
    setMobileMenuOpen(false);
    setScreen(targetScreen);
  }

  if (!session) {
    const registrationRoleOptions = [
      { value: "driver", label: "Driver" },
      { value: "parent", label: "Parent" },
      { value: "manager", label: "Coach" },
    ];

    return (
      <main className="login-stage flex items-center justify-center px-6 py-12">
        <img alt="" className="login-mark login-mark-top" src="/DER_logo_transparent.png" />
        <img alt="" className="login-mark login-mark-bottom" src="/DER_logo_transparent.png" />
        <div className="login-shell grid lg:grid-cols-[1fr_0.78fr]">
          <section className="p-10 lg:p-12">
            <p className="text-xs uppercase tracking-[0.3em] text-blue-300">
              {authMode === "login"
                ? "Sign In"
                : authMode === "register"
                  ? "Request Access"
                  : authMode === "reset-request"
                    ? "Password Reset"
                    : authMode === "password-change"
                      ? "Change Temporary Password"
                      : "Set New Password"}
            </p>
            <h2 className="mt-5 text-4xl font-semibold tracking-tight">
              {authMode === "login"
                ? "Login to DER"
                : authMode === "register"
                  ? "Register for platform access"
                  : authMode === "reset-request"
                  ? "Request a reset token"
                  : authMode === "password-change"
                    ? "Set your permanent password"
                    : "Create a new password"}
            </h2>
            <p className="mt-4 max-w-xl text-sm muted">
              {authMode === "login"
                ? "Use your account details to open the coaching workspace."
                : authMode === "register"
                  ? "Drivers, parents, and coaches can register here. An administrator must approve the account before sign in is allowed."
                  : authMode === "reset-request"
                    ? "Enter the email on the account you want to reset and the system will send a reset email once SMTP is configured."
                    : authMode === "password-change"
                      ? "Your account was approved with a temporary password. Set a new password now to continue into the platform."
                      : "Enter the emailed reset token, choose a new password, and return to sign in."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                className={`workspace-ghost px-4 py-2 text-sm ${authMode === "login" ? "button-is-active" : ""}`}
                type="button"
                onClick={() => {
                  setError("");
                  setAuthNotice("");
                  setAuthMode("login");
                }}
              >
                Sign in
              </button>
              <button
                className={`workspace-ghost px-4 py-2 text-sm ${authMode === "register" ? "button-is-active" : ""}`}
                type="button"
                onClick={() => {
                  setError("");
                  setAuthNotice("");
                  setAuthMode("register");
                }}
              >
                Register
              </button>
            </div>
            {authMode === "login" ? (
              <form className="mt-10 grid gap-6" onSubmit={handleLogin}>
                <label className="grid gap-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="muted">Email Address</span>
                  </div>
                  <input className="login-input" value={credentials.email} onChange={(event) => setCredentials((current) => ({ ...current, email: event.target.value }))} />
                </label>
                <label className="grid gap-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="muted">Password</span>
                    <button
                      className="login-link"
                      type="button"
                      onClick={() => {
                        setError("");
                        setAuthNotice("");
                        setResetRequest({ email: credentials.email || "" });
                        setAuthMode("reset-request");
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input className="login-input" type="password" value={credentials.password} onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))} />
                </label>
                <button className="rounded-xl bg-blue-500 px-4 py-3.5 text-lg font-medium text-white" disabled={loading} type="submit">
                  {loading ? "Signing in..." : "Log In"}
                </button>
              </form>
            ) : null}
            {authMode === "register" ? (
              <form className="mt-10 grid gap-6" onSubmit={handleRegistration}>
                <label className="grid gap-3 text-sm">
                  <span className="muted">Full name</span>
                  <input
                    className="login-input"
                    value={registerDraft.name}
                    onChange={(event) => setRegisterDraft((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
                <label className="grid gap-3 text-sm">
                  <span className="muted">Email Address</span>
                  <input
                    className="login-input"
                    value={registerDraft.email}
                    onChange={(event) => setRegisterDraft((current) => ({ ...current, email: event.target.value }))}
                  />
                </label>
                <label className="grid gap-3 text-sm">
                  <span className="muted">Account type</span>
                  <select
                    className="login-input"
                    value={registerDraft.role}
                    onChange={(event) =>
                      setRegisterDraft((current) => ({
                        ...current,
                        role: event.target.value,
                        linked_driver_id: event.target.value === "driver" ? current.linked_driver_id : "",
                        assigned_driver_ids: event.target.value === "parent" ? current.assigned_driver_ids : [],
                      }))
                    }
                  >
                    {registrationRoleOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                {registerDraft.role === "driver" ? (
                  <label className="grid gap-3 text-sm">
                    <span className="muted">Driver profile</span>
                    <select
                      className="login-input"
                      value={registerDraft.linked_driver_id}
                      onChange={(event) => setRegisterDraft((current) => ({ ...current, linked_driver_id: event.target.value }))}
                    >
                      <option value="">Select your driver profile</option>
                      {driversStore.map((driver) => (
                        <option key={driver.id} value={driver.id}>{driver.name}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {registerDraft.role === "parent" ? (
                  <div className="grid gap-3 text-sm">
                    <span className="muted">Drivers to follow</span>
                    <div className="chip-row">
                      {driversStore.map((driver) => {
                        const selected = (registerDraft.assigned_driver_ids || []).includes(driver.id);
                        return (
                          <label key={driver.id} className={`pill selection-pill ${selected ? "is-selected" : "pill-neutral"} cursor-pointer`}>
                            <input
                              className="hidden"
                              type="checkbox"
                              checked={selected}
                              onChange={(event) => setRegisterDraft((current) => ({
                                ...current,
                                assigned_driver_ids: event.target.checked
                                  ? [...(current.assigned_driver_ids || []), driver.id]
                                  : (current.assigned_driver_ids || []).filter((id) => id !== driver.id),
                              }))}
                            />
                            <span className="selection-pill-marker" aria-hidden="true">OK</span>
                            <span>{driver.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <button className="rounded-xl bg-blue-500 px-4 py-3.5 text-lg font-medium text-white" disabled={loading} type="submit">
                    {loading ? "Submitting..." : "Submit registration"}
                  </button>
                  <button
                    className="workspace-ghost px-4 py-3 text-sm"
                    type="button"
                    onClick={() => {
                      setError("");
                      setAuthNotice("");
                      setAuthMode("login");
                    }}
                  >
                    Back to sign in
                  </button>
                </div>
              </form>
            ) : null}
            {authMode === "reset-request" ? (
              <form className="mt-10 grid gap-6" onSubmit={handlePasswordResetRequest}>
                <label className="grid gap-3 text-sm">
                  <span className="muted">Email Address</span>
                  <input
                    className="login-input"
                    value={resetRequest.email}
                    onChange={(event) => setResetRequest({ email: event.target.value })}
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <button className="rounded-xl bg-blue-500 px-4 py-3.5 text-lg font-medium text-white" disabled={loading} type="submit">
                    {loading ? "Sending..." : "Send reset email"}
                  </button>
                  <button
                    className="workspace-ghost px-4 py-3 text-sm"
                    type="button"
                    onClick={() => {
                      setError("");
                      setAuthNotice("");
                      setAuthMode("login");
                    }}
                  >
                    Back to sign in
                  </button>
                </div>
              </form>
            ) : null}
            {authMode === "password-change" ? (
              <form className="mt-10 grid gap-6" onSubmit={handlePasswordChange}>
                <label className="grid gap-3 text-sm">
                  <span className="muted">Email Address</span>
                  <input className="login-input" value={pendingPasswordChange.email} readOnly />
                </label>
                <label className="grid gap-3 text-sm">
                  <span className="muted">Temporary password</span>
                  <input className="login-input" type="password" value={pendingPasswordChange.current_password} readOnly />
                </label>
                <label className="grid gap-3 text-sm">
                  <span className="muted">New password</span>
                  <input
                    className="login-input"
                    type="password"
                    value={pendingPasswordChange.password}
                    onChange={(event) => setPendingPasswordChange((current) => ({ ...current, password: event.target.value }))}
                  />
                </label>
                <label className="grid gap-3 text-sm">
                  <span className="muted">Confirm new password</span>
                  <input
                    className="login-input"
                    type="password"
                    value={pendingPasswordChange.confirmPassword}
                    onChange={(event) => setPendingPasswordChange((current) => ({ ...current, confirmPassword: event.target.value }))}
                  />
                </label>
                <button className="rounded-xl bg-blue-500 px-4 py-3.5 text-lg font-medium text-white" disabled={loading} type="submit">
                  {loading ? "Updating..." : "Save new password"}
                </button>
              </form>
            ) : null}
            {authMode === "reset-confirm" ? (
              <form className="mt-10 grid gap-6" onSubmit={handlePasswordResetConfirm}>
                <label className="grid gap-3 text-sm">
                  <span className="muted">Reset token</span>
                  <input
                    className="login-input font-mono text-sm"
                    value={resetConfirm.token}
                    onChange={(event) => setResetConfirm((current) => ({ ...current, token: event.target.value }))}
                  />
                </label>
                <label className="grid gap-3 text-sm">
                  <span className="muted">New password</span>
                  <input
                    className="login-input"
                    type="password"
                    value={resetConfirm.password}
                    onChange={(event) => setResetConfirm((current) => ({ ...current, password: event.target.value }))}
                  />
                </label>
                <label className="grid gap-3 text-sm">
                  <span className="muted">Confirm new password</span>
                  <input
                    className="login-input"
                    type="password"
                    value={resetConfirm.confirmPassword}
                    onChange={(event) => setResetConfirm((current) => ({ ...current, confirmPassword: event.target.value }))}
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <button className="rounded-xl bg-blue-500 px-4 py-3.5 text-lg font-medium text-white" disabled={loading} type="submit">
                    {loading ? "Updating..." : "Update password"}
                  </button>
                  <button
                    className="workspace-ghost px-4 py-3 text-sm"
                    type="button"
                    onClick={() => {
                      setError("");
                      setAuthNotice("");
                      setAuthMode("login");
                    }}
                  >
                    Back to sign in
                  </button>
                </div>
              </form>
            ) : null}
            {authNotice ? <div className="login-notice mt-5">{authNotice}</div> : null}
            {error ? <p className="mt-5 text-sm text-rose-300">{error}</p> : null}
          </section>

          <aside className="login-side flex flex-col justify-between p-10 lg:p-12">
            <div className="relative z-10">
              <div className="brand-logo-login-wrap">
                <img alt="Dave Edwards Racing" className="brand-logo brand-logo-login" src="/DER_logo_transparent.png" />
              </div>
              <p className="mt-8 text-xs uppercase tracking-[0.3em] text-lime-300/90">Telemetry Analysis Software</p>
              <h1 className="mt-5 text-4xl font-semibold leading-tight">Telemetry comparison, AI debriefs, and coaching reports for your drivers.</h1>
              <p className="mt-5 max-w-md text-lg muted">
                Compare drivers side by side, review lap trends, and turn UniPro session data into structured coaching feedback.
              </p>
            </div>
            <div className="relative z-10 mt-10 rounded-2xl border border-white/10 bg-slate-950/20 p-6">
              <p className="text-lg font-semibold">Built for the team garage</p>
              <p className="mt-2 text-sm muted">Manager, driver, and parent access in one secure coaching workspace.</p>
              <div className="mt-5 grid gap-3">
                {["Driver comparison and trends", "Session history and report review", "Role-based access for your team"].map((item) => (
                  <div key={item} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
    );
  }

  return (
    <main className="workspace-stage">
      <div className="workspace-shell grid min-h-screen grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        {mobileMenuOpen ? <button aria-label="Close menu" className="workspace-mobile-backdrop" onClick={() => setMobileMenuOpen(false)} type="button" /> : null}
        <aside className={`workspace-sidebar flex flex-col p-6 ${mobileMenuOpen ? "mobile-open" : ""}`}>
          <div className="workspace-brand workspace-brand-premium pb-8">
            <div>
              <div className="brand-logo-shell-wrap">
                <img alt="Dave Edwards Racing" className="brand-logo brand-logo-shell" src="/DER_logo_transparent.png" />
              </div>
              <h2 className="mt-3 text-lg font-semibold">DER</h2>
              <p className="text-xs uppercase tracking-[0.3em] text-lime-300">Telemetry Analysis Software</p>
              <p className="workspace-brand-note mt-4">Race weekend planning, telemetry review, and report publishing in one coaching workspace.</p>
            </div>
          </div>
          <div className="workspace-account workspace-account-premium mt-6 rounded-2xl border border-white/10 p-4">
            <span className="badge">{session.role}</span>
            <p className="mt-3 font-medium">{session.name}</p>
            <p className="workspace-account-email mt-1 text-sm muted">{session.email}</p>
            <button className="workspace-ghost mt-4 w-full px-4 py-3 text-sm" onClick={handleLogout} type="button">
              Log out
            </button>
          </div>
          <nav className="mt-6 grid gap-5">
            {navGroups.map((group) => (
              <div key={group.label} className="workspace-nav-group">
                <p className="workspace-nav-heading">{group.label}</p>
                {group.items.map((item) => renderNavItem(item))}
              </div>
            ))}
          </nav>
          {!["driver", "parent"].includes(session.role) ? (
            <div className="mt-auto pt-6">
              <div className="workspace-nav-group">
                <p className="workspace-nav-heading">{SETTINGS_NAV_GROUP.label}</p>
                {SETTINGS_NAV_GROUP.items.map((item) => renderNavItem(item))}
              </div>
            </div>
          ) : null}
        </aside>

        <section className="workspace-content p-5 lg:p-6">
          <div className={`workspace-canvas ${appSettings.compactTables ? "workspace-compact" : ""}`}>
          <header className="workspace-header">
            <div className="workspace-mobile-bar">
              <button
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                aria-pressed={mobileMenuOpen}
                className="workspace-mobile-toggle"
                onClick={() => setMobileMenuOpen((current) => !current)}
                type="button"
              >
                <span />
                <span />
                <span />
              </button>
              <div className="workspace-mobile-title">
                <p className="workspace-section-label">{screenMeta.eyebrow}</p>
                <p className="mt-1 font-medium text-white">{screen}</p>
              </div>
            </div>
            <div className="workspace-screen-card workspace-screen-card-premium">
              <p className="workspace-section-label">{screenMeta.eyebrow}</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">{screenMeta.title}</h1>
              <p className="workspace-screen-subtitle">{screenMeta.subtitle}</p>
              {!["driver", "parent"].includes(session.role) ? (
                <div className="workspace-action-row mt-5">
                  {adminHeaderBadges.map((badge) => (
                    <span key={badge.label} className={`pill ${badge.tone === "neutral" ? "pill-neutral" : badge.tone === "warn" ? "pill-warn" : ""}`}>
                      {badge.label}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="workspace-action-row mt-5">
                  <span className="pill">{session.name}</span>
                  <span className="pill pill-neutral">{formatRoleLabel(session.role)}</span>
                </div>
              )}
            </div>
          </header>

          <section className="grid gap-5">
            {authNotice ? (
              <div className="workspace-notice-banner">
                {authNotice}
              </div>
            ) : null}
            {error ? (
              <div className="workspace-error-banner">
                {error}
              </div>
            ) : null}
            {!["driver", "parent"].includes(session.role) && screen === "Home" ? (
              <HomeDashboard
                driversStore={driversStore}
                eventsStore={eventsStore}
                homeStats={homeStats}
                reportsStore={reportsStore}
                sessionsStore={sessionsStore}
                testSessionsStore={testSessionsStore}
                onOpenDrivers={() => openManagementScreen("Driver Profiles")}
                onOpenEvents={() => openEventScreen("View Upcoming Events")}
                onOpenHistory={() => setScreen("History")}
                onOpenReports={() => setScreen("Reports")}
                onOpenTracks={() => setScreen("Tracks")}
              />
            ) : null}

            {!["driver", "parent"].includes(session.role) && screen === "Chat Bot" ? (
              <ChatBotPanel
                chatInput={chatInput}
                loading={loading}
                messages={chatMessages}
                model={formState.model}
                provider={appSettings.aiProvider}
                onChangeInput={setChatInput}
                onSubmit={handleChatSubmit}
              />
            ) : null}

            {!["driver", "parent"].includes(session.role) && screen === "General Settings" ? (
              <GeneralSettingsPanel
                appSettings={appSettings}
                mapsApiKey={mapsApiKey}
                onChange={setAppSettings}
                onMapsApiKeyChange={setMapsApiKey}
                saving={settingsSaving}
              />
            ) : null}

            {!["driver", "parent"].includes(session.role) && screen === "AI Settings" ? (
              <AISettingsPanel
                appSettings={appSettings}
                model={formState.model}
                ollamaStatus={ollamaStatus}
                openAiStatus={openAiStatus}
                memoryEntries={aiMemoryEntries}
                memoryDraft={aiMemoryDraft}
                onChangeSettings={setAppSettings}
                onMemoryDraftChange={setAiMemoryDraft}
                onCreateMemory={handleCreateMemory}
                onDeleteMemory={handleDeleteMemory}
                onModelChange={(model) => {
                  setFormState((current) => ({ ...current, model }));
                  setAppSettings((current) => ({
                    ...current,
                    aiModel: current.aiProvider === "ollama" ? model : current.aiModel,
                    openAiModel: current.aiProvider === "openai" ? model : current.openAiModel,
                  }));
                }}
                onRefresh={() => refreshAiProviderStatus()}
                saving={settingsSaving}
              />
            ) : null}

            {!["driver", "parent"].includes(session.role) && screen === "Email Settings" ? (
              <EmailSettingsPanel
                emailSettings={emailSettings}
                onChange={setEmailSettings}
                onSave={handleSaveEmailSettings}
                onSendTest={handleSendTestEmail}
                saving={settingsSaving}
              />
            ) : null}

            {!["driver", "parent"].includes(session.role) && screen === "Operations" ? (
              <OperationsPanel
                authAuditEntries={authAuditEntries}
                backupEntries={backupEntries}
                emailDeliveryLog={emailDeliveryLog}
                loading={loading}
                onCreateBackup={handleCreateBackup}
                onExportData={handleExportOperationsData}
                operationsHealth={operationsHealth}
                reportHealth={reportHealth}
                restoreGuidance={restoreGuidance}
              />
            ) : null}

            {!["driver", "parent"].includes(session.role) && ["Create Event", "View Upcoming Events", "View Past Events"].includes(screen) ? (
              <EventManager
                eventsStore={eventsStore}
                eventDraft={eventDraft}
                testSessionDraft={testSessionDraft}
                testSessionsStore={testSessionsStore}
                driversStore={driversStore}
                tracksStore={tracksStore}
                selectedPlannerEventId={selectedPlannerEventId}
                editingEventId={editingEventId}
                editingTestSessionId={editingTestSessionId}
                mode={screen}
                onSelectEvent={openEventSessions}
                onCancel={() => {
                  setEditingEventId(null);
                  setEventDraft(EMPTY_EVENT);
                }}
                onTestSessionCancel={() => {
                  setEditingTestSessionId(null);
                  const eventItem = eventsStore.find((item) => item.id === selectedPlannerEventId) || null;
                  setTestSessionDraft({
                    ...EMPTY_TEST_SESSION,
                    event_id: selectedPlannerEventId || "",
                    venue: eventItem?.venue || ""
                  });
                }}
                onChange={setEventDraft}
                onTestSessionChange={setTestSessionDraft}
                onDelete={handleDeleteEvent}
                onEdit={startEditEvent}
                onTestSessionEdit={startEditTestSession}
                onOpenUploadSession={openUploadForTestSession}
                onCreateSession={openCreateSession}
                onSubmit={handleEventSubmit}
                onTestSessionSubmit={handleTestSessionSubmit}
              />
            ) : null}

            {!["driver", "parent"].includes(session.role) && screen === "Calendar" ? (
              <PlanningCalendar
                eventsStore={eventsStore}
                onOpenEvent={(eventItem) => {
                  setSelectedPlannerEventId(eventItem.id);
                  setScreen("Event Sessions");
                }}
              />
            ) : null}

            {!["driver", "parent"].includes(session.role) && screen === "Event Sessions" ? (
              <SessionListPage
                eventsStore={eventsStore}
                sessionsStore={sessionsStore}
                reportsStore={reportsStore}
                loading={loading}
                selectedPlannerEventId={selectedPlannerEventId}
                onBackToEvents={() => {
                  const eventItem = eventsStore.find((item) => item.id === selectedPlannerEventId) || null;
                  setScreen(getEventScreenForItem(eventItem));
                }}
                onCreateSession={openCreateSession}
                onEditSession={startEditTestSession}
                onDeleteSession={handleDeleteTestSession}
                onOpenSession={openPlannedSession}
                onOpenUploadSession={openUploadForTestSession}
                onRefreshAllWeather={handleRefreshEventWeather}
              />
            ) : null}

              {!["driver", "parent"].includes(session.role) && screen === "Planned Session" ? (
                <PlannedSessionPage
                  selectedTestSession={selectedTestSession}
                  linkedUploadedSessions={(selectedTestSession?.uploaded_runs?.length
                    ? selectedTestSession.uploaded_runs
                    : sessionsStore.filter((item) => item.test_session_id === selectedTestSession?.id))}
                  loading={loading}
                  onBack={() => setScreen("Event Sessions")}
                  onDeleteSession={handleDeleteTestSession}
                  onEditSession={startEditTestSession}
                    onOpenUploadSession={openUploadForTestSession}
                    onSaveSetup={handleSavePlannedSessionSetup}
                    onSaveSession={handleSavePlannedSessionUpdate}
                    onRefreshWeather={handleRefreshPlannedSessionWeather}
                    onOpenUploadedSession={async (sessionId) => {
                    await loadSessionDetail(sessionId);
                    setScreen("Session Results");
                  }}
                  onDeleteUploadedSession={handleDeleteUploadedSession}
                />
              ) : null}

            {!["driver", "parent"].includes(session.role) && screen === "Create Session" ? (
              <SessionEditorPage
                eventsStore={eventsStore}
                testSessionDraft={testSessionDraft}
                editingTestSessionId={editingTestSessionId}
                onChange={setTestSessionDraft}
                onCancel={() => {
                  const eventId = testSessionDraft.event_id || selectedPlannerEventId;
                  const eventItem = eventsStore.find((item) => item.id === eventId) || null;
                  setEditingTestSessionId(null);
                  setTestSessionDraft({
                    ...EMPTY_TEST_SESSION,
                    event_id: eventId || "",
                    venue: eventItem?.venue || ""
                  });
                  setScreen(eventId ? "Event Sessions" : "View Upcoming Events");
                }}
                onSubmit={async (event) => {
                  await handleTestSessionSubmit(event);
                  setScreen("Event Sessions");
                }}
              />
            ) : null}

            {!["driver", "parent"].includes(session.role) && ["Driver Profiles", "Driver Accounts"].includes(screen) ? (
              <DriverManager
                screen={screen}
                driverDraft={driverDraft}
                driversStore={driversStore}
                classesStore={classesStore}
                editingDriverId={editingDriverId}
                selectedDriverTimeline={selectedDriverTimeline}
                selectedDriverTimelineId={selectedDriverTimelineId}
                accessLevelsStore={accessLevelsStore}
                editingUserAccountId={editingUserAccountId}
                userAccountDraft={userAccountDraft}
                userAccountsStore={userAccountsStore}
                onCancel={() => {
                  setEditingDriverId(null);
                  setDriverDraft(EMPTY_DRIVER);
                }}
                onChange={setDriverDraft}
                onDelete={handleDeleteDriver}
                onEdit={startEditDriver}
                onOpenTimeline={loadDriverTimeline}
                onSubmit={handleDriverSubmit}
                onUserAccountCancel={() => {
                  setEditingUserAccountId(null);
                  setUserAccountDraft(createEmptyAccountDraftForScreen("Driver Accounts", EMPTY_ACCOUNT));
                }}
                onUserAccountChange={setUserAccountDraft}
                onUserAccountDelete={handleDeleteUserAccount}
                onUserAccountEdit={startEditUserAccount}
                onUserAccountSubmit={handleUserAccountSubmit}
              />
            ) : null}

            {!["driver", "parent"].includes(session.role) && screen === "Tracks" ? (
              <TrackLibrary mapsApiKey={appSettings.showTrackMaps ? mapsApiKey : ""} selectedTrackName={formState.eventName} tracks={tracksStore} onSaveTrack={handleTrackUpdate} />
            ) : null}

            {!["driver", "parent"].includes(session.role) && screen === "Setup Database" ? (
              <SetupDatabasePage
                setupDatabase={setupDatabaseStore}
                loading={loading}
                onOpenPlannedSession={(testSessionId) => {
                  const testSession = testSessionsStore.find((item) => item.id === testSessionId);
                  if (testSession) {
                    openPlannedSession(testSession);
                  }
                }}
                onOpenUploadSession={(testSessionId) => {
                  const testSession = testSessionsStore.find((item) => item.id === testSessionId);
                  if (testSession) {
                    openUploadForTestSession(testSession);
                  }
                }}
                onSaveTrackConfig={handleTrackUpdate}
                onAnalyseTrackSetups={handleSetupDatabaseAiAnalysis}
              />
            ) : null}

            {!["driver", "parent"].includes(session.role) && ["Parent Management", "Administrator Management"].includes(screen) ? (
              <UserManagementPanel
                accessLevelDraft={accessLevelDraft}
                accessLevelsStore={accessLevelsStore}
                driversStore={driversStore}
                editingAccessLevelId={editingAccessLevelId}
                editingUserAccountId={editingUserAccountId}
                mode={screen}
                onAccessLevelChange={setAccessLevelDraft}
                onAccessLevelEdit={startEditAccessLevel}
                onAccessLevelSubmit={handleAccessLevelSubmit}
                onAccessLevelCancel={() => {
                  setEditingAccessLevelId(null);
                  setAccessLevelDraft(EMPTY_ACCESS_LEVEL);
                }}
                onUserAccountCancel={() => {
                  setEditingUserAccountId(null);
                  setUserAccountDraft(createEmptyAccountDraftForScreen(screen));
                }}
                onUserAccountApprove={handleApproveUserAccount}
                onUserAccountChange={setUserAccountDraft}
                onUserAccountDelete={handleDeleteUserAccount}
                onUserAccountEdit={startEditUserAccount}
                onUserAccountResendApproval={handleResendApprovalEmail}
                onUserAccountReject={handleRejectUserAccount}
                onUserAccountApproveManual={handleManualApproveUserAccount}
                onUserAccountSubmit={handleUserAccountSubmit}
                userAccountDraft={userAccountDraft}
                userAccountsStore={userAccountsStore}
              />
            ) : null}

            {!["driver", "parent"].includes(session.role) && screen === "Upload Session" ? (
              <UploadWorkspace
                analysis={analysis}
                currentTrack={currentTrack}
                drivers={drivers}
                error={error}
                eventsStore={eventsStore}
                formState={formState}
                loading={loading}
                onAudienceChange={(audience) => setFormState((current) => ({ ...current, audience }))}
                onOpenTracks={() => setScreen("Tracks")}
                onUpload={handleUpload}
                reports={reports}
                reportsStore={reportsStore}
                selectedTestSession={selectedTestSession}
                sessionsStore={sessionsStore}
              />
            ) : null}

            {screen === "Reports" ? (
              <ReportBuilderPanel
                sessionsStore={sessionsStore}
                selectedSessionDetail={selectedSessionDetail}
                reportsStore={reportsStore}
                loading={loading}
                generateNotice={reportNotice}
                audience={formState.audience}
                onAudienceChange={(audience) => setFormState((current) => ({ ...current, audience }))}
                onSelectSession={async (sessionId) => {
                  await loadSessionDetail(sessionId);
                }}
                onGenerateFeedback={handleGenerateFeedback}
                onExportPdf={handleExportPdf}
                onPublishReport={async (reportId, payload) => {
                  const data = await updateReportPublish(reportId, payload);
                  setSelectedSessionDetail((current) => current ? {
                    ...current,
                    reports: current.reports.map((item) => item.id === reportId ? data.report : item)
                  } : current);
                  setReportsStore((current) => current.map((item) => item.id === reportId ? { ...item, ...data.report } : item));
                }}
              />
            ) : null}

            {!["driver", "parent"].includes(session.role) && analysis && !["Reports", "History", "Session Results"].includes(screen) ? (
              <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                <AnalysisPanel analysis={analysis} onGenerateFeedback={handleGenerateFeedback} generating={loading} />
                <ReportsPanel reports={reports} hasAnalysis={Boolean(analysis)} onGenerateFeedback={handleGenerateFeedback} onExportPdf={handleExportPdf} loading={loading} />
              </div>
            ) : null}

            {screen === "History" ? (
              <HistoryPanel
                selectedSessionId={selectedSessionId}
                selectedSessionDetail={selectedSessionDetail}
                sessions={["driver", "parent"].includes(session.role) ? portalHistorySessions : sessionsStore}
                onSelectSession={async (sessionId) => {
                  await loadSessionDetail(sessionId);
                }}
                onOpenSession={async (sessionId) => {
                  await loadSessionDetail(sessionId);
                  setScreen("Session Results");
                }}
                onDeleteSession={handleDeleteUploadedSession}
              />
            ) : null}

            {screen === "Session Results" ? (
              <SessionResultsPage
                selectedSessionDetail={selectedSessionDetail}
                loading={loading}
                tracks={tracksStore}
                mapsApiKey={appSettings.showTrackMaps ? mapsApiKey : ""}
                speedUnit={appSettings.speedUnit || "kmh"}
                onBack={() => setScreen("History")}
                onGenerateFeedback={handleGenerateFeedback}
                onExportPdf={handleExportPdf}
                onOpenReportStudio={() => setScreen("Reports")}
                onSessionStatusChange={async (status) => {
                  if (!selectedSessionDetail?.session?.id) return;
                  const data = await updateSessionStatus(selectedSessionDetail.session.id, { status });
                  setSelectedSessionDetail((current) => current ? { ...current, session: data.session } : current);
                  setSessionsStore((current) => current.map((item) => item.id === data.session.id ? { ...item, status: data.session.status } : item));
                }}
                onPublishReport={async (reportId, payload) => {
                  const data = await updateReportPublish(reportId, payload);
                  setSelectedSessionDetail((current) => current ? {
                    ...current,
                    reports: current.reports.map((item) => item.id === reportId ? data.report : item)
                  } : current);
                  setReportsStore((current) => current.map((item) => item.id === reportId ? { ...item, ...data.report } : item));
                }}
                onSavePreset={handleSaveSessionPreset}
                onDeletePreset={handleDeleteSessionPreset}
                onSaveCoachingNote={handleSaveCoachingNote}
                onDeleteCoachingNote={handleDeleteCoachingNote}
                onSaveTrackMarkerDefaults={async (track, cornerMarkerOffsets) => {
                  if (!track?.id) return;
                  const payload = {
                    layout_notes: track.layoutNotes || "",
                    coaching_focus: track.coachingFocus || [],
                    corner_notes: track.cornerNotes || [],
                    corner_marker_offsets: cornerMarkerOffsets || {},
                    corner_definitions: track.cornerDefinitions || [],
                  };
                  await handleTrackUpdate(track.id, payload);
                }}
                onDeleteSession={handleDeleteUploadedSession}
              />
            ) : null}

            {session.role === "driver" && screen === "My Portal" ? (
              <DriverPortalPanel
                portal={portalData}
                selectedSessionDetail={selectedSessionDetail}
                lastSeenSessionAt={portalSeenSnapshot.lastSeenSessionAt}
                lastSeenReportAt={portalSeenSnapshot.lastSeenReportAt}
                speedUnit={appSettings.speedUnit || "kmh"}
                onOpenSession={(sessionId) => {
                  loadSessionDetail(sessionId);
                  setScreen("History");
                }}
              />
            ) : null}
            {session.role === "parent" && screen === "My Portal" ? (
              <ParentPortalPanel
                portal={portalData}
                lastSeenSessionAt={portalSeenSnapshot.lastSeenSessionAt}
                lastSeenReportAt={portalSeenSnapshot.lastSeenReportAt}
                speedUnit={appSettings.speedUnit || "kmh"}
                onOpenSession={(sessionId) => {
                  loadSessionDetail(sessionId);
                  setScreen("History");
                }}
              />
            ) : null}
          </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function AISettingsPanel({
  appSettings,
  model,
  ollamaStatus,
  openAiStatus,
  memoryEntries,
  memoryDraft,
  onChangeSettings,
  onMemoryDraftChange,
  onCreateMemory,
  onDeleteMemory,
  onModelChange,
  onRefresh,
  saving
}) {
  const installedModels = ollamaStatus.models || [];
  const provider = appSettings.aiProvider || "ollama";

  return (
    <section className="workspace-page">
      <section className="workspace-hero workspace-hero-premium">
        <div className="workspace-hero-premium-grid">
          <div className="workspace-hero-copy">
            <p className="workspace-section-label">AI Settings</p>
            <h2 className="workspace-hero-title">Choose the AI stack like part of the coaching system, not a hidden integration.</h2>
            <p className="workspace-hero-text">Switch between Ollama and OpenAI, tune retrieval and memory, and keep the model context tied tightly to your stored sessions, notes, and reports.</p>
          </div>
          <div className="workspace-hero-grid">
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Provider</p>
              <p className="workspace-kpi-value">{provider}</p>
              <p className="workspace-kpi-detail">Current active inference provider.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Retrieval</p>
              <p className="workspace-kpi-value">{appSettings.aiRetrievalEnabled ? "On" : "Off"}</p>
              <p className="workspace-kpi-detail">Stored sessions and notes included in prompts.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Memory items</p>
              <p className="workspace-kpi-value">{memoryEntries.length}</p>
              <p className="workspace-kpi-detail">Pinned context available to reuse in chat and reports.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5">
        <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="app-panel p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-blue-300">AI Settings</p>
          <h3 className="mt-3 text-2xl font-semibold">Choose the AI provider and model</h3>
          <p className="mt-3 text-sm muted">You can now run the app on local Ollama or OpenAI. Retrieval and persistent memory are handled in the app so the model responds using your stored session history, notes, and saved memory.</p>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm">
              <span className="muted">Provider</span>
              <select
                className="workspace-field"
                value={provider}
                onChange={(event) => {
                  const nextProvider = event.target.value;
                  onChangeSettings((current) => ({ ...current, aiProvider: nextProvider }));
                  onModelChange(nextProvider === "openai" ? (appSettings.openAiModel || "gpt-5.4-mini") : (appSettings.aiModel || installedModels[0] || ""));
                }}
              >
                <option value="ollama">Ollama (local)</option>
                <option value="openai">OpenAI</option>
              </select>
            </label>
            {provider === "openai" ? (
              <>
                <label className="grid gap-2 text-sm">
                  <span className="muted">OpenAI model</span>
                  <input className="workspace-field" value={model} onChange={(event) => onModelChange(event.target.value)} placeholder="gpt-5.4-mini" />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="muted">OpenAI API key</span>
                  <input
                    className="workspace-field"
                    type="password"
                    value={appSettings.openAiApiKey || ""}
                    onChange={(event) => onChangeSettings((current) => ({ ...current, openAiApiKey: event.target.value }))}
                    placeholder={appSettings.openAiApiKeyConfigured ? "Saved key on file. Enter a new key to replace it." : "sk-..."}
                  />
                  <span className="muted text-xs">
                    {appSettings.openAiApiKeyConfigured
                      ? "A key is already stored securely on the server. Leave this blank to keep using it."
                      : "Paste an OpenAI API key here to enable cloud inference."}
                  </span>
                </label>
              </>
            ) : (
              <label className="grid gap-2 text-sm">
                <span className="muted">Ollama model</span>
                <select className="workspace-field" value={model} onChange={(event) => onModelChange(event.target.value)} disabled={!installedModels.length}>
                  {installedModels.length ? installedModels.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  )) : <option value="">No Ollama models detected</option>}
                </select>
              </label>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm">
                <input
                  checked={Boolean(appSettings.aiRetrievalEnabled)}
                  onChange={(event) => onChangeSettings((current) => ({ ...current, aiRetrievalEnabled: event.target.checked }))}
                  type="checkbox"
                />
                <span>Use stored session history and notes as retrieval context</span>
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm">
                <input
                  checked={Boolean(appSettings.aiMemoryEnabled)}
                  onChange={(event) => onChangeSettings((current) => ({ ...current, aiMemoryEnabled: event.target.checked }))}
                  type="checkbox"
                />
                <span>Use persistent app memory and chat history</span>
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
              <p className="text-sm font-medium">{saving ? "Saving AI settings..." : "AI settings saved to database"}</p>
              <button className="workspace-ghost px-4 py-3 text-sm font-medium" onClick={onRefresh} type="button">
                Refresh provider status
              </button>
            </div>
          </div>
        </article>
        <article className="app-panel p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Provider Status</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm muted">Ollama</p>
              <p className="mt-2 text-lg font-semibold">{ollamaStatus.reachable ? "Ready" : "Offline"}</p>
              <p className="mt-2 text-sm muted">{ollamaStatus.reachable ? "Local inference is available for chat and report generation." : "Start Ollama on this machine if you want local inference."}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm muted">OpenAI</p>
              <p className="mt-2 text-lg font-semibold">
                {openAiStatus.reachable ? "Ready" : openAiStatus.configured ? "Configured but unreachable" : "Not configured"}
              </p>
              <p className="mt-2 text-sm muted">
                {openAiStatus.reachable ? "Cloud inference is available through the configured OpenAI API key." : openAiStatus.configured ? "The key is present, but the API could not be reached." : "Add an API key to enable OpenAI as an alternate provider."}
              </p>
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
            <p className="text-sm font-medium">Available models</p>
            <div className="mt-3 chip-row">
              {provider === "ollama" ? (
                installedModels.length ? installedModels.map((item) => (
                  <span key={item} className={`pill ${item === model ? "" : "pill-neutral"}`}>{item}</span>
                )) : <span className="pill pill-warn">No local Ollama models listed</span>
              ) : (
                (openAiStatus.models || []).length ? openAiStatus.models.slice(0, 12).map((item) => (
                  <span key={item} className={`pill ${item === model ? "" : "pill-neutral"}`}>{item}</span>
                )) : <span className="pill pill-neutral">OpenAI models will appear after a successful status refresh</span>
              )}
            </div>
          </div>
        </article>
      </div>
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="app-panel p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Persistent Memory</p>
          <h3 className="mt-3 text-2xl font-semibold">Save things the AI should keep in mind</h3>
          <p className="mt-3 text-sm muted">Use memory for recurring coaching preferences, team rules, reporting style, or standing context you want available every time you chat or generate feedback.</p>
          <form className="mt-5 grid gap-3" onSubmit={onCreateMemory}>
            <input
              className="workspace-field"
              placeholder="Memory title"
              value={memoryDraft.title}
              onChange={(event) => onMemoryDraftChange((current) => ({ ...current, title: event.target.value }))}
            />
            <textarea
              className="workspace-field min-h-[120px]"
              placeholder="Example: Always compare PF International sessions against setup changes and call out tyre pressure shifts clearly."
              value={memoryDraft.content}
              onChange={(event) => onMemoryDraftChange((current) => ({ ...current, content: event.target.value }))}
            />
            <input
              className="workspace-field"
              placeholder="Tags (comma separated)"
              value={memoryDraft.tags}
              onChange={(event) => onMemoryDraftChange((current) => ({ ...current, tags: event.target.value }))}
            />
            <div className="flex justify-end">
              <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" disabled={!memoryDraft.content.trim()} type="submit">
                Save memory
              </button>
            </div>
          </form>
        </article>
        <article className="app-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Saved Memory</p>
              <h3 className="mt-2 text-2xl font-semibold">Reusable context for chat and reports</h3>
            </div>
            <span className="pill pill-neutral">{memoryEntries.length} saved</span>
          </div>
          <div className="mt-5 grid gap-3">
            {memoryEntries.length ? memoryEntries.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.title || "Untitled memory"}</p>
                    <p className="mt-2 text-sm whitespace-pre-wrap muted">{item.content}</p>
                    {item.tags?.length ? (
                      <div className="mt-3 chip-row">
                        {item.tags.map((tag) => <span key={`${item.id}-${tag}`} className="pill pill-neutral">{tag}</span>)}
                      </div>
                    ) : null}
                  </div>
                  <button className="workspace-danger px-3 py-2 text-sm" onClick={() => onDeleteMemory(item.id)} type="button">
                    Delete
                  </button>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm muted">
                No saved memory yet. Add recurring coaching or reporting context on the left and it will be reused in chat and OpenAI/Ollama feedback generation.
              </div>
            )}
          </div>
        </article>
        </div>
      </div>
    </section>
  );
}

function ChatBotPanel({ messages, chatInput, onChangeInput, onSubmit, model, provider, loading }) {
  return (
    <section className="workspace-page">
      <section className="workspace-hero workspace-hero-premium">
        <div className="workspace-hero-premium-grid">
          <div className="workspace-hero-copy">
            <p className="workspace-section-label">Chat Bot</p>
            <h2 className="workspace-hero-title">Use the assistant like a coaching desk, not a generic chat box.</h2>
            <p className="workspace-hero-text">Ask about drivers, tracks, workflow, and telemetry context with retrieval and memory pulled from the platform you’re already running.</p>
          </div>
          <div className="workspace-hero-grid">
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Provider</p>
              <p className="workspace-kpi-value">{provider === "openai" ? "OpenAI" : "Ollama"}</p>
              <p className="workspace-kpi-detail">Active assistant provider for this conversation.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Model</p>
              <p className="workspace-kpi-value text-[1.1rem]">{model || "Not set"}</p>
              <p className="workspace-kpi-detail">Current model responding in chat.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Messages</p>
              <p className="workspace-kpi-value">{messages.length}</p>
              <p className="workspace-kpi-detail">Conversation turns currently visible.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="app-panel p-5">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Chat Bot</p>
            <h3 className="mt-2 text-2xl font-semibold">{provider === "openai" ? "OpenAI assistant" : "Local Ollama assistant"}</h3>
          </div>
          <span className="pill">{provider === "openai" ? `OpenAI - ${model || "No model selected"}` : model || "No model selected"}</span>
        </div>
        <div className="chat-thread mt-5">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`chat-bubble ${message.role === "assistant" ? "assistant" : "user"}`}>
              <p className="chat-role">{message.role === "assistant" ? "Assistant" : "You"}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{message.content}</p>
            </div>
          ))}
          {loading ? (
            <div className="chat-bubble assistant">
              <p className="chat-role">Assistant</p>
              <p className="mt-2 text-sm">Thinking...</p>
            </div>
          ) : null}
        </div>
        <form className="mt-5 grid gap-3" onSubmit={onSubmit}>
          <textarea
            className="workspace-field min-h-[130px]"
            placeholder="Ask about drivers, tracks, reports, event workflow, or telemetry..."
            value={chatInput}
            onChange={(event) => onChangeInput(event.target.value)}
          />
          <div className="flex justify-end">
            <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" disabled={loading || !chatInput.trim()} type="submit">
              Send message
            </button>
          </div>
        </form>
      </article>
        <article className="app-panel p-5">
        <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Suggestions</p>
        <div className="mt-4 grid gap-3">
          {[
            "What should I look for when comparing two junior drivers at PF International?",
            "Help me plan a Saturday practice workflow for four drivers.",
            "What settings in this app should I configure before real UniPro files arrive?",
            "How should I structure corner notes so later GPS analysis is useful?",
          ].map((prompt) => (
            <div key={prompt} className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
              <p className="text-sm">{prompt}</p>
            </div>
          ))}
        </div>
        </article>
      </div>
    </section>
  );
}

function GeneralSettingsPanel({ appSettings, mapsApiKey, onChange, onMapsApiKeyChange, saving }) {
  const landingOptions = ["Home", "View Upcoming Events", "History", "Reports", "Driver Profiles", "Driver Accounts", "Calendar", "Tracks"];
  const currentLandingScreen = normalizeScreenName(appSettings.defaultLandingScreen || "Home");
  const audienceOptions = ["coach", "driver", "parent"];
  const timezoneOptions = ["Europe/London", "UTC", "Europe/Paris", "America/New_York"];
  const dateFormatOptions = [
    { value: "en-GB", label: "UK (31/03/2026)" },
    { value: "en-US", label: "US (03/31/2026)" },
    { value: "de-DE", label: "DE (31.03.2026)" }
  ];

  return (
    <section className="workspace-page">
      <section className="workspace-hero workspace-hero-premium">
        <div className="workspace-hero-premium-grid">
          <div className="workspace-hero-copy">
            <p className="workspace-section-label">General Settings</p>
            <h2 className="workspace-hero-title">Set the platform defaults once, then let the workflow feel intentional everywhere.</h2>
            <p className="workspace-hero-text">These settings shape the landing experience, defaults, display units, and integrations that influence planning, uploads, portals, and reports.</p>
          </div>
          <div className="workspace-hero-grid">
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Landing screen</p>
              <p className="workspace-kpi-value text-[1.1rem]">{currentLandingScreen}</p>
              <p className="workspace-kpi-detail">Default entry surface for admins.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Report audience</p>
              <p className="workspace-kpi-value">{appSettings.defaultAudience}</p>
              <p className="workspace-kpi-detail">Default audience used in report generation.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Speed unit</p>
              <p className="workspace-kpi-value">{appSettings.speedUnit || "kmh"}</p>
              <p className="workspace-kpi-detail">Display unit used across telemetry views.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <article className="app-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Organisation</p>
          <span className="pill pill-neutral">{saving ? "Saving..." : "Saved to database"}</span>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="muted">Team / organisation name</span>
            <input className="workspace-field" value={appSettings.organisationName} onChange={(event) => onChange((current) => ({ ...current, organisationName: event.target.value }))} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="muted">Support email</span>
            <input className="workspace-field" value={appSettings.supportEmail} onChange={(event) => onChange((current) => ({ ...current, supportEmail: event.target.value }))} />
          </label>
        </div>

        <p className="mt-6 text-xs uppercase tracking-[0.3em] text-blue-300">Platform Defaults</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="muted">Default landing page</span>
            <select className="workspace-field" value={currentLandingScreen} onChange={(event) => onChange((current) => ({ ...current, defaultLandingScreen: event.target.value }))}>
              {landingOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span className="muted">Default report audience</span>
            <select className="workspace-field" value={appSettings.defaultAudience} onChange={(event) => onChange((current) => ({ ...current, defaultAudience: event.target.value }))}>
              {audienceOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span className="muted">Default session type</span>
            <input className="workspace-field" value={appSettings.defaultSessionType} onChange={(event) => onChange((current) => ({ ...current, defaultSessionType: event.target.value }))} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="muted">Default event round prefix</span>
            <input className="workspace-field" placeholder="e.g. TVKC Round" value={appSettings.defaultEventRoundPrefix} onChange={(event) => onChange((current) => ({ ...current, defaultEventRoundPrefix: event.target.value }))} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="muted">Default track / venue</span>
            <input className="workspace-field" placeholder="e.g. PF International" value={appSettings.defaultTrackName} onChange={(event) => onChange((current) => ({ ...current, defaultTrackName: event.target.value }))} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="muted">PDF file prefix</span>
            <input className="workspace-field" value={appSettings.pdfFilePrefix} onChange={(event) => onChange((current) => ({ ...current, pdfFilePrefix: event.target.value }))} />
          </label>
        </div>
      </article>

      <article className="app-panel p-5">
        <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Display And Integrations</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="muted">Timezone</span>
            <select className="workspace-field" value={appSettings.timezone} onChange={(event) => onChange((current) => ({ ...current, timezone: event.target.value }))}>
              {timezoneOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span className="muted">Date format</span>
            <select className="workspace-field" value={appSettings.dateFormat} onChange={(event) => onChange((current) => ({ ...current, dateFormat: event.target.value }))}>
              {dateFormatOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span className="muted">Speed unit</span>
            <select className="workspace-field" value={appSettings.speedUnit || "kmh"} onChange={(event) => onChange((current) => ({ ...current, speedUnit: event.target.value }))}>
              <option value="kmh">Kilometres per hour (km/h)</option>
              <option value="mph">Miles per hour (mph)</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm md:col-span-2">
            <span className="muted">Google Static Maps API key</span>
            <input className="workspace-field" placeholder="Used for live track images in the track library" value={mapsApiKey} onChange={(event) => onMapsApiKeyChange(event.target.value)} />
          </label>
        </div>

        <div className="mt-6 grid gap-3">
          <ToggleRow
            label="Show track maps"
            description="Use your Google Static Maps key to show live map imagery inside the track library."
            checked={appSettings.showTrackMaps}
            onChange={(checked) => onChange((current) => ({ ...current, showTrackMaps: checked }))}
          />
          <ToggleRow
            label="Auto-open latest portal session"
            description="When drivers or parents log in, open their newest available session automatically."
            checked={appSettings.autoOpenLatestPortalSession}
            onChange={(checked) => onChange((current) => ({ ...current, autoOpenLatestPortalSession: checked }))}
          />
          <ToggleRow
            label="Return to upcoming events after save"
            description="After event changes, guide the admin workflow back to the forward-planning list."
            checked={appSettings.autoReturnToUpcomingEvents}
            onChange={(checked) => onChange((current) => ({ ...current, autoReturnToUpcomingEvents: checked }))}
          />
          <ToggleRow
            label="Compact data tables"
            description="Tighten spacing slightly in list-heavy admin screens."
            checked={appSettings.compactTables}
            onChange={(checked) => onChange((current) => ({ ...current, compactTables: checked }))}
          />
        </div>
        </article>
      </div>
    </section>
  );
}

function EmailSettingsPanel({ emailSettings, onChange, onSave, onSendTest, saving }) {
  return (
    <section className="workspace-page">
      <section className="workspace-hero workspace-hero-premium">
        <div className="workspace-hero-premium-grid">
          <div className="workspace-hero-copy">
            <p className="workspace-section-label">Email Settings</p>
            <h2 className="workspace-hero-title">Treat email like a live service, not a hidden admin form.</h2>
            <p className="workspace-hero-text">Configure SMTP for approvals, temporary passwords, and resets, then verify delivery before it becomes part of the live user journey.</p>
          </div>
          <div className="workspace-hero-grid">
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">SMTP host</p>
              <p className="workspace-kpi-value text-[1.1rem]">{emailSettings.smtpHost || "Not set"}</p>
              <p className="workspace-kpi-detail">Current mail server endpoint.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Sender</p>
              <p className="workspace-kpi-value text-[1.1rem]">{emailSettings.fromEmail || "Not set"}</p>
              <p className="workspace-kpi-detail">From address for approvals and resets.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">State</p>
              <p className="workspace-kpi-value">{saving ? "Saving" : "Ready"}</p>
              <p className="workspace-kpi-detail">Current save/send state for the SMTP workspace.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <article className="app-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-blue-300">SMTP Delivery</p>
            <h3 className="mt-3 text-2xl font-semibold">Email settings</h3>
            <p className="mt-3 text-sm muted">Configure the SMTP service used for approval emails, temporary passwords, and password reset delivery.</p>
          </div>
          <span className="pill pill-neutral">{saving ? "Saving..." : "Ready to save"}</span>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="muted">SMTP host</span>
            <input className="workspace-field" value={emailSettings.smtpHost || ""} onChange={(event) => onChange((current) => ({ ...current, smtpHost: event.target.value }))} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="muted">SMTP port</span>
            <input className="workspace-field" value={emailSettings.smtpPort || ""} onChange={(event) => onChange((current) => ({ ...current, smtpPort: event.target.value }))} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="muted">SMTP username</span>
            <input className="workspace-field" value={emailSettings.smtpUsername || ""} onChange={(event) => onChange((current) => ({ ...current, smtpUsername: event.target.value }))} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="muted">SMTP password</span>
            <input className="workspace-field" type="password" value={emailSettings.smtpPassword || ""} onChange={(event) => onChange((current) => ({ ...current, smtpPassword: event.target.value }))} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="muted">From name</span>
            <input className="workspace-field" value={emailSettings.fromName || ""} onChange={(event) => onChange((current) => ({ ...current, fromName: event.target.value }))} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="muted">From email</span>
            <input className="workspace-field" value={emailSettings.fromEmail || ""} onChange={(event) => onChange((current) => ({ ...current, fromEmail: event.target.value }))} />
          </label>
        </div>
        <div className="mt-6 grid gap-3">
          <ToggleRow
            label="Use TLS"
            description="Enable STARTTLS for standard SMTP servers such as Microsoft 365 or Gmail SMTP relay."
            checked={Boolean(emailSettings.useTls)}
            onChange={(checked) => onChange((current) => ({ ...current, useTls: checked, useSsl: checked ? false : current.useSsl }))}
          />
          <ToggleRow
            label="Use SSL"
            description="Enable implicit SSL if your SMTP server expects a direct secure connection."
            checked={Boolean(emailSettings.useSsl)}
            onChange={(checked) => onChange((current) => ({ ...current, useSsl: checked, useTls: checked ? false : current.useTls }))}
          />
          <ToggleRow
            label="Allow invalid SMTP certificates"
            description="Only enable this if your SMTP server uses a self-signed or privately issued certificate and approval emails are failing."
            checked={Boolean(emailSettings.allowInvalidCertificates)}
            onChange={(checked) => onChange((current) => ({ ...current, allowInvalidCertificates: checked }))}
          />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="workspace-primary px-4 py-3 text-sm font-medium text-white" onClick={onSave} type="button" disabled={saving}>
            {saving ? "Saving..." : "Save email settings"}
          </button>
        </div>
      </article>

      <article className="app-panel p-5">
        <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Test Delivery</p>
        <h3 className="mt-3 text-2xl font-semibold">Send a test email</h3>
        <p className="mt-3 text-sm muted">Use this to verify that approvals and password reset emails will actually leave the system before enabling self-registration for users.</p>
        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm">
            <span className="muted">Test recipient email</span>
            <input className="workspace-field" value={emailSettings.testEmail || ""} onChange={(event) => onChange((current) => ({ ...current, testEmail: event.target.value }))} />
          </label>
          <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm muted">
            The app will use the configured SMTP server and sender details to send a simple connectivity test message.
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="workspace-ghost px-4 py-3 text-sm font-medium" onClick={onSendTest} type="button" disabled={saving}>
              {saving ? "Sending..." : "Send test email"}
            </button>
          </div>
        </div>
        </article>
      </div>
    </section>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-1 text-sm muted">{description}</p>
        </div>
        <button
          aria-pressed={checked}
          className={`toggle-switch ${checked ? "active" : ""}`}
          onClick={() => onChange(!checked)}
          type="button"
        >
          <span className="toggle-thumb" />
        </button>
      </div>
    </div>
  );
}




function getEventScreenForItem(eventItem) {
  const startKey = eventItem?.start_date || eventItem?.date;
  if (!startKey) {
    return "View Upcoming Events";
  }
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return String(startKey) < todayKey ? "View Past Events" : "View Upcoming Events";
}
