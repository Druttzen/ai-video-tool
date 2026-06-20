import { describe, expect, it } from "vitest";
import { normalizeUnixScript, windowsPathToWsl } from "../scripts/lib/addon-platform.cjs";

describe("addon-platform", () => {
  it("normalizeUnixScript strips carriage returns", () => {
    expect(normalizeUnixScript("#!/bin/bash\r\nset -euo pipefail\r")).toBe("#!/bin/bash\nset -euo pipefail");
  });

  it("windowsPathToWsl maps drive paths to /mnt", () => {
    const wsl = windowsPathToWsl("C:\\Users\\micke\\AppData\\Roaming\\AI Video Creator\\addons");
    expect(wsl).toBe("/mnt/c/Users/micke/AppData/Roaming/AI Video Creator/addons");
  });

  it("windowsPathToWsl maps lowercase drive letters", () => {
    expect(windowsPathToWsl("d:\\data\\addons")).toBe("/mnt/d/data/addons");
  });
});
