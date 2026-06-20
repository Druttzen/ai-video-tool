import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("opensora_inference_support", () => {
  it("wraps inference with torchrun --standalone for distributed init", () => {
    const scriptsDir = path.join(process.cwd(), "scripts");
    const snippet = [
      "import sys",
      `sys.path.insert(0, ${JSON.stringify(scriptsDir)})`,
      "from opensora_inference_support import opensora_inference_argv",
      "print(' '.join(opensora_inference_argv(sys.executable, ['scripts/diffusion/inference.py', 'cfg.py'])))",
    ].join("; ");
    const out = execFileSync("python", ["-c", snippet], { encoding: "utf8" }).trim();
    expect(out).toContain("--standalone");
    expect(out).toMatch(/--nproc_per_node(=1|\s+1)/);
    expect(out).toContain("scripts/diffusion/inference.py");
  });
});
