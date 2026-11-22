import { describe, expect, it } from "vitest";
import { instructionsFor } from "./prompt";

describe("assistant instructions", () => {
  it("say the inbox can't be read, whatever the message loads", () => {
    for (const groups of [[], ["records"], ["records", "actions"]] as const) {
      expect(instructionsFor({ name: "Asha", timezone: "Asia/Kolkata", groups })).toContain(
        "You can't read Asha's email inbox.",
      );
    }
  });
});
