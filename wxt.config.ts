import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  outDir: "dist",
  imports: false,
  extensionApi: "chrome",
  manifest: ({ browser }) => ({
    name: "Youtube Play All",
    ...(browser === "chrome"
      ? {
          host_permissions: ["https://www.youtube.com/*"],
        }
      : {}),
  }),
});
