import { defineConfig } from "@playwright/test";

export default defineConfig({
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3999",
    trace: "retain-on-failure",
    locale: "en-US",
  },
  projects: [
    { name: "e2e", testDir: "tests/e2e" },
    { name: "a11y", testDir: "tests/a11y" },
  ],
  webServer: {
    command: "bash scripts/start-test-server.sh",
    url: "http://127.0.0.1:3999/api/auth/me",
    reuseExistingServer: true,
    timeout: 600_000,
  },
});
