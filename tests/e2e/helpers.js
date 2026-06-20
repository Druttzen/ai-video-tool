import { expect } from "@playwright/test";

/** Must match app/hooks/use-splash-seen.js */
export const SPLASH_SEEN_KEY = "ai_music_splash_seen";
export const FACTORY_PRESET = "Cinematic Opening";
export const STORAGE_KEY = "ai_video_creator_visual_tool_v1";
export const DIRECTOR_SETTINGS_KEY = "ai_video_creator_director_settings_v1";

export async function markSplashSeenInitScript(page) {
  await page.addInitScript((key) => {
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  }, SPLASH_SEEN_KEY);
}

export async function clearProjectStorage(page) {
  await page.addInitScript((splashKey) => {
    if (sessionStorage.getItem("__e2e_storage_cleared__")) return;
    localStorage.clear();
    try {
      sessionStorage.setItem(splashKey, "1");
    } catch {
      /* ignore */
    }
    sessionStorage.setItem("__e2e_storage_cleared__", "1");
  }, SPLASH_SEEN_KEY);
}

export async function dismissSplash(page) {
  await markSplashSeenInitScript(page);
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await waitForSplashClosed(page);
}

export async function skipSplashIfVisible(page) {
  await waitForSplashClosed(page);
}

async function waitForSplashClosed(page) {
  const skip = page.getByTestId("splash-skip-intro");
  const visible = await skip.isVisible({ timeout: 2500 }).catch(() => false);
  if (!visible) return;

  await skip.click({ force: true, timeout: 3000 }).catch(async () => {
    await page.keyboard.press("Escape").catch(() => {});
    await page.locator("body").click({ position: { x: 12, y: 12 }, force: true }).catch(() => {});
  });

  await skip.waitFor({ state: "hidden", timeout: 6000 }).catch(() => {});
}

/** Accept the next native confirm dialog (project reset). */
export function acceptNextConfirm(page) {
  page.once("dialog", (dialog) => dialog.accept());
}

export async function selectSunoEngine(page) {
  const coPanel = coProducerPanel(page);
  await coPanel.locator("label").filter({ hasText: "Prompt Engine" }).locator("select").selectOption("Sora-like");
}

export function analyzerPanel(page) {
  return page
    .locator("section.rounded-3xl")
    .filter({ has: page.getByRole("heading", { name: "Drag & Drop Analyzers" }) });
}

export function coProducerPanel(page) {
  return page
    .locator("section.rounded-3xl")
    .filter({ has: page.getByRole("heading", { name: "Co‑Producer AI", level: 2 }) });
}

export function saveLoadPanel(page) {
  return page
    .locator("section.rounded-3xl")
    .filter({ has: page.getByRole("heading", { name: "Save / Load", level: 2 }) });
}

export function ideaInput(page) {
  return page
    .locator("section.rounded-3xl")
    .filter({ has: page.getByRole("heading", { name: "Step 1 — Idea Input", level: 2 }) })
    .locator('input:not([type="checkbox"])')
    .first();
}

export function voiceCharacterStudioPanel(page) {
  return page.locator("section.rounded-3xl").filter({
    has: page.getByRole("heading", { name: "Voice Character Studio" }),
  });
}

export function musicControlsPanel(page) {
  return page
    .locator("section.rounded-3xl")
    .filter({ has: page.getByRole("heading", { name: "Step 3 — Visual Controls", level: 2 }) });
}

export function lyricStylePanel(page) {
  return page.locator("section.rounded-3xl").filter({
    has: page.getByRole("heading", { name: "Narrative Direction" }),
  });
}

export function directorPanel(page) {
  return page.getByTestId("director-panel");
}

export function musicVideoPanel(page) {
  return page.getByTestId("music-video-panel");
}

/** @returns {Promise<{ durationSeconds?: string, useI2vWhenImage?: boolean }|null>} */
export async function readDirectorSettings(page) {
  return page.evaluate((key) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, DIRECTOR_SETTINGS_KEY);
}

export function guidedSunoPanel(page) {
  return page.locator("section.rounded-3xl").filter({
    has: page.getByRole("navigation", { name: "Suno guided steps" }),
  });
}

export function promptPreviewPanel(page) {
  return page
    .locator("section.rounded-3xl")
    .filter({ has: page.getByRole("heading", { name: "Prompt Preview", level: 2 }) });
}

export function sunoReimportPanel(page) {
  return page.getByTestId("suno-reimport-panel");
}

export function styleDnaSearchPanel(page) {
  return page.getByTestId("style-dna-search-panel");
}

export async function selectDirectorEngine(page) {
  const coPanel = coProducerPanel(page);
  await coPanel.locator("label").filter({ hasText: "Prompt Engine" }).locator("select").selectOption("Director");
}

/** @deprecated use selectDirectorEngine — legacy alias for pre-video rename */
export async function selectStandardEngine(page) {
  return selectDirectorEngine(page);
}

export async function loadFactoryPreset(page, presetName = FACTORY_PRESET) {
  const presetsPanel = page
    .locator("section.rounded-3xl")
    .filter({ has: page.getByRole("heading", { name: "Style Presets", level: 2 }) });
  await presetsPanel.getByRole("button", { name: presetName, exact: true }).click();
}

export async function importBundleFile(page, fixturePath) {
  await page.locator("#global-import-bundle").setInputFiles(fixturePath);
}

export async function expectToast(page, textPattern) {
  const toast = page.getByTestId("action-toast");
  await expect(toast).toBeVisible();
  await expect(toast).toContainText(textPattern);
  await expect(toast).toHaveAttribute("data-toast-type", /.+/);
}

/** Assert Style + Lyrics copy after analyzer merge (clipboard permissions required). */
export async function expectSunoFieldCopies(page, context, { stylePattern }) {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  const toast = page.getByTestId("action-toast");
  const preview = promptPreviewPanel(page);
  await preview.getByRole("button", { name: "Copy Style box" }).click();
  await expect(toast).toContainText(/Suno Style box copied/i);
  const styleClipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(styleClipboard.length).toBeGreaterThan(20);
  expect(styleClipboard).toMatch(stylePattern);

  await lyricStylePanel(page).getByRole("button", { name: "Copy Lyrics field" }).click();
  await expect(toast).toContainText(/Suno Lyrics field copied/i);
  const lyricsClipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(lyricsClipboard.length).toBeGreaterThan(0);
}
