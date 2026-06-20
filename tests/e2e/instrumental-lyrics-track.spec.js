import { test, expect } from "@playwright/test";
import {
  analyzerPanel,
  coProducerPanel,
  dismissSplash,
  lyricStylePanel,
  selectSunoEngine,
} from "./helpers.js";

const INSTRUMENTAL_FIXTURE = "tests/fixtures/e2e-instrumental-bed.wav";

test.describe("Instrumental track lyrics e2e", () => {
  test("drop instrumental audio and add timed lyrics scaffold", async ({ page }) => {
    await dismissSplash(page);

    const panel = analyzerPanel(page);
    await panel.scrollIntoViewIfNeeded();
    await panel.locator('input[type="file"][accept*="audio/wav"]').setInputFiles(INSTRUMENTAL_FIXTURE);

    await expect(panel.getByText("e2e-instrumental-bed.wav", { exact: true })).toBeVisible({
      timeout: 30000,
    });

    const addLyricsBtn = panel.getByRole("button", {
      name: "Add lyrics timed to this track →",
    });
    await expect(addLyricsBtn).toBeVisible({ timeout: 10000 });
    await addLyricsBtn.click();

    const toast = page.getByTestId("action-toast");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(/singable draft added/i);

    await expect(page.getByRole("heading", { name: /Suno path — Narrative beats \(6 \/ 8\)/ })).toBeVisible();

    const lyricPanel = lyricStylePanel(page);
    await expect(lyricPanel.locator("label").filter({ hasText: "Narrative theme" }).locator("input")).not.toHaveValue(
      "",
    );

    const lyricsBox = lyricPanel.locator("textarea").first();
    await expect(lyricsBox).toBeVisible();
    await expect(lyricsBox).toHaveValue(/\[Verse 1/);
    await expect(lyricsBox).toHaveValue(/\[Chorus/);
    await expect(lyricsBox).toHaveValue(/e2e-instrumental-bed\.wav/);

    await expect(
      coProducerPanel(page).locator("label").filter({ hasText: "Prompt Engine" }).locator("select"),
    ).toHaveValue("Sora-like");
  });
});
