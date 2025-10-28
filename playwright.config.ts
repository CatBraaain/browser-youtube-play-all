import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  workers: 2,
  fullyParallel: true,
  projects: [
    {
      name: "chromium-spec",
      use: devices["Desktop Chrome"],
      testDir: path.join(import.meta.dirname, "tests/specs"),
    },
    {
      name: "firefox-spec",
      use: {
        ...devices["Desktop Firefox"],
        launchOptions: {
          firefoxUserPrefs: {
            "media.autoplay.blocking_policy": 2, // altearnative to --mute-audio
          },
        },
      },
      testDir: path.join(import.meta.dirname, "tests/specs"),
    },
    {
      name: "chromium-e2e",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium",
      },
      testDir: path.join(import.meta.dirname, "tests/e2e"),
    },
  ],
});
