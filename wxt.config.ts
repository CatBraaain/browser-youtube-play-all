import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  outDir: "dist",
  imports: false,
  manifest: ({ browser }) => ({
    name: "Youtube Play All",
  }),
  zip: {
    artifactTemplate: "{{browser}}.zip",
    sourcesTemplate: "sources.zip",
  },
});
