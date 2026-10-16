// Post-processes the generated Playwright HTML report:
// 1. The trace viewer's Attachments tab renders the review screenshots as a
//    wide horizontal strip.
// 2. The height of the bottom pane (where the Attachments tab lives) is seeded
//    at 70% of the viewport, and the Attachments tab is seeded as the
//    initially selected tab.
// Playwright regenerates the whole report on every run, so "test:review" runs
// this script right after the test run (see "patch:report" in package.json).
// The patch keys off the existing ".attachments-tab" class; when a Playwright
// update removes or renames it, this script fails loudly instead of producing
// a silently unpatched report.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const marker = "review-attachments-strip";
const reportDir = path.join(import.meta.dirname, "../playwright-report");
const traceDir = path.join(reportDir, "trace");

// 1. Horizontal strip for the Attachments tab.
const target = readdirSync(traceDir)
  .filter((file) => file.endsWith(".css"))
  .map((file) => path.join(traceDir, file))
  .find((file) => readFileSync(file, "utf8").includes(".attachments-tab"));

if (!target) {
  console.error(
    `patch:report: no stylesheet containing .attachments-tab under playwright-report/trace; run the tests first`,
  );
  process.exit(1);
}

const css = readFileSync(target, "utf8");
if (css.includes(marker)) {
  console.log(`patch:report: ${path.basename(target)} is already patched`);
} else {
  const stripCss = `
/* ${marker}: added by scripts/patch-report.ts */
.attachments-tab{display:flex;flex-direction:row;align-items:stretch;gap:4px;overflow-x:auto;overflow-y:hidden}
.attachments-tab>.attachments-section{display:none}
.attachment-item{flex:none;display:flex;flex-direction:column-reverse;margin:0}
.attachment-item>div:first-child{flex:0 0 auto;min-height:0;height:calc(100% - 20px);display:flex}
.attachment-item>div:last-child{flex:0 0 auto;height:20px;line-height:20px;font-weight:600;overflow:hidden;white-space:nowrap}
.attachment-item img{min-height:0;height:100%;width:auto;max-width:none;max-height:none}
`;

  writeFileSync(target, css + stripCss);
  console.log(`patch:report: patched ${path.basename(target)}`);
}

// 2. Seed the bottom pane height (propertiesSidebar.vertical:size) at 50% of
// the viewport. The setting lives in localStorage per origin, and report URLs
// use a random port, so without a seed every run starts at the Playwright
// default. Only written when unset: manual resizer drags win.
const reportIndex = path.join(reportDir, "index.html");
const seedScript = `
<script>
// ${marker}: added by scripts/patch-report.ts
(function () {
  try {
    var key = "propertiesSidebar.vertical:size";
    if (!localStorage.getItem(key)) {
      var initial = Math.round(window.innerHeight * 0.5 * window.devicePixelRatio);
      localStorage.setItem(key, String(initial));
    }
    var tabKey = "propertiesTab";
    if (!localStorage.getItem(tabKey)) {
      localStorage.setItem(tabKey, JSON.stringify("attachments"));
    }
  } catch (error) {}
})();
</script>`;

const html = readFileSync(reportIndex, "utf8");
if (html.includes(marker)) {
  console.log("patch:report: index.html is already patched");
} else if (!html.includes("<head>")) {
  console.error("patch:report: index.html has no <head> to inject into");
  process.exit(1);
} else {
  writeFileSync(reportIndex, html.replace("<head>", `<head>${seedScript}`));
  console.log("patch:report: seeded pane height and initial tab into index.html");
}

// 3. Match each attachment item's box to its screenshot's aspect ratio. Flex
// computes the item's width from the image's intrinsic pixel size, and
// device-pixel-ratio-scaled screenshots are several times wider than they
// render, so without this the row keeps large gaps between images. An
// explicit aspect ratio on the item (whose height is the pane height)
// collapses the box to the rendered size.
const traceIndex = path.join(traceDir, "index.html");
const fitScript = `
<script>
// ${marker}: added by scripts/patch-report.ts
(function () {
  function fit() {
    document.querySelectorAll(".attachments-tab .attachment-item").forEach(function (item) {
      var img = item.querySelector("img");
      if (img && img.naturalWidth) {
        var ratio = img.naturalWidth + " / " + img.naturalHeight;
        if (item.style.aspectRatio !== ratio) item.style.aspectRatio = ratio;
      }
    });
  }
  new MutationObserver(fit).observe(document.body, { childList: true, subtree: true });
  setInterval(fit, 1000);
})();
</script>`;

const traceHtml = readFileSync(traceIndex, "utf8");
if (traceHtml.includes(marker)) {
  console.log("patch:report: trace/index.html is already patched");
} else if (!traceHtml.includes("</body>")) {
  console.error("patch:report: trace/index.html has no </body> to inject into");
  process.exit(1);
} else {
  writeFileSync(traceIndex, traceHtml.replace("</body>", `${fitScript}</body>`));
  console.log("patch:report: seeded item aspect ratio into trace/index.html");
}
