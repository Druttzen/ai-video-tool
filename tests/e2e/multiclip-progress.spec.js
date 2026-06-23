import { test, expect } from "@playwright/test";
import { dismissSplash } from "./helpers.js";

const BUNDLE_FIXTURE = "tests/fixtures/music-handoff-path-e.aivbundle.json";

const MULTI_CLIP_PRODUCTION = {
  phase: "rendering",
  multiClip: true,
  clipTotal: 4,
  clipCurrent: 3,
  clipsRendered: 2,
  clipStatus: "rendering",
  clipLabel: "Clip 3/4: 5s (10s–15s)",
  multiClipNote: "Beat-sync plan: rendering 4 of 4 segments (cap 8)",
  renderMessage: "Rendering segment…",
};

async function seedMulticlipProduction(page) {
  await page.waitForFunction(() => Boolean(window.__videoPrepAgentE2E));
  await page.evaluate(
    ({ production }) => {
      window.__videoPrepAgentE2E?.seedProduction(production, {
        patchApplied: true,
        directorReady: true,
      });
    },
    { production: MULTI_CLIP_PRODUCTION },
  );
  await page.waitForFunction(() => {
    const btn = document.querySelector('[data-testid="video-prep-produce"]');
    return btn?.textContent?.includes("Producing clip");
  });
}

test.describe("Multi-clip production progress UI", () => {
  test("shows beat-sync progress bar in Prep Agent panel", async ({ page }) => {
    await dismissSplash(page);
    await page.getByTestId("manuscript-chat-panel").scrollIntoViewIfNeeded();
    await seedMulticlipProduction(page);
    const bar = page.getByTestId("video-prep-multiclip-progress");
    await expect(bar).toBeVisible({ timeout: 10000 });
    await expect(bar).toContainText("2/4 rendered");
    await expect(bar).toContainText("active 3/4");
    await expect(bar).toContainText("Clip 3/4");
    await expect(page.getByTestId("video-prep-multiclip-progress-bar")).toBeVisible();
    await expect(page.getByTestId("video-prep-produce")).toContainText("Producing clip 3/4");
  });

  test("imports handoff fixture with 4-segment clip plan", async ({ page }) => {
    await dismissSplash(page);
    await page.locator("#global-import-bundle").setInputFiles(BUNDLE_FIXTURE);
    await expect(page.getByTestId("action-toast")).toContainText(/Imported project bundle/i, {
      timeout: 15000,
    });
    await expect(page.getByTestId("music-video-panel")).toBeVisible();
  });
});
