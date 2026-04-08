export function buildUploadFormData(assignments, formState) {
  const files = (assignments || []).filter((item) => item.file && item.driverId);
  if (!files.length) return null;

  const formData = new FormData();
  files.forEach((item) => {
    formData.append("files", item.file);
    formData.append("driver_ids", item.driverId);
  });
  formData.append("event_name", formState.eventName);
  formData.append("event_round", formState.eventRound);
  formData.append("session_type", formState.sessionType);
  if (formState.testSessionId) {
    formData.append("test_session_id", formState.testSessionId);
  }
  return formData;
}

export function getUploadValidationSummary(analysis, selectedTestSession) {
  const validation = analysis?.validation || {};
  const assignedDrivers = selectedTestSession?.drivers || [];
  const matches = Array.isArray(validation.driver_matches) ? validation.driver_matches : [];
  const missingDrivers = Array.isArray(validation.missing_drivers) ? validation.missing_drivers : [];
  const unplannedDrivers = Array.isArray(validation.unplanned_drivers) ? validation.unplanned_drivers : [];
  const uploadedDrivers = Array.isArray(validation.uploaded_drivers) ? validation.uploaded_drivers : [];
  const expectedDrivers = Array.isArray(validation.expected_drivers)
    ? validation.expected_drivers
    : assignedDrivers.map((driver) => driver.name);
  const matchedCount = matches.filter((item) => item.matched_name).length;
  const unmatchedUploads = matches.filter((item) => !item.matched_name).length;

  return {
    hasValidation: Boolean(selectedTestSession || expectedDrivers.length || uploadedDrivers.length || matches.length),
    matched: Boolean(validation.matched),
    matchedCount,
    unmatchedUploads,
    expectedCount: expectedDrivers.length,
    uploadedCount: uploadedDrivers.length,
    expectedDrivers,
    uploadedDrivers,
    missingDrivers,
    unplannedDrivers,
    matches,
  };
}
