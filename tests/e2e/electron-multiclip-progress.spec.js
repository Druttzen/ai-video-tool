import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const indexPath = path.join(root, "out", "index.html");
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
    if (!fs.existsSync(indexPath)) {
      execSync("npm run build", {
        cwd: root,
        stdio: "inherit",
        env: { ...process.env, NEXT_PUBLIC_E2E_HOOKS: "1" },
      });
    }
  });

  test("renders beat-sync progress bar in packaged Electron window", async () => {
    const app = await electron.launch({
      args: [root],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      },
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
