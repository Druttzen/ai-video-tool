import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("electron packaging files", () => {
  it("includes every main-process script required at startup", () => {
    const root = path.join(import.meta.dirname, "..");
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const files = new Set(pkg.build?.files || []);
    const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8");
    const requires = [...mainSrc.matchAll(/require\("\.\/([^"]+)"\)/g)].map((m) => m[1]);

    for (const rel of requires) {
      if (rel === "package.json") continue;
      expect(files.has(rel), `missing from build.files: ${rel}`).toBe(true);
    }
  });
});
