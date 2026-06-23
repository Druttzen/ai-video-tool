import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import { createSetupInstallProgressBridge } from "../scripts/lib/setup-install-progress-bridge.cjs";

describe("setup-install-progress-bridge", () => {
  it("streams formatted progress payloads to renderer IPC", () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "setup-progress-bridge-"));
    const sent = [];
    const event = {
      sender: {
        isDestroyed: () => false,
        send: (_channel, payload) => sent.push(payload),
      },
    };

    const bridge = createSetupInstallProgressBridge(event, userData, { version: "1.0.27", openConsole: false });
    bridge.onProgress({ phase: "addon-start", addonId: "python", label: "Python", forceReinstall: true });
    bridge.finish({ ok: true, message: "All good" });

    expect(sent.some((row) => row.line && /INSTALL -> Python/.test(row.line))).toBe(true);
    expect(sent.some((row) => row.done && row.ok)).toBe(true);
    expect(fs.existsSync(path.join(userData, "setup-hub-install.log"))).toBe(true);
  });

  it("no-ops when sender is destroyed", () => {
    const send = vi.fn();
    const bridge = createSetupInstallProgressBridge(
      { sender: { isDestroyed: () => true, send } },
      fs.mkdtempSync(path.join(os.tmpdir(), "setup-progress-bridge-dead-")),
      { writeLog: false },
    );
    bridge.onProgress({ phase: "start", message: "hello" });
    expect(send).not.toHaveBeenCalled();
  });
});
