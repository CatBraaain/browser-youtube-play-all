import { expect } from "@playwright/test";

import { ytxTest } from "../fixture";

for (const state of ["normal", "hover", "focus"] as const) {
  ytxTest(`Trace preserves the Play All background in the ${state} state`, async ({ page }) => {
    await page.goto(
      `data:text/html,${encodeURIComponent('<a class="play-all-btn" tabindex="0">Play All</a><button>Other target</button>')}`,
    );
    const button = page.locator(".play-all-btn").describe("Play All");
    if (state === "hover") await button.hover();
    if (state === "focus") {
      await ytxTest.step("Click Play All", () => button.click());
      await page.mouse.move(0, 0);
    }
    const originalBackground = await button.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    expect(originalBackground).not.toBe("rgba(0, 0, 0, 0)");
    const declaredBackground = await page.evaluate((currentState) => {
      const selector =
        currentState === "normal" ? ".play-all-btn" : `.play-all-btn:${currentState}`;
      const rule = Array.from(document.querySelectorAll("style"))
        .flatMap((style) => Array.from(style.sheet?.cssRules ?? []))
        .find(
          (rule): rule is CSSStyleRule =>
            rule instanceof CSSStyleRule &&
            rule.selectorText.split(",").some((part) => part.trim() === selector),
        );
      return {
        color: rule?.style.backgroundColor,
        priority: rule?.style.getPropertyPriority("background-color"),
      };
    }, state);
    expect(declaredBackground.priority).toBe("important");
    expect(originalBackground).toBe(declaredBackground.color);

    await button.evaluate((element) => {
      element.setAttribute("__playwright_target__", "");
      element.style.outline = "2px solid #006ab1";
      element.style.backgroundColor = "#6fa8dc7f";
    });
    await expect(button).toHaveCSS("background-color", originalBackground);
    await expect(button).toHaveCSS("outline-style", "none");

    const otherTarget = page.getByRole("button", { name: "Other target" }).describe("Other target");
    await otherTarget.evaluate((element) => {
      element.setAttribute("__playwright_target__", "");
      element.style.outline = "2px solid #006ab1";
      element.style.backgroundColor = "#6fa8dc7f";
    });
    await ytxTest.step("Click Other target", () => otherTarget.click());
    await expect(otherTarget).toHaveCSS("outline", "rgb(0, 106, 177) solid 2px");
    await expect(otherTarget).toHaveCSS("background-color", "rgba(111, 168, 220, 0.498)");
  });
}
