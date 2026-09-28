import { z } from "zod";
import {
  createDataforseoClient,
  LABS_APP_LOCATION_CODE,
} from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { formatMcpTable } from "@/server/mcp/table";
import {
  appIdSchema,
  DATA_STORE,
  formatNumber,
  meteredAnnotations,
  normalizeAppId,
  STORE_LABELS,
  storeSchema,
} from "@/server/mcp/tools/app-store-shared";

/** Labs only has app data for the US store in English. */
function assertUsStorefront(locationCode: number | undefined) {
  if (locationCode !== undefined && locationCode !== LABS_APP_LOCATION_CODE) {
    throw new AppError(
      "VALIDATION_ERROR",
      `DataForSEO only has app keyword data for the US store (location code ${LABS_APP_LOCATION_CODE}). For other storefronts, use get_app_store_results for rankings and get_app_listing for listing text.`,
    );
  }
}

// ---------------------------------------------------------------------------
// get_app_ranking_keywords
// ---------------------------------------------------------------------------

const usOnlyLocationSchema = z
  .number()
  .int()
  .optional()
  .describe(
    `Only ${LABS_APP_LOCATION_CODE} (United States) is supported, and it is the default. Any other value is rejected.`,
  );

const getAppRankingKeywordsInputSchema = {
  projectId: projectIdSchema,
  store: storeSchema,
  appId: appIdSchema,
  locationCode: usOnlyLocationSchema,
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe("Keywords to return, by estimated volume. Defaults to 100."),
  offset: z.number().int().min(0).optional(),
} as const;

type GetAppRankingKeywordsArgs = z.infer<
  z.ZodObject<typeof getAppRankingKeywordsInputSchema>
>;

export const getAppRankingKeywordsTool = {
  name: "get_app_ranking_keywords",
  config: {
    title: "Get app ranking keywords",
    description:
      "Lists the search terms an app ranks for in the US App Store or US Google Play, with its rank and DataForSEO's estimated search volume, highest volume first. US store and English only: DataForSEO has no app keyword data for other countries, whatever the project's market. Volumes are vendor estimates with no published method and are refreshed about weekly; some Play terms are word fragments. Charges credits.",
    inputSchema: getAppRankingKeywordsInputSchema,
    outputSchema: z.looseObject({
      totalCount: z.number().nullable(),
      keywords: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    }),
    annotations: meteredAnnotations,
  },
  handler: withMcpProjectAuth(
    async (args: GetAppRankingKeywordsArgs, context) => {
      assertUsStorefront(args.locationCode);
      const appId = normalizeAppId(args.store, args.appId);
      const client = createDataforseoClient(context.billing);
      const { totalCount, keywords } = await client.apps.keywordsForApp({
        store: DATA_STORE[args.store],
        appId,
        limit: args.limit ?? 100,
        offset: args.offset,
      });
      const header = `${appId} ranks for ${formatNumber(totalCount)} terms in the US ${STORE_LABELS[args.store]}; showing ${keywords.length}. Volumes are DataForSEO estimates.`;
      return mcpResponse({
        text:
          keywords.length === 0
            ? `${header} DataForSEO has no ranking data for this app.`
            : `${header}\n${formatMcpTable(keywords, [
                { header: "keyword", value: (row) => row.keyword },
                {
                  header: "est. volume",
                  value: (row) => formatNumber(row.searchVolume),
                },
                { header: "rank", value: (row) => row.rank },
                {
                  header: "updated",
                  value: (row) => row.lastUpdated?.slice(0, 10) ?? null,
                },
              ])}`,
        meta: buildProjectMeta(context, args.projectId, `/p/${args.projectId}`),
        structuredContent: {
          locationCode: LABS_APP_LOCATION_CODE,
          languageCode: "en",
          totalCount,
          keywords,
        },
      });
    },
  ),
};

// ---------------------------------------------------------------------------
// find_app_competitors
// ---------------------------------------------------------------------------

const findAppCompetitorsInputSchema = {
  projectId: projectIdSchema,
  store: storeSchema,
  appId: appIdSchema,
  locationCode: usOnlyLocationSchema,
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Competitors to return, by shared keywords. Defaults to 20."),
} as const;

type FindAppCompetitorsArgs = z.infer<
  z.ZodObject<typeof findAppCompetitorsInputSchema>
>;

export const findAppCompetitorsTool = {
  name: "find_app_competitors",
  config: {
    title: "Find app competitors",
    description:
      "Finds the apps that rank for the most of the same search terms as an app in the US App Store or US Google Play, with how often each ranks in the top positions. US store and English only. Results carry app ids, not names: call get_app_listing on the ones worth a look. For competitors in other countries, use get_app_listing's similar apps or get_app_store_results. Charges credits.",
    inputSchema: findAppCompetitorsInputSchema,
    outputSchema: z.looseObject({
      totalCount: z.number().nullable(),
      competitors: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    }),
    annotations: meteredAnnotations,
  },
  handler: withMcpProjectAuth(async (args: FindAppCompetitorsArgs, context) => {
    assertUsStorefront(args.locationCode);
    const appId = normalizeAppId(args.store, args.appId);
    const limit = args.limit ?? 20;
    const client = createDataforseoClient(context.billing);
    // DataForSEO lists the app itself first; ask for one extra and drop it.
    const { totalCount, competitors } = await client.apps.competitors({
      store: DATA_STORE[args.store],
      appId,
      limit: limit + 1,
    });
    const rows = competitors
      .filter((row) => row.appId !== appId)
      .slice(0, limit);
    const header = `${rows.length} US ${STORE_LABELS[args.store]} competitors for ${appId}, by shared ranking keywords. Names aren't in this data; call get_app_listing for them.`;
    return mcpResponse({
      text:
        rows.length === 0
          ? `${header} DataForSEO has no competitor data for this app.`
          : `${header}\n${formatMcpTable(rows, [
              { header: "app id", value: (row) => row.appId },
              {
                header: "shared keywords",
                value: (row) => formatNumber(row.sharedKeywords),
              },
              {
                header: "avg position",
                value: (row) => row.avgPosition?.toFixed(1) ?? null,
              },
              { header: "#1", value: (row) => row.pos1 },
              { header: "#2-3", value: (row) => row.pos2To3 },
              { header: "#4-10", value: (row) => row.pos4To10 },
            ])}`,
      meta: buildProjectMeta(context, args.projectId, `/p/${args.projectId}`),
      structuredContent: {
        locationCode: LABS_APP_LOCATION_CODE,
        languageCode: "en",
        // Minus the app itself, which DataForSEO counts.
        totalCount: totalCount === null ? null : Math.max(totalCount - 1, 0),
        competitors: rows,
      },
    });
  }),
};
