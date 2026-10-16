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
.attachments-tab{display:flex;flex-wrap:wrap;gap:0 4px;align-content:flex-start;justify-content:center}
.attachments-tab>.attachments-section{display:none}
.attachment-item{display:flex;flex-direction:column;align-items:center;width:auto;max-width:calc(50% - 2px);margin:0}
.attachment-item>div:first-child{min-height:0;max-width:100%}
.attachment-item>div:last-child{display:none}
.attachments-tab>[data-review-pair-label]{flex-basis:100%;height:20px;line-height:20px;margin:16px 0;text-align:center;font-weight:600;overflow:hidden;white-space:nowrap}
/* Each pair's two images keep a shared visible height (45vh, matching the
   wide-image pairs that size by width) so tall and wide screenshots look
   alike; items shrink to the image width and center as a pair. */
.attachment-item img{display:block;width:auto;height:45vh;max-width:100%;object-fit:contain}
`;

  writeFileSync(target, css + stripCss);
  console.log(`patch:report: patched ${path.basename(target)}`);
}

// 2. Seed the bottom pane height (propertiesSidebar.vertical:size) near its
// maximum (90% of the viewport) so the screenshots grid gets as much vertical
// space as possible. The setting lives in localStorage per origin, and report
// URLs use a random port, so without a seed every run starts at the Playwright
// default. Only written when unset: manual resizer drags win.
const reportIndex = path.join(reportDir, "index.html");
const seedScript = `
<script>
// ${marker}: added by scripts/patch-report.ts
(function () {
  try {
    var key = "propertiesSidebar.vertical:size";
    if (!localStorage.getItem(key)) {
      var initial = Math.round(window.innerHeight * 0.9 * window.devicePixelRatio);
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

// 3. Show each pair's category and sort as a heading centered across the
// pair (for example, `Videos - Latest`). The heading is an inserted element
// spanning both screenshots, applied via MutationObserver because the trace
// viewer re-renders the tab on selection changes. The destination item's
// attachment name row stays hidden.
const traceIndex = path.join(traceDir, "index.html");
const labelScript = `
<script>
// ${marker}: added by scripts/patch-report.ts
(function () {
  function label() {
    document.querySelectorAll(".attachments-tab .attachment-item").forEach(function (item) {
      var name = item.querySelector("a") ? item.querySelector("a").textContent : "";
      if (!/-button$/.test(name)) return;
      var previous = item.previousElementSibling;
      if (previous && previous.hasAttribute("data-review-pair-label")) return;
      var label = document.createElement("div");
      label.setAttribute("data-review-pair-label", "");
      label.textContent = name
        .replace(/-button$/, "")
        .split("-")
        .map(function (part) { return part.charAt(0).toUpperCase() + part.slice(1); })
        .join(" - ");
      item.parentNode.insertBefore(label, item);
    });
  }
  new MutationObserver(label).observe(document.body, { childList: true, subtree: true });
  label();
})();
</script>`;

const traceHtml = readFileSync(traceIndex, "utf8");
if (traceHtml.includes(marker)) {
  console.log("patch:report: trace/index.html is already patched");
} else if (!traceHtml.includes("</body>")) {
  console.error("patch:report: trace/index.html has no </body> to inject into");
  process.exit(1);
} else {
  writeFileSync(traceIndex, traceHtml.replace("</body>", `${labelScript}</body>`));
  console.log("patch:report: seeded pair labels into trace/index.html");
}
