import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive the real web app against the real API and a fresh PostgreSQL database
// (scripts/e2e-api.sh). Nothing is mocked.
const API_PORT = process.env.ARCHITECTFLOW_E2E_API_PORT ?? "8100";
const WEB_PORT = process.env.ARCHITECTFLOW_E2E_WEB_PORT ?? "3100";
// Set to test an already-running deployment (e.g. the Docker Compose stack) instead of
// starting a local API + web server.
const EXTERNAL = process.env.ARCHITECTFLOW_E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: EXTERNAL ?? `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
    // For HTTPS deployments using a local/self-signed CA (e.g. the Caddy example).
    ignoreHTTPSErrors: process.env.ARCHITECTFLOW_E2E_IGNORE_HTTPS_ERRORS === "1",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: EXTERNAL ? [] : [
    {
      command: "bash ../../scripts/e2e-api.sh",
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ARCHITECTFLOW_E2E_API_PORT: API_PORT },
    },
    {
      command: `npx next build && npx next start -p ${WEB_PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${WEB_PORT}/login`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: { ARCHITECTFLOW_API_ORIGIN: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
