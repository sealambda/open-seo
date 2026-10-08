import type { WorkflowStep } from "cloudflare:workers";
import { fetchAppLinkFiles } from "@/server/lib/audit/app-link-fetch";
import { NO_APP_SIGNALS } from "@/server/lib/audit/app-signals";
import { appLinkFileIssues } from "@/server/lib/audit/issues/app-link-files";
import type { DetectedIssue } from "@/server/lib/audit/issues/page-reporters";
import { APP_LINK_FILES_STEP } from "@/server/workflows/auditStepConfigs";
import { pgStep } from "@/server/workflows/pgStep";
import {
  runCrawlPhase,
  type CrawlPhaseResult as CrawlResult,
} from "@/server/workflows/siteAuditWorkflowCrawl";

export type CrawlPhaseResult = CrawlResult & {
  /** Site-level issues from the app link files and the crawl's app signals. */
  appLinkIssues: DetectedIssue[];
};

/**
 * The crawl, then the app link files. The fetch is its own step so the
 * verdicts are checkpointed; it never throws.
 */
export async function runCrawlAndAppLinks(
  step: WorkflowStep,
  params: Parameters<typeof runCrawlPhase>[1],
): Promise<CrawlPhaseResult> {
  const crawl = await runCrawlPhase(step, params);
  const { origin } = params;
  const verdicts = await pgStep(
    step,
    "app-link-files",
    APP_LINK_FILES_STEP,
    () => fetchAppLinkFiles(origin, params.access),
  );
  const appLinkIssues = appLinkFileIssues({
    origin,
    signals: crawl.appSignals ?? NO_APP_SIGNALS,
    verdicts,
  });
  return { ...crawl, appLinkIssues };
}
