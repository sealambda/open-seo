import { describe, expect, it } from "vitest";
import { validateAppMetadata } from "./aso-metadata-rules";

const codes = (report: ReturnType<typeof validateAppMetadata>) =>
  report.issues.map((issue) => issue.code);

describe("validateAppMetadata: App Store", () => {
  it("measures the keyword field in UTF-8 bytes, not characters", () => {
    // 60 characters, 120 bytes.
    const keywords = "ü".repeat(60);
    const report = validateAppMetadata({ store: "app_store", keywords });

    expect(report.fields).toEqual([
      {
        field: "keywords",
        length: 120,
        limit: 100,
        unit: "bytes",
        remaining: -20,
      },
    ]);
    expect(codes(report)).toContain("over_limit");
  });

  it("flags keyword-field waste", () => {
    const report = validateAppMetadata({
      store: "app_store",
      name: "Streaks: Habit Tracker",
      subtitle: "Daily routine planner",
      developerName: "Crunchy Bagel",
      keywords: "habit, goals,routine,bagel,tv,goal,,",
    });

    const message = (code: string) =>
      report.issues.find((issue) => issue.code === code)?.message;
    expect(message("spaces_around_commas")).toContain("waste 1 byte;");
    expect(message("empty_entry")).toBeDefined();
    expect(message("entry_too_short")).toContain(": tv.");
    expect(message("repeats_name")).toContain(": habit, bagel.");
    expect(message("repeats_subtitle")).toContain(": routine.");
    expect(message("possible_plural")).toContain("goals/goal");
  });

  it("covers a phrase whose words are spread across fields", () => {
    const report = validateAppMetadata({
      store: "app_store",
      name: "Streaks",
      subtitle: "Habit tracker",
      keywords: "routine,daily",
      targetKeywords: ["daily habit tracker", "habit tracker for adhd"],
    });

    expect(report.coverage).toEqual([
      {
        keyword: "daily habit tracker",
        covered: true,
        missingTokens: [],
        fields: ["subtitle", "keywords"],
      },
      {
        keyword: "habit tracker for adhd",
        covered: false,
        missingTokens: ["for", "adhd"],
        fields: ["subtitle"],
      },
    ]);
  });
});

describe("validateAppMetadata: Google Play", () => {
  it("applies title-only policy terms to the title alone", () => {
    const report = validateAppMetadata({
      store: "google_play",
      name: "#1 Habit Tracker",
      fullDescription: "Free to start. Track every habit.",
    });

    expect(report.issues).toEqual([
      expect.objectContaining({ field: "name", code: "performance_claim" }),
    ]);
  });

  it("needs the whole phrase in one field and flags repetition", () => {
    const report = validateAppMetadata({
      store: "google_play",
      name: "Habit Tracker",
      shortDescription: "Build a daily routine. Daily routine, done.",
      targetKeywords: ["daily routine", "habit routine"],
    });

    expect(
      report.coverage.map((c) => [c.keyword, c.covered, c.fields]),
    ).toEqual([
      ["daily routine", true, ["shortDescription"]],
      ["habit routine", false, []],
    ]);
    expect(report.issues).toEqual([
      expect.objectContaining({
        field: "shortDescription",
        code: "repeated_keyword",
      }),
    ]);
  });
});
