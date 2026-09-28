import { z } from "zod";
import type { AppDataStore } from "@/server/lib/dataforseo/apps";
import { dataforseoPost } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  parseTaskItems,
  parseTaskTotalCount,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";

// DataForSEO Labs app data: which keywords an app ranks for and which apps
// compete with it. Live endpoints, refreshed about weekly, and only for the US
// store in English.

/** The only market DataForSEO Labs has app data for. */
export const LABS_APP_LOCATION_CODE = 2840;
const LABS_APP_LANGUAGE_CODE = "en";

const appKeywordItemSchema = z
  .object({
    keyword_data: z.object({
      keyword: z.string(),
      keyword_info: z
        .object({
          search_volume: z.number().nullable().optional(),
          last_updated_time: z.string().nullable().optional(),
        })
        .passthrough()
        .nullable()
        .optional(),
    }),
    ranked_serp_element: z
      .object({
        serp_item: z
          .object({ rank_absolute: z.number().nullable().optional() })
          .passthrough()
          .nullable()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();
type AppRankingKeyword = {
  keyword: string;
  searchVolume: number | null;
  rank: number | null;
  lastUpdated: string | null;
};

export async function fetchKeywordsForApp(input: {
  store: AppDataStore;
  appId: string;
  limit: number;
  offset?: number;
  maxRank?: number;
}): Promise<
  DataforseoApiResponse<{
    totalCount: number | null;
    keywords: AppRankingKeyword[];
  }>
> {
  const response = await dataforseoPost(
    `/v3/dataforseo_labs/${input.store}/keywords_for_app/live`,
    [
      {
        app_id: input.appId,
        location_code: LABS_APP_LOCATION_CODE,
        language_code: LABS_APP_LANGUAGE_CODE,
        limit: input.limit,
        offset: input.offset,
        filters:
          input.maxRank === undefined
            ? undefined
            : [
                "ranked_serp_element.serp_item.rank_absolute",
                "<=",
                input.maxRank,
              ],
      },
    ],
  );
  // 40501 = billed empty result: an app Labs hasn't seen rank for anything.
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const items = parseTaskItems("keywords_for_app", task, appKeywordItemSchema);
  return {
    data: {
      totalCount: parseTaskTotalCount(task),
      keywords: items.map((item) => ({
        keyword: item.keyword_data.keyword,
        searchVolume: item.keyword_data.keyword_info?.search_volume ?? null,
        rank: item.ranked_serp_element?.serp_item?.rank_absolute ?? null,
        lastUpdated: item.keyword_data.keyword_info?.last_updated_time ?? null,
      })),
    },
    billing: buildTaskBilling(task),
  };
}

const positionBucketsSchema = z
  .object({
    pos_1: z.number().nullable().optional(),
    pos_2_3: z.number().nullable().optional(),
    pos_4_10: z.number().nullable().optional(),
    pos_11_100: z.number().nullable().optional(),
    count: z.number().nullable().optional(),
    search_volume: z.number().nullable().optional(),
  })
  .passthrough();

const appCompetitorItemSchema = z
  .object({
    app_id: z.string(),
    avg_position: z.number().nullable().optional(),
    intersections: z.number().nullable().optional(),
    // Keyed by result type ("app_store_search_organic" or
    // "google_play_search_organic"); each store has exactly one.
    competitor_metrics: z
      .record(z.string(), positionBucketsSchema)
      .nullable()
      .optional(),
  })
  .passthrough();

type AppCompetitor = {
  appId: string;
  /** Keywords both apps rank for. */
  sharedKeywords: number | null;
  /** The competitor's average rank across those shared keywords. */
  avgPosition: number | null;
  /** How many shared keywords the competitor ranks for at each position. */
  pos1: number | null;
  pos2To3: number | null;
  pos4To10: number | null;
  pos11To100: number | null;
  sharedSearchVolume: number | null;
};

export async function fetchAppCompetitors(input: {
  store: AppDataStore;
  appId: string;
  limit: number;
}): Promise<
  DataforseoApiResponse<{
    totalCount: number | null;
    competitors: AppCompetitor[];
  }>
> {
  const response = await dataforseoPost(
    `/v3/dataforseo_labs/${input.store}/app_competitors/live`,
    [
      {
        app_id: input.appId,
        location_code: LABS_APP_LOCATION_CODE,
        language_code: LABS_APP_LANGUAGE_CODE,
        limit: input.limit,
      },
    ],
  );
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const items = parseTaskItems(
    "app_competitors",
    task,
    appCompetitorItemSchema,
  );
  return {
    data: {
      totalCount: parseTaskTotalCount(task),
      competitors: items.map((item) => {
        const buckets = Object.values(item.competitor_metrics ?? {})[0];
        return {
          appId: item.app_id,
          sharedKeywords: item.intersections ?? null,
          avgPosition: item.avg_position ?? null,
          pos1: buckets?.pos_1 ?? null,
          pos2To3: buckets?.pos_2_3 ?? null,
          pos4To10: buckets?.pos_4_10 ?? null,
          pos11To100: buckets?.pos_11_100 ?? null,
          sharedSearchVolume: buckets?.search_volume ?? null,
        };
      }),
    },
    billing: buildTaskBilling(task),
  };
}
