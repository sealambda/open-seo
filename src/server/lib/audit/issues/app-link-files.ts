/**
 * Site-level issues for the app link files. A file that exists but is broken
 * is always reported, since serving it at all says the site has an app. A
 * missing file is reported only when crawled pages promote that platform's
 * app; otherwise every site without an app would get the issue.
 */
import type { AppSignals } from "@/server/lib/audit/app-signals";
import type {
  AppLinkFileVerdict,
  AppLinkFileVerdicts,
} from "@/server/lib/audit/discovery";
import type { DetectedIssue } from "@/server/lib/audit/issues/page-reporters";
import type { AuditIssueType } from "@/shared/audit-issues";

const FILES = [
  {
    verdict: "appleAppSiteAssociation",
    signal: "ios",
    path: "/.well-known/apple-app-site-association",
    invalid: "apple-app-site-association-invalid",
    missing: "apple-app-site-association-missing",
  },
  {
    verdict: "assetlinks",
    signal: "android",
    path: "/.well-known/assetlinks.json",
    invalid: "assetlinks-invalid",
    missing: "assetlinks-missing",
  },
] as const satisfies ReadonlyArray<{
  verdict: keyof AppLinkFileVerdicts;
  signal: keyof AppSignals;
  path: string;
  invalid: AuditIssueType;
  missing: AuditIssueType;
}>;

export function appLinkFileIssues(input: {
  origin: string;
  signals: AppSignals;
  verdicts: AppLinkFileVerdicts;
}): DetectedIssue[] {
  return FILES.flatMap((file): DetectedIssue[] => {
    const verdict: AppLinkFileVerdict = input.verdicts[file.verdict];
    const pageUrl = `${input.origin}${file.path}`;
    if (verdict.status === "invalid") {
      return [
        {
          issueType: file.invalid,
          pageId: null,
          pageUrl,
          details: { problem: verdict.problem },
        },
      ];
    }
    const promotedOn = input.signals[file.signal];
    if (verdict.status === "missing" && promotedOn) {
      return [
        {
          issueType: file.missing,
          pageId: null,
          pageUrl,
          details: { appPromotedOn: promotedOn },
        },
      ];
    }
    return [];
  });
}
