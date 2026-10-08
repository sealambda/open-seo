import { z } from "zod";
import { dataforseoGet, dataforseoPost } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  isRecord,
  type DataforseoApiResponse,
  type DataforseoItemsTask,
  type DataforseoTaskLike,
} from "@/server/lib/dataforseo/envelope";
import {
  collectQueuedTask,
  NO_RETRY,
  postedTaskId,
  type QueuedTaskOutcome,
} from "@/server/lib/dataforseo/tasks";

// Consumers pick fields generically (pickRowFields), so listing rows stay an
// untyped record.
type BusinessListingItem = Record<string, unknown>;

/**
 * Location + language for the Google business_data endpoints. They accept
 * either a coordinate ("lat,lng,radius" in meters) or a location code, never
 * both, so the coordinate wins when present.
 */
type BusinessLocationInput = {
  locationCoordinate?: string;
  locationCode?: number;
  languageCode: string;
};

function locationParams(input: BusinessLocationInput) {
  return input.locationCoordinate
    ? { location_coordinate: input.locationCoordinate }
    : { location_code: input.locationCode };
}

export async function fetchBusinessListingsSearch(input: {
  categories?: string[];
  title?: string;
  locationCoordinate: string;
  isClaimed?: boolean;
  filters?: unknown[];
  orderBy?: string[];
  limit: number;
  offset?: number;
}): Promise<DataforseoApiResponse<BusinessListingItem[]>> {
  const response = await dataforseoPost<
    DataforseoItemsTask<BusinessListingItem>
  >("/v3/business_data/business_listings/search/live", [
    {
      categories: input.categories,
      title: input.title,
      location_coordinate: input.locationCoordinate,
      is_claimed: input.isClaimed,
      filters: input.filters,
      order_by: input.orderBy,
      limit: input.limit,
      offset: input.offset,
    },
  ]);
  // "No Search Results" (40501) is a valid empty result for obscure
  // businesses/keywords — DataForSEO still charges for it, so treat it as an
  // empty success instead of surfacing a charged-task error to the user.
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: task.result?.[0]?.items ?? [],
    billing: buildTaskBilling(task),
  };
}

// Q&A results carry both answered (`items`) and unanswered
// (`items_without_answers`) rows; the SDK types this result as `any`, so we
// validate a generic record shape and flatten both.
const questionsResultSchema = z
  .object({
    items: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
    items_without_answers: z
      .array(z.record(z.string(), z.unknown()))
      .nullable()
      .optional(),
  })
  .passthrough();

function combinedQuestionItems(results: unknown): Record<string, unknown>[] {
  const list = Array.isArray(results) ? results : [];
  return list.flatMap((result) => {
    const parsed = questionsResultSchema.safeParse(result ?? {});
    if (!parsed.success) return [];
    return [
      ...(parsed.data.items ?? []),
      ...(parsed.data.items_without_answers ?? []),
    ];
  });
}

export async function fetchQuestionsAnswers(input: {
  keyword: string;
  locationCoordinate: string;
  languageCode: string;
  depth: number;
}): Promise<DataforseoApiResponse<Record<string, unknown>[]>> {
  const response = await dataforseoPost(
    "/v3/business_data/google/questions_and_answers/live",
    [
      {
        keyword: input.keyword,
        location_coordinate: input.locationCoordinate,
        language_code: input.languageCode,
        depth: input.depth,
      },
    ],
  );
  // "No Search Results" (40501) is a valid empty result for obscure
  // businesses/keywords — DataForSEO still charges for it, so treat it as an
  // empty success instead of surfacing a charged-task error to the user.
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: combinedQuestionItems(task.result),
    billing: buildTaskBilling(task),
  };
}

export async function fetchMyBusinessInfo(
  input: { keyword: string } & BusinessLocationInput,
): Promise<DataforseoApiResponse<Record<string, unknown> | null>> {
  const response = await dataforseoPost<DataforseoItemsTask<unknown>>(
    "/v3/business_data/google/my_business_info/live",
    [
      {
        keyword: input.keyword,
        ...locationParams(input),
        language_code: input.languageCode,
      },
    ],
  );
  // 40501 = billed empty result: a business Google has no profile for.
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const entry = task.result?.[0];
  const item = entry?.items?.[0];
  if (!isRecord(item)) {
    return { data: null, billing: buildTaskBilling(task) };
  }
  // check_url (the Google Maps link DataForSEO verified against) lives on the
  // result entry, not the item — merge it so callers get one complete record.
  if (item.check_url == null) item.check_url = entry?.check_url;
  return { data: item, billing: buildTaskBilling(task) };
}

