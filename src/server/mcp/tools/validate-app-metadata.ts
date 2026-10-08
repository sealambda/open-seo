import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import {
  APP_STORE_FIELDS,
  APP_STORES,
  STORE_LABELS,
  validateAppMetadata,
  type AppMetadataInput,
  type AppMetadataReport,
} from "@/shared/aso-metadata-rules";

// Caps sit well above each store's limit so over-limit drafts still validate.
const inputSchema = {
  store: z.enum(APP_STORES).describe("Which store's rules to apply."),
  name: z
    .string()
    .max(300)
    .optional()
    .describe("App name (App Store) or title (Google Play)."),
  subtitle: z.string().max(300).optional().describe("App Store only."),
  keywords: z
    .string()
    .max(1000)
    .optional()
    .describe(
      'App Store only. The comma-separated keyword field from App Store Connect, e.g. "habit,routine,streak".',
    ),
  developerName: z
    .string()
    .max(300)
    .optional()
    .describe(
      "App Store only. The company name shown on the listing; Apple indexes it, so it counts toward coverage and shouldn't be repeated in keywords.",
    ),
  shortDescription: z
    .string()
    .max(800)
    .optional()
    .describe("Google Play only."),
  fullDescription: z
    .string()
    .max(40_000)
    .optional()
    .describe("Google Play only."),
  targetKeywords: z
    .array(z.string().min(1).max(100))
    .max(100)
    .optional()
    .describe(
      "Search phrases the listing should cover. Each comes back as covered or not, with the words that are missing.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

function toMetadataInput(args: Args): AppMetadataInput {
  const allowed: readonly string[] = APP_STORE_FIELDS[args.store];
  const misplaced = Object.entries(args)
    .filter(
      ([key, value]) =>
        value !== undefined &&
        !["store", "targetKeywords", ...allowed].includes(key),
    )
    .map(([key]) => key);
  if (misplaced.length > 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      `${STORE_LABELS[args.store]} listings have no ${misplaced.join(", ")} field. Accepted fields: ${allowed.join(", ")}.`,
    );
  }
  return args.store === "app_store"
    ? {
        store: "app_store",
        name: args.name,
        subtitle: args.subtitle,
        keywords: args.keywords,
        developerName: args.developerName,
        targetKeywords: args.targetKeywords,
      }
    : {
        store: "google_play",
        name: args.name,
        shortDescription: args.shortDescription,
        fullDescription: args.fullDescription,
        targetKeywords: args.targetKeywords,
      };
}

function countLabel(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatReport(report: AppMetadataReport) {
  const bySeverity = (severity: string) =>
    report.issues.filter((issue) => issue.severity === severity).length;
  const covered = report.coverage.filter((c) => c.covered);
  const lines = [
    `${STORE_LABELS[report.store]} listing: ${countLabel(bySeverity("error"), "error")}, ${countLabel(bySeverity("warning"), "warning")}, ${bySeverity("info")} info.`,
    "Fields:",
    ...report.fields.map(
      (f) =>
        `- ${f.field}: ${f.length}/${f.limit} ${f.unit}, ${f.remaining >= 0 ? `${f.remaining} left` : `${-f.remaining} over`}`,
    ),
  ];
  if (report.issues.length > 0) {
    lines.push(
      "Issues (store = published by the store, heuristic = common practice):",
      ...report.issues.map(
        (i) => `- ${i.severity} [${i.source}] ${i.field ?? ""}: ${i.message}`,
      ),
    );
  }
  if (report.coverage.length > 0) {
    lines.push(
      `Coverage: ${covered.length} of ${report.coverage.length} target keywords. ${report.coverageRule}`,
      ...report.coverage
        .filter((c) => !c.covered)
        .map(
          (c) =>
            `- not covered: "${c.keyword}"${c.missingTokens.length > 0 ? ` (missing: ${c.missingTokens.join(", ")})` : ""}`,
        ),
    );
    if (covered.length > 0) {
      lines.push(
        `- covered: ${covered.map((c) => `"${c.keyword}"`).join(", ")}`,
      );
    }
  }
  return lines.join("\n");
}

export const validateAppMetadataTool = {
  name: "validate_app_metadata",
  config: {
    title: "Validate app store metadata",
    description:
      "Checks draft App Store or Google Play listing text against each store's published limits and rules, plus common ASO heuristics, and reports which target keywords it covers. Every issue is marked `store` (Apple or Google publishes the rule) or `heuristic` (practice the store doesn't document). Call it in a loop while drafting a name, subtitle and keyword field, or a Play title and descriptions, until errors are gone and coverage is where you want it. Space-delimited languages only. Uses no credits.",
    inputSchema,
    outputSchema: z.looseObject({
      store: z.enum(APP_STORES),
      fields: z.array(looseObjectOutputSchema),
      issues: z.array(looseObjectOutputSchema),
      coverageRule: z.string(),
      coverage: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  // Async only to match the tool-handler shape SAM's adapter expects.
  handler: async (args: Args) => {
    const report = validateAppMetadata(toMetadataInput(args));
    return mcpResponse({
      text: formatReport(report),
      structuredContent: report,
    });
  },
};
