import { test, expect } from "@playwright/test";
import { acceptNextConfirm, dismissSplash, ideaInput, musicControlsPanel, lyricStylePanel } from "./helpers.js";

test("Reset to Default clears preselected prompts to blank slate", async ({ page }) => {
  await dismissSplash(page);

  const idea = ideaInput(page);

  await idea.fill("My custom idea before reset");

  const controlsPanel = musicControlsPanel(page);
  const animePill = controlsPanel.getByRole("button", { name: "Anime", exact: true });
  await animePill.click();
  await expect(animePill).toHaveClass(/border-cyan-300/);

  const lyricPanel = lyricStylePanel(page);
  await lyricPanel
    .locator("label")
    .filter({ hasText: "Narrative theme" })
    .locator("input")
    .fill("My theme before reset");
  await controlsPanel.getByRole("button", { name: "Voiceover", exact: true }).click();
  await expect(lyricPanel.getByTestId("lyric-field-preview")).toContainText("My theme before reset");

  acceptNextConfirm(page);
  await page.getByRole("button", { name: "Reset to Default" }).click();

  await expect(idea).toHaveValue("");
  await expect(animePill).not.toHaveClass(/border-cyan-300/);
  await expect(page.locator("header").getByText(/blank slate on guided step 1/i)).toBeVisible();
  await expect(lyricPanel.getByTestId("lyric-field-preview")).toHaveText("");
  await expect(lyricPanel.getByText(/Set vocal mode and theme/i)).toBeVisible();
  await expect(
    lyricPanel.locator("label").filter({ hasText: "Narrative theme" }).locator("input"),
  ).toHaveValue("");
  await expect(controlsPanel.getByRole("button", { name: "Voiceover", exact: true })).not.toHaveClass(
    /border-cyan-300/,
  );
  await expect(lyricPanel.getByRole("button", { name: "Copy Generated Lyrics" })).toHaveCount(0);

  await page.reload();
  await dismissSplash(page);
  await expect(ideaInput(page)).toHaveValue("");
});
