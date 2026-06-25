import { test, expect } from "@playwright/test";
import { dismissSplash } from "./helpers.js";

const BUNDLE_FIXTURE = "tests/fixtures/music-handoff-path-e.aivbundle.json";

test.describe("Analyzers build plan", () => {
  test("shows build plan after handoff bundle import", async ({ page }) => {
    await dismissSplash(page);
    await page.locator("#global-import-bundle").setInputFiles(BUNDLE_FIXTURE);
    await expect(page.getByTestId("action-toast")).toContainText(/Imported project bundle/i, {
      timeout: 15000,
    });
    await page.getByTestId("analyzers-panel").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("analyzers-dashboard")).toBeVisible();
    await expect(page.getByTestId("analyzers-build-plan")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("analyzers-apply-build-plan")).toBeEnabled();
  });
});
