import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadAgentSessionFile,
  saveAgentSessionFile,
  sessionFileForUserData,
} from "../scripts/lib/agent-session-storage.cjs";

describe("agent-session-storage", () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "agent-session-"));

  afterEach(() => {
    const fp = sessionFileForUserData(userData);
    try {
      fs.unlinkSync(fp);
    } catch {
      /* ignore */
    }
  });

  it("returns null session when file is missing", () => {
    const res = loadAgentSessionFile(userData);
    expect(res.ok).toBe(true);
    expect(res.session).toBeNull();
    expect(res.path).toMatch(/video-prep-agent-session\.json$/);
  });

  it("round-trips session JSON", () => {
    const payload = {
      messages: [{ role: "user", content: "Build a neon MV" }],
      updatedAt: Date.now(),
    };
    const saved = saveAgentSessionFile(userData, payload);
    expect(saved.ok).toBe(true);

    const loaded = loadAgentSessionFile(userData);
    expect(loaded.ok).toBe(true);
    expect(loaded.session.messages).toHaveLength(1);
    expect(loaded.session.messages[0].content).toBe("Build a neon MV");
  });
});
