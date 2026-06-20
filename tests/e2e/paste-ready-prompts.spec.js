import { test, expect } from "@playwright/test";
import {
  dismissSplash,
  loadFactoryPreset,
  lyricStylePanel,
  musicControlsPanel,
  promptPreviewPanel,
  selectSunoEngine,
  selectStandardEngine,
} from "./helpers.js";

const INTERNAL_STYLE_MARKERS = [/DNA:/, /\bsounds:/i, /^STYLE:/m, /^RULES:/m, /^SOUND:/m];
const INTERNAL_LYRICS_MARKERS = [/LYRIC STYLE/i, /^Language:/m];

async function expectPasteReadyStyle(pre) {
  await expect(pre).toBeVisible();
  const text = await pre.textContent();
  expect(text?.length).toBeGreaterThan(10);
  for (const pattern of INTERNAL_STYLE_MARKERS) {
    expect(text).not.toMatch(pattern);
  }
}

async function expectPasteReadyLyrics(pre) {
  await expect(pre).toBeVisible();
  const text = (await pre.textContent()) || "";
  for (const pattern of INTERNAL_LYRICS_MARKERS) {
    expect(text).not.toMatch(pattern);
  }
}

test.describe("paste-ready prompt previews e2e", () => {
  test("Director engine Prompt Preview uses structured narrative lyrics", async ({ page }) => {
    await dismissSplash(page);
    await selectStandardEngine(page);
    await loadFactoryPreset(page);

    const preview = promptPreviewPanel(page);
    await expectPasteReadyStyle(preview.getByTestId("prompt-preview-style"));
    await expect(preview.getByTestId("prompt-preview-style")).toContainText(/Cinematic/i);

    const lyrics = preview.getByTestId("prompt-preview-lyrics");
    await expect(lyrics).toBeVisible();
    await expect(lyrics).toContainText(/\[Theme:/i);
    await expect(lyrics).toContainText(/\[setup\]/i);
  });

  test("Sora-like Prompt Preview uses paste-ready Style and Lyrics blocks", async ({ page }) => {
    await dismissSplash(page);
    await selectSunoEngine(page);
    await loadFactoryPreset(page);

    const preview = promptPreviewPanel(page);
    await expectPasteReadyStyle(preview.getByTestId("prompt-preview-style"));
    await expectPasteReadyLyrics(preview.getByTestId("prompt-preview-lyrics"));
    await expect(preview.getByTestId("prompt-preview-style")).toContainText(/Cinematic/i);
  });

  test("Lyric Style panel preview uses narrative beat scaffold", async ({ page }) => {
    await dismissSplash(page);
    await musicControlsPanel(page).getByRole("button", { name: "Voiceover", exact: true }).click();

    const panel = lyricStylePanel(page);
    await panel.locator("label").filter({ hasText: "Narrative theme" }).locator("input").fill("night drive");

    const pre = panel.getByTestId("lyric-field-preview");
    await expect(pre).toBeVisible();
    const text = (await pre.textContent()) || "";
    expect(text).toContain("[Theme: night drive]");
    expect(text).toContain("[setup]");
    expect(text).not.toMatch(/select vocal mode/i);
  });

  test("Copy Prompt under Director engine includes cinematic style line", async ({ page, context }) => {
    await dismissSplash(page);
    await selectStandardEngine(page);
    await loadFactoryPreset(page);

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await promptPreviewPanel(page).getByRole("button", { name: "Copy Prompt" }).click();
    await expect(page.getByTestId("action-toast")).toContainText(/Prompt copied/i);

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toMatch(/Cinematic/i);
    for (const pattern of INTERNAL_STYLE_MARKERS) {
      expect(clipboard).not.toMatch(pattern);
    }
  });
});
