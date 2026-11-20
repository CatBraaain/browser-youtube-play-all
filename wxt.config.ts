import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  outDir: "dist",
  imports: false,
  manifest: ({ browser }) => ({
    name: "Youtube Play All",
    // Firefox submission requirements. The ID matches the published AMO add-on.
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "{f082384d-0ec3-4a0a-a2d1-3261bb1b8d8e}",
              data_collection_permissions: {
                required: ["none"],
              },
            },
          },
        }
      : {}),
  }),
  zip: {
    artifactTemplate: "{{browser}}.zip",
    sourcesTemplate: "sources.zip",
    excludeSources: ["screenshots/**", "test-results/**", "tests/**"],
  },
});
