import { test, expect } from "@playwright/test";
import { dismissSplash } from "./helpers.js";

test.describe("Setup Hub panel e2e", () => {
  test("shows module grid and scan button in browser mode", async ({ page }) => {
    await dismissSplash(page);
    const hub = page.getByTestId("setup-hub-panel");
    await expect(hub).toBeVisible();
    await expect(hub.getByTestId("setup-hub-scan")).toBeVisible();
    await expect(hub.getByTestId("setup-module-director")).toBeVisible();
    await expect(hub.getByTestId("setup-module-python")).toBeVisible();
    await hub.getByTestId("setup-hub-scan").click();
    await expect(hub.getByTestId("setup-hub-summary-label")).toContainText(
      /Core studio ready|Not scanned|local MP4/i,
    );
  });

  test("Open-Sora prompt studio and render panels are mounted", async ({ page }) => {
    await dismissSplash(page);
    await expect(page.getByTestId("open-sora-prompt-studio")).toBeVisible();
    await expect(page.getByTestId("open-sora-panel")).toBeVisible();
  });
});
