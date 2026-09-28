import { z } from "zod";
import {
  createDataforseoClient,
  fetchAppDataTaskResult,
  parseAppListing,
  parseAppSearchResult,
} from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import {
  languageCodeSchema,
  locationCodeSchema,
  projectIdSchema,
} from "@/server/mcp/schemas";
import {
  formatMcpTable,
  truncatedCell,
  type McpTableColumn,
} from "@/server/mcp/table";
import {
  appIdSchema,
  DATA_STORE,
  formatNumber,
  meteredAnnotations,
  normalizeAppId,
  storeSchema,
} from "@/server/mcp/tools/app-store-shared";
import { pollQueuedTask } from "@/server/mcp/tools/queued-task";
import { STORE_LABELS, type AppStore } from "@/shared/aso-metadata-rules";

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

// Google Play's search page shows 30 results, so a deeper Play task is billed
// for rows that never come back.
const PLAY_SEARCH_DEPTH = 30;

const storefrontInputSchema = {
  locationCode: locationCodeSchema
    .optional()
    .describe(
      "Country storefront as a DataForSEO location code (e.g. 2840 US, 2826 GB, 2276 DE). Defaults to the project's market.",
    ),
  languageCode: languageCodeSchema.optional(),
} as const;

const taskIdSchema = z
  .string()
  .min(1)
  .max(128)
  .optional()
  .describe(
    'Resume a previous call that returned status "processing". Pass back the taskId exactly as returned. Resuming charges no extra credits.',
  );

const TASK_HANDLE_PATTERN = /^(app_store|google_play):(.+)$/;

/** Handles carry the store so a resume can't hit the other store's queue. */
function parseTaskHandle(handle: string, store: AppStore): string {
  const match = TASK_HANDLE_PATTERN.exec(handle);
  if (!match || match[1] !== store) {
    throw new AppError(
      "VALIDATION_ERROR",
      `taskId must be the value this tool returned for ${STORE_LABELS[store]}, formatted as "${store}:<id>".`,
    );
  }
  return match[2] ?? "";
}

function resolveStorefront(
  args: { locationCode?: number; languageCode?: string },
  project: { locationCode: number; languageCode: string },
) {
  return {
    locationCode: args.locationCode ?? project.locationCode,
    languageCode: args.languageCode ?? project.languageCode,
  };
}

function storefrontLabel(
  store: AppStore,
  context: {
    locationCode: number | null;
    languageCode: string | null;
    checkedAt: string | null;
  },
) {
  return `${STORE_LABELS[store]}, location ${context.locationCode ?? "?"}, language ${context.languageCode ?? "?"}, read ${context.checkedAt ?? "at an unknown time"}`;
}

// ---------------------------------------------------------------------------
// get_app_store_results
// ---------------------------------------------------------------------------

const getAppStoreResultsInputSchema = {
  projectId: projectIdSchema,
  store: storeSchema,
  keyword: z
    .string()
    .min(1)
    .max(700)
    .optional()
    .describe("Search term to check. Required unless resuming with taskId."),
  ...storefrontInputSchema,
  depth: z
    .number()
    .int()
    .min(1)
    .max(700)
    .optional()
    .describe(
      "How many results to return. App Store: up to 700, billed per 100, so anything up to 100 costs the same; defaults to 100. Google Play always fetches its store limit of 30 and returns up to that many.",
    ),
  taskId: taskIdSchema,
} as const;

type GetAppStoreResultsArgs = z.infer<
  z.ZodObject<typeof getAppStoreResultsInputSchema>
>;

type AppSearchRow = ReturnType<typeof parseAppSearchResult>["results"][number];

// Each store fills a different subset: App Store rows carry rating counts,
// Play rows carry the developer.
const APP_SEARCH_COLUMNS: Record<AppStore, McpTableColumn<AppSearchRow>[]> = {
  app_store: [
    { header: "#", value: (row) => row.rank },
    { header: "app", value: (row) => row.title, format: truncatedCell(40) },
    { header: "id", value: (row) => row.appId },
    { header: "rating", value: (row) => row.rating },
    { header: "ratings", value: (row) => formatNumber(row.ratingCount) },
  ],
  google_play: [
    { header: "#", value: (row) => row.rank },
    { header: "app", value: (row) => row.title, format: truncatedCell(40) },
    { header: "id", value: (row) => row.appId },
    { header: "developer", value: (row) => row.developer },
    { header: "rating", value: (row) => row.rating },
  ],
};

