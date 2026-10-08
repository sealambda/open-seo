import { describe, expect, it } from "vitest";
import { NO_APP_SIGNALS } from "@/server/lib/audit/app-signals";
import { appLinkFileIssues } from "./app-link-files";

const origin = "https://example.com";

describe("appLinkFileIssues", () => {
  it("raises nothing for a site with no app and no app link files", () => {
    expect(
      appLinkFileIssues({
        origin,
        signals: NO_APP_SIGNALS,
        verdicts: {
          appleAppSiteAssociation: { status: "missing" },
          assetlinks: { status: "missing" },
        },
      }),
    ).toEqual([]);
  });

  it("reports broken files always and missing ones only for a promoted platform", () => {
    const issues = appLinkFileIssues({
      origin,
      signals: { ios: `${origin}/download`, android: null },
      verdicts: {
        appleAppSiteAssociation: { status: "missing" },
        assetlinks: { status: "invalid", problem: "not valid JSON" },
      },
    });

    expect(issues).toEqual([
      {
        issueType: "apple-app-site-association-missing",
        pageId: null,
        pageUrl: `${origin}/.well-known/apple-app-site-association`,
        details: { appPromotedOn: `${origin}/download` },
      },
      {
        issueType: "assetlinks-invalid",
        pageId: null,
        pageUrl: `${origin}/.well-known/assetlinks.json`,
        details: { problem: "not valid JSON" },
      },
    ]);
  });
});
