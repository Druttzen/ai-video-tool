import { test, expect } from "@playwright/test";
import {
  acceptNextConfirm,
  clearProjectStorage,
  dismissSplash,
  expectToast,
  ideaInput,
  importBundleFile,
  loadFactoryPreset,
  musicControlsPanel,
  saveLoadPanel,
  skipSplashIfVisible,
  STORAGE_KEY,
  voiceCharacterStudioPanel,
} from "./helpers.js";

const IMPORT_FIXTURE = "tests/fixtures/e2e-import-project.json";

test.describe("Project persistence e2e", () => {
  test.beforeEach(async ({ page }) => {
    await clearProjectStorage(page);
  });

  test("Import JSON restores fixture fields in the UI", async ({ page }) => {
    await dismissSplash(page);

    await importBundleFile(page, IMPORT_FIXTURE);

    await expectToast(page, /Imported project bundle/i);
    await expect(ideaInput(page)).toHaveValue("Imported from P14 fixture");

    const controls = musicControlsPanel(page);
    const cinematic = controls.getByRole("button", { name: "Cinematic", exact: true });
    await expect(cinematic).toHaveClass(/border-cyan-300/);
    await expect(controls.getByRole("button", { name: "Voiceover", exact: true })).toHaveClass(
      /border-cyan-300/,
    );
  });

  test("Revert to last snapshot restores state captured before preset load", async ({ page }) => {
    await dismissSplash(page);

    await importBundleFile(page, IMPORT_FIXTURE);
    await expect(ideaInput(page)).toHaveValue("Imported from P14 fixture");

    const controls = musicControlsPanel(page);
    const cinematic = controls.getByRole("button", { name: "Cinematic", exact: true });
    await expect(cinematic).toHaveClass(/border-cyan-300/);

    await loadFactoryPreset(page, "Neon Night Chase");
    await expectToast(page, /Loaded preset:/i);

    const noir = controls.getByRole("button", { name: "Noir", exact: true });
    await expect(noir).toHaveClass(/border-cyan-300/);
    await expect(cinematic).toHaveClass(/border-cyan-300/);
    await expect(ideaInput(page)).toHaveValue("Imported from P14 fixture");

    await saveLoadPanel(page).getByRole("button", { name: "Revert to last snapshot" }).click();
    await expectToast(page, /Reverted to last snapshot/i);

    await expect(cinematic).toHaveClass(/border-cyan-300/);
    await expect(noir).not.toHaveClass(/border-cyan-300/);
    await expect(ideaInput(page)).toHaveValue("Imported from P14 fixture");
  });

  test("Autosave persists edits across reload", async ({ page }) => {
    await dismissSplash(page);

    const marker = "Autosave reload marker P14";
    await ideaInput(page).fill(marker);

    await expect(page.locator("header").getByText(/Autosaved at/i)).toBeVisible({ timeout: 5000 });

    const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(stored).toContain(marker);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await skipSplashIfVisible(page);

    await expect(ideaInput(page)).toHaveValue(marker, { timeout: 5000 });
  });

  test("project JSON with characterVoicePresets survives reload", async ({ page }) => {
    const fixture = "tests/fixtures/e2e-import-project-with-character-presets.json";

    await dismissSplash(page);

    await importBundleFile(page, fixture);
    await expectToast(page, /Imported project bundle/i);
    await expect(ideaInput(page)).toHaveValue("Imported with character voice presets");

    const studio = voiceCharacterStudioPanel(page);
    await studio.scrollIntoViewIfNeeded();
    await expect(studio.getByText("E2E Narrator", { exact: true })).toBeVisible();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await skipSplashIfVisible(page);

    await expect(studio.getByText("E2E Narrator", { exact: true })).toBeVisible({ timeout: 5000 });
  });

  test("revert snapshot restores project state before character preset import", async ({ page }) => {
    await dismissSplash(page);

    await importBundleFile(page, IMPORT_FIXTURE);
    await expect(ideaInput(page)).toHaveValue("Imported from P14 fixture");

    const studio = voiceCharacterStudioPanel(page);
    await studio.scrollIntoViewIfNeeded();
    await studio
      .locator('input[type="file"][accept="application/json"]')
      .setInputFiles("tests/fixtures/e2e-character-voice-presets.json");
    await expectToast(page, /Imported 1 character preset/i);
    await expect(studio.getByText("E2E Narrator", { exact: true })).toBeVisible();

    await saveLoadPanel(page).getByRole("button", { name: "Revert to last snapshot" }).click();
    await expectToast(page, /Reverted to last snapshot/i);

    await expect(studio.getByText("E2E Narrator", { exact: true })).not.toBeVisible();
    await expect(ideaInput(page)).toHaveValue("Imported from P14 fixture");
  });

  test("project JSON with characterVoiceStudioSession restores studio UI after reload", async ({ page }) => {
    const fixture = "tests/fixtures/e2e-import-project-with-character-presets.json";

    await dismissSplash(page);

    await importBundleFile(page, fixture);
    await expectToast(page, /Imported project bundle/i);

    const studio = voiceCharacterStudioPanel(page);
    await studio.scrollIntoViewIfNeeded();
    await expect(studio.locator(".font-bold.text-cyan-200")).toContainText(/baritone register/i);
    await expect(studio.locator('input[placeholder="e.g. Warm baritone narrator"]')).toHaveValue("E2E Narrator");
    await expect(studio.getByPlaceholder(/youtube\.com\/watch/i)).toHaveValue(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );

    await page.reload();
    await page.waitForLoadState("networkidle");
    await skipSplashIfVisible(page);

    await expect(studio.locator(".font-bold.text-cyan-200")).toContainText(/baritone register/i, {
      timeout: 5000,
    });
    await expect(studio.locator('input[placeholder="e.g. Warm baritone narrator"]')).toHaveValue("E2E Narrator");
    await expect(studio.getByPlaceholder(/youtube\.com\/watch/i)).toHaveValue(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  test("Reset to Default clears voice studio session but keeps saved character presets", async ({ page }) => {
    const fixture = "tests/fixtures/e2e-import-project-with-character-presets.json";

    await dismissSplash(page);

    await importBundleFile(page, fixture);
    await expectToast(page, /Imported project bundle/i);

    const studio = voiceCharacterStudioPanel(page);
    await studio.scrollIntoViewIfNeeded();
    await expect(studio.locator(".font-bold.text-cyan-200")).toContainText(/baritone register/i);
    await expect(studio.getByText("E2E Narrator", { exact: true })).toBeVisible();

    acceptNextConfirm(page);
    await page.getByRole("button", { name: "Reset to Default" }).click();
    await expect(page.locator("header").getByText(/blank slate on guided step 1/i)).toBeVisible();

    await expect(studio.locator(".font-bold.text-cyan-200")).toHaveCount(0);
    await expect(studio.locator('input[placeholder="e.g. Warm baritone narrator"]')).toHaveValue("");
    await expect(studio.getByPlaceholder(/youtube\.com\/watch/i)).toHaveValue("");
    await expect(studio.getByText("E2E Narrator", { exact: true })).toBeVisible();
  });
});
