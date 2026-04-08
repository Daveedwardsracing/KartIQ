import { chromium, devices } from "playwright";

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3001";

const desktopRoutes = [
  { path: "/", expectAnyText: ["Log In", "Telemetry Analysis Software"] },
  { path: "/history", expectAnyText: ["History", "Log In"] },
  { path: "/sessions/ses-93fd7d55", expectAnyText: ["Session Results", "Log In"] },
  { path: "/reports", expectAnyText: ["Reports", "Log In"] },
  { path: "/setups", expectAnyText: ["Setup", "Log In"] },
];

const failureMarkers = [
  "Application error",
  "Runtime Error",
  "Cannot find module",
  "ChunkLoadError",
  "Unhandled Runtime Error",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function verifyPage(page, route) {
  const response = await page.goto(`${baseUrl}${route.path}`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  assert(response, `No response received for ${route.path}`);
  assert(response.ok(), `${route.path} returned HTTP ${response.status()}`);

  const bodyText = await page.locator("body").innerText();
  for (const marker of failureMarkers) {
    assert(!bodyText.includes(marker), `${route.path} rendered failure marker: ${marker}`);
  }
  assert(bodyText.length > 20, `${route.path} rendered unexpectedly little content`);
  if (route.expectAnyText?.length) {
    assert(
      route.expectAnyText.some((item) => bodyText.includes(item)),
      `${route.path} did not contain any expected text: ${route.expectAnyText.join(", ")}`,
    );
  }
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  try {
    const desktopPage = await browser.newPage();
    for (const route of desktopRoutes) {
      await verifyPage(desktopPage, route);
      console.log(`OK desktop ${route.path}`);
    }

    const mobileContext = await browser.newContext({
      ...devices["iPhone 13"],
      locale: "en-GB",
    });
    const mobilePage = await mobileContext.newPage();
    const response = await mobilePage.goto(`${baseUrl}/`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    assert(response, "No response received for mobile root");
    assert(response.ok(), `Mobile root returned HTTP ${response.status()}`);
    assert(mobilePage.url().includes("/mobile"), `Mobile root did not redirect to /mobile. Final URL: ${mobilePage.url()}`);

    const mobileText = await mobilePage.locator("body").innerText();
    for (const marker of failureMarkers) {
      assert(!mobileText.includes(marker), `/mobile rendered failure marker: ${marker}`);
    }
    assert(mobileText.includes("Mobile"), "Mobile route did not render expected mobile content");
    console.log("OK mobile / -> /mobile");

    await mobileContext.close();
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
