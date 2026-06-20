import fs from "node:fs";
import { test, expect } from "@playwright/test";
import {
  analyzerPanel,
  directorPanel,
  dismissSplash,
  lyricStylePanel,
  musicVideoPanel,
  readDirectorSettings,
} from "./helpers.js";

const ANALYZER_FIXTURE = "tests/fixtures/e2e-analyzer-tone.wav";
const IMAGE_FIXTURE = "tests/fixtures/e2e-analyzer-palette.png";

async function dropAudioAndImage(page) {
  const panel = analyzerPanel(page);
  await panel.scrollIntoViewIfNeeded();

  await panel.locator('input[type="file"][accept*="audio/wav"]').setInputFiles(ANALYZER_FIXTURE);
  await expect(panel.getByText("e2e-analyzer-tone.wav", { exact: true })).toBeVisible({
    timeout: 30000,
  });

  await panel.locator('input[type="file"][accept*="image/png"]').setInputFiles(IMAGE_FIXTURE);
  await expect(panel.getByRole("img", { name: "Image preview" })).toBeVisible({ timeout: 30000 });
}

async function expectBeatSyncMusicVideoState(page) {
  const directorSettings = await readDirectorSettings(page);
  expect(directorSettings?.useI2vWhenImage).toBe(true);
  expect(Number(directorSettings?.durationSeconds)).toBeGreaterThan(0);
  expect(Number(directorSettings?.durationSeconds)).toBeLessThanOrEqual(120);

  const lyricsPanel = lyricStylePanel(page);
  await lyricsPanel.scrollIntoViewIfNeeded();
  await expect(lyricsPanel.locator("textarea").first()).toContainText(/Beat grid/i);
}

async function expectDirectorI2vExport(page) {
  const director = directorPanel(page);
  await director.scrollIntoViewIfNeeded();
  await director.getByRole("button", { name: "Render", exact: true }).click();
  await expect(director.getByTestId("director-i2v-ref-ready")).toBeVisible();
  await expect(director.getByText(/Use reference image when loaded ✓/)).toBeVisible();

  const exportButton = director.getByTestId("send-director-job");
  await expect(exportButton).toBeEnabled();

  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const job = JSON.parse(fs.readFileSync(downloadPath, "utf8"));
  expect(job.i2v).toBe(true);
  expect(job.ref_image_name).toBe("e2e-analyzer-palette.png");
  expect(job.prompt).toMatch(/Duration \d/i);
}

test.describe("Audio + picture music video e2e", () => {
  test("Path E maps beat-sync fields, syncs duration, and exports i2v Director job", async ({
    page,
  }) => {
    await dismissSplash(page);
    await dropAudioAndImage(page);

    await analyzerPanel(page).getByTestId("apply-audio-visual-music-video-analyzers").click();
    await expect(page.getByTestId("action-toast")).toContainText(/beat-sync MV/i);
    await expect(directorPanel(page)).toBeInViewport({ timeout: 15000 });
    await expectBeatSyncMusicVideoState(page);
    await expectDirectorI2vExport(page);
  });

  test("Music Video Studio Path E button applies the same beat-sync plan", async ({ page }) => {
    await dismissSplash(page);
    await dropAudioAndImage(page);

    const studio = musicVideoPanel(page);
    await studio.scrollIntoViewIfNeeded();
    await studio.getByTestId("apply-audio-visual-music-video").click();
    await expect(page.getByTestId("action-toast")).toContainText(/beat-sync MV/i);
    await expect(directorPanel(page)).toBeInViewport({ timeout: 15000 });
    await expectBeatSyncMusicVideoState(page);
  });

  test("Workflow 5 run applies beat-sync plan and scrolls to Director", async ({ page }) => {
    await dismissSplash(page);
    await dropAudioAndImage(page);

    const workflows = page.getByTestId("music-video-workflows-panel");
    await workflows.scrollIntoViewIfNeeded();
    await workflows.getByTestId("workflow-run-5").click();

    await expect(page.getByTestId("action-toast")).toContainText(/Path 5 applied/i);
    await expect(directorPanel(page)).toBeInViewport({ timeout: 15000 });
    await expectBeatSyncMusicVideoState(page);
  });
});
