import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { execLocal } from "../scripts/lib/process-exec.cjs";

describe("process-exec", () => {
  it("execLocal runs executables under paths with spaces", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai video creator "));
    const shimDir = path.join(root, "fake python");
    fs.mkdirSync(shimDir, { recursive: true });
    const shim = path.join(shimDir, "probe.py");
    fs.writeFileSync(
      shim,
      "import sys\nif '--version' in sys.argv: print('Python 3.11.9')\n",
      "utf8",
    );

    const python = process.platform === "win32" ? "python" : "python3";
    const { stdout } = await execLocal(python, [shim, "--version"], { timeout: 10000 });
    expect(String(stdout)).toMatch(/3\.11\.9/);
  });
});