// ---------------------------------------------------------------------------
// Task-queue business data (reviews, extended reviews, profile updates). Billed
// at task_post and collected for free — see tasks.ts.
// ---------------------------------------------------------------------------

/** High execution priority: reviews normally settle within ~20s instead of
 *  minutes, which is what makes a single MCP call able to return them. */
const TASK_PRIORITY_HIGH = 2;

export type BusinessTaskEndpoint =
  | "reviews"
  | "extended_reviews"
  | "my_business_updates";

type BusinessIdentifierInput = {
  keyword?: string;
  cid?: string;
  placeId?: string;
};

export async function postGoogleReviewsTask(
  input: BusinessIdentifierInput &
    BusinessLocationInput & {
      depth: number;
      /** Only the regular reviews endpoint supports sorting. */
      sortBy?: string;
      /** Collect reviews Google surfaces from other sites (Yelp, Tripadvisor). */
      includeOtherSources: boolean;
    },
): Promise<DataforseoApiResponse<string>> {
  if (input.includeOtherSources) {
    return postedTaskId(
      await dataforseoPost<DataforseoTaskLike & { id?: string }>(
        "/v3/business_data/google/extended_reviews/task_post",
        [
          {
            keyword: input.keyword,
            cid: input.cid,
            place_id: input.placeId,
            ...locationParams(input),
            language_code: input.languageCode,
            depth: input.depth,
            priority: TASK_PRIORITY_HIGH,
          },
        ],
        NO_RETRY,
      ),
    );
  }
  return postedTaskId(
    await dataforseoPost<DataforseoTaskLike & { id?: string }>(
      "/v3/business_data/google/reviews/task_post",
      [
        {
          keyword: input.keyword,
          cid: input.cid,
          place_id: input.placeId,
          ...locationParams(input),
          language_code: input.languageCode,
          depth: input.depth,
          sort_by: input.sortBy,
          priority: TASK_PRIORITY_HIGH,
        },
      ],
      NO_RETRY,
    ),
  );
}

export async function postMyBusinessUpdatesTask(
  input: { keyword: string; depth: number } & BusinessLocationInput,
): Promise<DataforseoApiResponse<string>> {
  return postedTaskId(
    await dataforseoPost<DataforseoTaskLike & { id?: string }>(
      "/v3/business_data/google/my_business_updates/task_post",
      [
        {
          keyword: input.keyword,
          ...locationParams(input),
          language_code: input.languageCode,
          depth: input.depth,
          priority: TASK_PRIORITY_HIGH,
        },
      ],
      NO_RETRY,
    ),
  );
}

/** Collects one queued business_data task; free, so deliberately unmetered. */
export function fetchBusinessDataTaskResult(input: {
  endpoint: BusinessTaskEndpoint;
  taskId: string;
}): Promise<QueuedTaskOutcome> {
  return collectQueuedTask(
    `/v3/business_data/google/${input.endpoint}/task_get/${encodeURIComponent(input.taskId)}`,
  );
}

const businessCategorySchema = z
  .object({
    category_name: z.string(),
    business_count: z.number().nullable().optional(),
  })
  .passthrough();

type BusinessCategoryRow = {
  category: string;
  businessCount: number | null;
};

/** Top Business Listings categories by business count. Free at DataForSEO. */
export async function fetchBusinessListingsCategories(): Promise<
  DataforseoApiResponse<BusinessCategoryRow[]>
> {
  const response = await dataforseoGet(
    "/v3/business_data/business_listings/categories",
  );
  const task = assertOk(response);
  // This endpoint puts rows directly on `result` rather than `result[0].items`.
  const rows = (task.result ?? []).flatMap((entry) => {
    const parsed = businessCategorySchema.safeParse(entry);
    if (!parsed.success) return [];
    return [
      {
        category: parsed.data.category_name,
        businessCount: parsed.data.business_count ?? null,
      },
    ];
  });
  return { data: rows, billing: buildTaskBilling(task) };
}
