import { describe, expect, it } from "vitest";
import { validateAppMetadataTool } from "./validate-app-metadata";

describe("validate_app_metadata", () => {
  it("rejects a field the chosen store doesn't have", () => {
    expect(() =>
      validateAppMetadataTool.handler({
        store: "google_play",
        name: "Habit Tracker",
        keywords: "habit,routine",
      }),
    ).toThrow(/Google Play listings have no keywords field/);
  });
});
