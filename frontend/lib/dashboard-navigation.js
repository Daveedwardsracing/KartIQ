export function buildAppStateSnapshot({
  session,
  screen,
  selectedSessionId,
  selectedPlannerEventId,
  selectedDriverTimelineId,
  testSessionId,
}) {
  return {
    session: session || null,
    screen: screen || "Home",
    selectedSessionId: selectedSessionId || null,
    selectedPlannerEventId: selectedPlannerEventId || null,
    selectedDriverTimelineId: selectedDriverTimelineId || null,
    testSessionId: testSessionId || "",
  };
}

export function buildSessionSelectionFormState(testSession, current) {
  return {
    ...current,
    testSessionId: testSession.id,
    eventName: testSession.venue || current.eventName,
    eventRound: testSession.name || current.eventRound,
    sessionType: testSession.session_type || current.sessionType,
  };
}

export function buildTestSessionEditorDraft(testSession, normalizeDriverSetup) {
  return {
    name: testSession.name || "",
    venue: testSession.venue || "",
    session_type: testSession.session_type || "Test Session",
    date: testSession.date || "",
    event_id: testSession.event_id || "",
    status: testSession.status || "planned",
    weather: testSession.weather || "",
    track_condition: testSession.track_condition || "",
    tyre_condition: testSession.tyre_condition || "",
    mechanic_notes: testSession.mechanic_notes || "",
    coach_notes: testSession.coach_notes || "",
    driver_ids: (testSession.drivers || []).map((driver) => driver.id),
    driver_setups: Object.fromEntries((testSession.drivers || []).map((driver) => [driver.id, normalizeDriverSetup(driver.setup)])),
  };
}
