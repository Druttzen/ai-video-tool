import { describe, expect, it } from "vitest";
import {
  buildEtaUserMessage,
  estimateFinishAt,
  formatEstDateTime,
  formatLocalDateTime,
  isOnlyPipStackMissingIds,
} from "../scripts/lib/install-time-estimate.cjs";

describe("install-time-estimate", () => {
  it("formats local and Eastern timestamps", () => {
    const d = new Date("2026-06-25T15:30:45");
    expect(formatLocalDateTime(d)).toMatch(/2026-06-25 15:30:45/);
    expect(formatEstDateTime(d)).toMatch(/06\/25\/2026/);
  });

  it("builds ETA message with local and Eastern finish times", () => {
    const start = new Date("2026-06-25T10:00:00");
    const finish = estimateFinishAt({ pipOnly: true, fromDate: start });
    const msg = buildEtaUserMessage(finish, { pipOnly: true });
    expect(msg).toMatch(/pip stack/);
    expect(msg).toMatch(/local/);
  });

  it("detects pip-only missing ids", () => {
    expect(isOnlyPipStackMissingIds(["pip-deps", "music-video-sync"])).toBe(true);
    expect(isOnlyPipStackMissingIds(["python"])).toBe(false);
  });
});