export const getAppStoreResultsTool = {
  name: "get_app_store_results",
  config: {
    title: "Get app store search results",
    description:
      "Shows which apps rank for a search term in one App Store or Google Play storefront, in rank order. Works in any country storefront. App Store rows carry rating counts; Google Play rows carry the developer instead. Use it to see who you compete with for a term and where an app ranks. Usually completes within this call; if the queued job is still running you get status 'processing' plus a taskId — call again with that taskId in 30-60 seconds to collect the result at no extra cost. Charges credits.",
    inputSchema: getAppStoreResultsInputSchema,
    outputSchema: z.looseObject({
      status: z.enum(["completed", "processing"]),
      taskId: z.string(),
      results: z.array(looseObjectOutputSchema).optional(),
      ...optionalMetaOutputSchema,
    }),
    annotations: meteredAnnotations,
  },
  handler: withMcpProjectAuth(async (args: GetAppStoreResultsArgs, context) => {
    const store = DATA_STORE[args.store];
    let taskId: string;
    if (args.taskId) {
      taskId = parseTaskHandle(args.taskId, args.store);
    } else {
      if (!args.keyword) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Pass a keyword, or a taskId to resume a previous call.",
        );
      }
      const client = createDataforseoClient(context.billing);
      // Only the post is metered; the polling below collects for free.
      taskId = await client.apps.searchTaskPost({
        store,
        keyword: args.keyword,
        ...resolveStorefront(args, context.project),
        depth:
          args.store === "google_play"
            ? PLAY_SEARCH_DEPTH
            : (args.depth ?? 100),
      });
    }
    const publicTaskId = `${args.store}:${taskId}`;
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}`,
    );

    const outcome = await pollQueuedTask(
      () => fetchAppDataTaskResult({ store, endpoint: "app_searches", taskId }),
      publicTaskId,
    );
    if (outcome.status === "pending") {
      return mcpResponse({
        text: `The store search is still running. Call get_app_store_results again with taskId "${publicTaskId}" in 30-60 seconds — resuming charges no extra credits.`,
        meta,
        structuredContent: { status: "processing", taskId: publicTaskId },
      });
    }

    const search = parseAppSearchResult(outcome.result);
    // DataForSEO returns a full billing unit of rows; show what was asked for.
    const results = args.depth
      ? search.results.slice(0, args.depth)
      : search.results;
    const header = `${results.length} apps for "${search.keyword ?? args.keyword ?? ""}" (${storefrontLabel(args.store, search)}).`;
    return mcpResponse({
      text:
        results.length === 0
          ? `${header} The store returned no apps for this term.`
          : `${header}\n${formatMcpTable(results, APP_SEARCH_COLUMNS[args.store])}`,
      meta,
      structuredContent: {
        status: "completed",
        taskId: publicTaskId,
        ...search,
        results,
      },
    });
  }),
};

// ---------------------------------------------------------------------------
// get_app_listing
// ---------------------------------------------------------------------------

const getAppListingInputSchema = {
  projectId: projectIdSchema,
  store: storeSchema,
  appId: appIdSchema
    .optional()
    .describe(
      "App Store numeric id (e.g. 570060128) or Google Play package name (e.g. com.duolingo). Required unless resuming with taskId.",
    ),
  ...storefrontInputSchema,
  taskId: taskIdSchema,
} as const;

type GetAppListingArgs = z.infer<z.ZodObject<typeof getAppListingInputSchema>>;

const DESCRIPTION_PREVIEW_CHARS = 300;

const HIDDEN_FIELDS: Record<AppStore, string> = {
  app_store:
    "Not public, so not here: the App Store keyword field. Only the developer sees it in App Store Connect.",
  google_play:
    "Not in this data: the Play short description. Ask the developer if you need it.",
};

export const getAppListingTool = {
  name: "get_app_listing",
  config: {
    title: "Get app listing",
    description:
      "Reads one app's public listing in an App Store or Google Play storefront: title, subtitle (App Store), full description, developer, category (Google Play), rating, version (App Store), screenshot count and similar apps. Works in any country storefront and language, so it also shows localized listings. Use it to study a competitor or to feed validate_app_metadata. The App Store keyword field and the Play short description are not in this data. Usually completes within this call; if the queued job is still running you get status 'processing' plus a taskId — call again with that taskId in 30-60 seconds to collect the result at no extra cost. Charges credits.",
    inputSchema: getAppListingInputSchema,
    outputSchema: z.looseObject({
      status: z.enum(["completed", "processing"]),
      taskId: z.string(),
      listing: looseObjectOutputSchema.nullable().optional(),
      ...optionalMetaOutputSchema,
    }),
    annotations: meteredAnnotations,
  },
  handler: withMcpProjectAuth(async (args: GetAppListingArgs, context) => {
    const store = DATA_STORE[args.store];
    let taskId: string;
    if (args.taskId) {
      taskId = parseTaskHandle(args.taskId, args.store);
    } else {
      if (!args.appId) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Pass an appId, or a taskId to resume a previous call.",
        );
      }
      const client = createDataforseoClient(context.billing);
      // Only the post is metered; the polling below collects for free.
      taskId = await client.apps.infoTaskPost({
        store,
        appId: normalizeAppId(args.store, args.appId),
        ...resolveStorefront(args, context.project),
      });
    }
    const publicTaskId = `${args.store}:${taskId}`;
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}`,
    );

    const outcome = await pollQueuedTask(
      () => fetchAppDataTaskResult({ store, endpoint: "app_info", taskId }),
      publicTaskId,
    );
    if (outcome.status === "pending") {
      return mcpResponse({
        text: `The listing is still being read. Call get_app_listing again with taskId "${publicTaskId}" in 30-60 seconds — resuming charges no extra credits.`,
        meta,
        structuredContent: { status: "processing", taskId: publicTaskId },
      });
    }

    const { listing, ...storefront } = parseAppListing(store, outcome.result);
    if (!listing) {
      return mcpResponse({
        text: `No ${STORE_LABELS[args.store]} listing found for that app in this storefront. Check the id, or try the app's home country.`,
        meta,
        structuredContent: {
          status: "completed",
          taskId: publicTaskId,
          ...storefront,
          listing: null,
        },
      });
    }

    const description = listing.description ?? "";
    const lines = [
      `${listing.title ?? listing.appId} (${listing.appId}), ${storefrontLabel(args.store, storefront)}`,
      ...(
        [
          ["subtitle", listing.subtitle],
          ["developer", listing.developer],
          ["category", listing.category],
          [
            "rating",
            listing.rating === null
              ? null
              : `${listing.rating} from ${formatNumber(listing.ratingCount)} ratings`,
          ],
          ["installs", listing.installs],
          ["version", listing.version],
          ["last updated", listing.lastUpdated],
          ["screenshots", String(listing.screenshotCount)],
          [
            "similar apps",
            listing.similarApps
              .map((app) => `${app.title ?? "?"} (${app.appId})`)
              .join(", ") || null,
          ],
        ] as const
      )
        .filter(([, value]) => value !== null)
        .map(([label, value]) => `- ${label}: ${value}`),
      `Description (${description.length} characters${description.length > DESCRIPTION_PREVIEW_CHARS ? `, first ${DESCRIPTION_PREVIEW_CHARS} shown; the full text is in the structured result` : ""}):`,
      description.slice(0, DESCRIPTION_PREVIEW_CHARS),
      HIDDEN_FIELDS[args.store],
    ];
    return mcpResponse({
      text: lines.join("\n"),
      meta,
      structuredContent: {
        status: "completed",
        taskId: publicTaskId,
        ...storefront,
        listing,
      },
    });
  }),
};
