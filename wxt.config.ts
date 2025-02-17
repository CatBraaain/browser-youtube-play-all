import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  outDir: "dist",
  imports: false,
  extensionApi: "chrome",
  manifest: ({ browser }) => ({
    name: "Youtube Play All",
    web_accessible_resources: [
      {
        resources: ["injection.js"],
        matches: ["https://www.youtube.com/*"],
      },
    ],
  }),
  zip: {
    artifactTemplate: "{{browser}}.zip",
    sourcesTemplate: "sources.zip",
  },
});
