// Post-processes the generated Playwright HTML report:
// 1. The trace viewer's Attachments tab renders the review screenshots as a
//    wide horizontal strip.
// 2. The Attachments tab is seeded as the initially selected tab. The bottom
//    pane height is deliberately NOT seeded: a near-maximum seed keeps the
//    snapshot pane squeezed to ~10px, and every browser zoom change re-computes
//    the pane boundary, which read as the whole UI vibrating.
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
/* The film strip under the timeline grows by 50px when the async video
   thumbnail generation adds its lane after the trace opens; that growth
   changes the split pane's measured height and moves the pane boundary.
   Fix it at two lanes (one screencast page + one video, this project's
   review shape). */
.film-strip-lanes{height:100px}
/* Start the Attachments pane at full height without a height seed: a fixed
   small snapshot pane plus flex-grow on the sidebar keeps the bottom pane at
   "everything else", which stays stable across browser zoom changes. A near-
   maximum seed squeezed the snapshot pane to ~10px and re-moved the pane
   boundary on every zoom change, reading as the whole UI vibrating. */
.split-view.vertical>.split-view-main{flex:none;height:72px}
.split-view.vertical>.split-view-sidebar{flex-grow:1}
`;

  writeFileSync(target, css + stripCss);
  console.log(`patch:report: patched ${path.basename(target)}`);
}

// 2. Seed the Attachments tab as the initially selected tab. The bottom pane
//    height is deliberately left at the Playwright default: a 90% seed keeps
//    the snapshot pane squeezed to ~10px, and every browser zoom change
//    re-computes the pane boundary (`size = saved size / devicePixelRatio`),
//    which squeezed the pane away entirely and read as the whole UI vibrating.
const reportIndex = path.join(reportDir, "index.html");
const seedScript = `
<script>
// ${marker}: added by scripts/patch-report.ts
(function () {
  try {
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
  console.log("patch:report: seeded initial tab into index.html");
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
      // Dropdown captures have no category-and-sort pair; group them under
      // their own headings instead ("Members …" covers the members channel).
      // Only the first capture of each group takes the heading, so the two
      // shots of a dropdown stay side by side in the two-column grid.
      var heading = /^members-dropdown-collapsed$/.test(name)
        ? "Members Play All Buttons Dropdown"
        : /^dropdown-collapsed$/.test(name)
          ? "Play All Buttons Dropdown"
          : null;
      if (!heading && !/-button$/.test(name)) return;
      var previous = item.previousElementSibling;
      if (previous && previous.hasAttribute("data-review-pair-label")) return;
      var label = document.createElement("div");
      label.setAttribute("data-review-pair-label", "");
      label.textContent = heading || name
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
