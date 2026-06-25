const { test, expect } = require("@playwright/test");
const { _electron: electron } = require("playwright");
const { existsSync } = require("fs");
const { join, resolve } = require("path");
const { execSync } = require("child_process");

const root = resolve(__dirname, "../..");
const indexPath = join(root, "out", "index.html");
const MULTI_CLIP_PRODUCTION = {
  phase: "rendering",
  multiClip: true,
  clipTotal: 4,
  clipCurrent: 2,
  clipsRendered: 1,
  clipStatus: "rendering",
  clipLabel: "Clip 2/4: 5s (5s–10s)",
  multiClipNote: "Beat-sync plan: rendering 4 of 4 segments (cap 8)",
};

test.describe("Electron live UI — multiclip progress", () => {
  test.skip(!process.env.E2E_ELECTRON, "Set E2E_ELECTRON=1 for live Electron UI tests");

  test.beforeAll(() => {
    if (process.env.E2E_FORCE_REBUILD === "1") return;
    if (!existsSync(indexPath)) {
      const env = { ...process.env, NEXT_PUBLIC_E2E_HOOKS: "1" };
      delete env.ELECTRON_RUN_AS_NODE;
      execSync("npm run build", {
        cwd: root,
        stdio: "inherit",
        env,
      });
    }
  });

  test("renders beat-sync progress bar in packaged Electron window", async () => {
    const launchEnv = {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    };
    delete launchEnv.ELECTRON_RUN_AS_NODE;

    const electronPath = require("electron");
    const app = await electron.launch({
      executablePath: electronPath,
      cwd: root,
      args: ["."],
      env: launchEnv,
    });

    try {
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForFunction(() => Boolean(window.__videoPrepAgentE2E), undefined, {
        timeout: 20000,
      });
      await page.evaluate(
        ({ production }) => {
          window.__videoPrepAgentE2E?.seedProduction(production, {
            patchApplied: true,
            directorReady: true,
          });
        },
        { production: MULTI_CLIP_PRODUCTION },
      );
      await page.getByTestId("manuscript-chat-panel").scrollIntoViewIfNeeded();
      const bar = page.getByTestId("video-prep-multiclip-progress");
      await expect(bar).toBeVisible({ timeout: 20000 });
      await expect(bar).toContainText("1/4 rendered");
      await expect(bar).toContainText("active 2/4");
    } finally {
      await app.close();
    }
  });
});
