import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  workers: 2,
  fullyParallel: true,
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
    {
      name: "firefox",
      use: devices["Desktop Firefox"],
    },
  ],
});
