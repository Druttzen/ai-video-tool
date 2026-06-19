import { describe, expect, it } from "vitest";
import { getPanelHelp, PANEL_HELP } from "../app/lib/panel-help.js";

describe("panel-help", () => {
  it("has help for all major panels", () => {
    expect(PANEL_HELP.global).toBeDefined();
    expect(PANEL_HELP.workflows).toBeDefined();
    expect(PANEL_HELP.manuscript).toBeDefined();
    expect(PANEL_HELP.director).toBeDefined();
  });

  it("getPanelHelp falls back to global", () => {
    expect(getPanelHelp("unknown-topic").title).toBe("Project actions");
  });
});
