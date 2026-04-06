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
    launchOptions: {
      firefoxUserPrefs: {
        "media.autoplay.blocking_policy": 2, // altearnative to --mute-audio
      },
    },
  },
};

export default defineConfig({
  retries: 1,
  workers: 2,
  fullyParallel: true,
  projects: [
    ...[DesktopChrome, MobileChrome, DesktopFirefox].map(
      ({ name, device }) => ({
        name: `${name}-spec`,
        use: device,
        testDir: path.join(import.meta.dirname, "tests/specs"),
      }),
    ),
    ...[DesktopChrome, MobileChrome].map(({ name, device }) => ({
      name: `${name}-e2e`,
      use: device,
      testDir: path.join(import.meta.dirname, "tests/e2e"),
    })),
  ],
});
