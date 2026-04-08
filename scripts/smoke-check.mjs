const frontendUrl = process.env.FRONTEND_URL || "http://127.0.0.1:3000";
const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";

async function fetchJson(url) {
  const response = await fetch(url);
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { response, data };
}

async function verifyCheck(label, url, validate) {
  const { response, data } = await fetchJson(url);
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}`);
  }
  const validationError = validate?.(data);
  if (validationError) {
    throw new Error(`${label} failed validation: ${validationError}`);
  }
  console.log(`PASS ${label} -> ${url}`);
}

async function main() {
  console.log(`Smoke check using frontend ${frontendUrl}`);
  console.log(`Smoke check using backend  ${backendUrl}`);

  await verifyCheck(
    "backend operations health",
    `${backendUrl}/operations/health`,
    (data) => (!data?.database || !data?.ai ? "missing operations health payload" : "")
  );

  await verifyCheck(
    "frontend api rewrite",
    `${frontendUrl}/api/operations/health`,
    (data) => (!data?.database || !data?.smtp ? "rewrite did not return operations health payload" : "")
  );

  await verifyCheck(
    "report engine health",
    `${frontendUrl}/api/report-pdf`,
    (data) => (typeof data?.ok !== "boolean" ? "missing report engine ok flag" : "")
  );
}

main().catch((error) => {
  console.error(`FAIL ${error.message}`);
  process.exit(1);
});
