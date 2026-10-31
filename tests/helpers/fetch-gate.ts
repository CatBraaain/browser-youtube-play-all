import type { Page } from "@playwright/test";

export function installFetchGate(page: Page, gate: { delay?: string[]; abort?: string[] }) {
  return page.addInitScript((gate) => {
    function install() {
      document.documentElement.dataset.ytxFetchGate = JSON.stringify(gate);
    }
    if (document.documentElement) {
      install();
    } else {
      new MutationObserver((_, observer) => {
        if (document.documentElement) {
          install();
          observer.disconnect();
        }
      }).observe(document, { childList: true });
    }
  }, gate);
}

export function releaseFetchGate(page: Page) {
  return page.evaluate(() => delete document.documentElement.dataset.ytxFetchGate);
}
