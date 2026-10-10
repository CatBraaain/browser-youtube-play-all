import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const DesktopChrome = {
  name: "chrome-desktop",
  device: {
    ...devices["Desktop Chrome"],
    channel: "chromium",
  },
};
const MobileChrome = {
  name: "chrome-mobile",
  device: {
    ...devices["Pixel 5"],
    channel: "chromium",
  },
};
const DesktopFirefox = {
  name: "firefox-desktop",
  device: {
    ...devices["Desktop Firefox"],
    channel: "firefox",
  },
};

export default defineConfig({
  // Play All playlist navigation can take over 30s under load (observed 21-34s)
  timeout: 90_000,
  retries: 1,
  workers: 2,
  fullyParallel: true,
  use: { trace: "retain-on-failure" },
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    ...[DesktopChrome, MobileChrome, DesktopFirefox].map(({ name, device }) => ({
      name: `${name}-spec`,
      use: device,
      testDir: path.join(import.meta.dirname, "tests/specs"),
    })),
    ...[DesktopChrome, MobileChrome, DesktopFirefox].map(({ name, device }) => ({
      name: `${name}-e2e`,
      use: device,
      testDir: path.join(import.meta.dirname, "tests"),
      testMatch: ["e2e/**/*.test.ts", "review/**/*.test.ts"],
    })),
  ],
});
