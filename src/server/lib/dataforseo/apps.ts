import { z } from "zod";
import { dataforseoPost } from "@/server/lib/dataforseo/core";
import type {
  DataforseoApiResponse,
  DataforseoTaskLike,
} from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";
import {
  collectQueuedTask,
  NO_RETRY,
  postedTaskId,
  type QueuedTaskOutcome,
} from "@/server/lib/dataforseo/tasks";

// App store data from app_data: store searches and listings. Both are
// task-only, billed at task_post and collected for free (see tasks.ts). Labs
// app keywords and competitors live in app-labs.ts.

/** DataForSEO's path segment for each store. */
export type AppDataStore = "apple" | "google";

type AppDataEndpoint = "app_searches" | "app_info";

type TaskPostResponse = DataforseoTaskLike & { id?: string };

export async function postAppSearchTask(input: {
  store: AppDataStore;
  keyword: string;
  locationCode: number;
  languageCode: string;
  depth: number;
}): Promise<DataforseoApiResponse<string>> {
  return postedTaskId(
    await dataforseoPost<TaskPostResponse>(
      `/v3/app_data/${input.store}/app_searches/task_post`,
      [
        {
          keyword: input.keyword,
          location_code: input.locationCode,
          language_code: input.languageCode,
          depth: input.depth,
        },
      ],
      NO_RETRY,
    ),
  );
}

export async function postAppInfoTask(input: {
  store: AppDataStore;
  appId: string;
  locationCode: number;
  languageCode: string;
}): Promise<DataforseoApiResponse<string>> {
  return postedTaskId(
    await dataforseoPost<TaskPostResponse>(
      `/v3/app_data/${input.store}/app_info/task_post`,
      [
        {
          app_id: input.appId,
          location_code: input.locationCode,
          language_code: input.languageCode,
        },
      ],
      NO_RETRY,
    ),
  );
}

/** Collects one queued app_data task; free, so deliberately unmetered. */
export function fetchAppDataTaskResult(input: {
  store: AppDataStore;
  endpoint: AppDataEndpoint;
  taskId: string;
}): Promise<QueuedTaskOutcome> {
  return collectQueuedTask(
    `/v3/app_data/${input.store}/${input.endpoint}/task_get/advanced/${encodeURIComponent(input.taskId)}`,
  );
}

const ratingSchema = z
  .object({
    value: z.number().nullable().optional(),
    votes_count: z.number().nullable().optional(),
  })
  .passthrough()
  .nullable()
  .optional();

const appSearchItemSchema = z
  .object({
    rank_absolute: z.number(),
    app_id: z.string(),
    title: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    // Play only.
    developer: z.string().nullable().optional(),
    rating: ratingSchema,
    is_free: z.boolean().nullable().optional(),
  })
  .passthrough();

type AppSearchRow = {
  rank: number;
  appId: string;
  title: string | null;
  developer: string | null;
  rating: number | null;
  ratingCount: number | null;
  isFree: boolean | null;
  url: string | null;
};

// Result-level fields both app_data endpoints echo back.
const resultContextSchema = z
  .object({
    location_code: z.number().nullable().optional(),
    language_code: z.string().nullable().optional(),
    datetime: z.string().nullable().optional(),
  })
  .passthrough();

type StorefrontContext = {
  locationCode: number | null;
  languageCode: string | null;
  /** When DataForSEO read the store. */
  checkedAt: string | null;
};

function storefrontContext(
  result: Record<string, unknown> | null,
): StorefrontContext {
  const parsed = resultContextSchema.safeParse(result ?? {});
  const context = parsed.success ? parsed.data : {};
  return {
    locationCode: context.location_code ?? null,
    languageCode: context.language_code ?? null,
    checkedAt: context.datetime ?? null,
  };
}

function resultItems(result: Record<string, unknown> | null): unknown[] {
  return Array.isArray(result?.items) ? result.items : [];
}

/** Shapes a collected app_searches result into ranked rows. */
export function parseAppSearchResult(
  result: Record<string, unknown> | null,
): StorefrontContext & { keyword: string | null; results: AppSearchRow[] } {
  const results = resultItems(result).flatMap((item) => {
    const parsed = appSearchItemSchema.safeParse(item);
    if (!parsed.success) return [];
    const row = parsed.data;
    return [
      {
        rank: row.rank_absolute,
        appId: row.app_id,
        title: row.title ?? null,
        developer: row.developer ?? null,
        rating: row.rating?.value ?? null,
        ratingCount: row.rating?.votes_count ?? null,
        isFree: row.is_free ?? null,
        url: row.url ?? null,
      },
    ];
  });
  const keyword = typeof result?.keyword === "string" ? result.keyword : null;
  return { ...storefrontContext(result), keyword, results };
}

const relatedAppSchema = z
  .object({ app_id: z.string(), title: z.string().nullable().optional() })
  .passthrough();

const appInfoItemSchema = z
  .object({
    app_id: z.string(),
    title: z.string().nullable().optional(),
    // App Store only; Play's short description is not in the payload.
    subtitle: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    developer: z.string().nullable().optional(),
    // Play only; the App Store categories come back null.
    main_category: z.string().nullable().optional(),
    rating: ratingSchema,
    reviews_count: z.number().nullable().optional(),
    // Play only.
    installs: z.string().nullable().optional(),
    // App Store only.
    version: z.string().nullable().optional(),
    last_update_date: z.string().nullable().optional(),
    images: z.array(z.string()).nullable().optional(),
    similar_apps: z.array(relatedAppSchema).nullable().optional(),
  })
  .passthrough();

type AppListing = {
  appId: string;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  url: string | null;
  developer: string | null;
  category: string | null;
  rating: number | null;
  ratingCount: number | null;
  reviewCount: number | null;
  installs: string | null;
  version: string | null;
  lastUpdated: string | null;
  screenshotCount: number;
  similarApps: Array<{ appId: string; title: string | null }>;
};

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Play descriptions arrive HTML-escaped ("&amp;"); decode in one pass. */
function decodeHtmlEntities(value: string) {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, name: string) => {
      if (name.startsWith("#")) {
        const code =
          name[1]?.toLowerCase() === "x"
            ? Number.parseInt(name.slice(2), 16)
            : Number.parseInt(name.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
      }
      return HTML_ENTITIES[name.toLowerCase()] ?? entity;
    },
  );
}

/** Shapes a collected app_info result into one listing (null if empty). */
export function parseAppListing(
  store: AppDataStore,
  result: Record<string, unknown> | null,
): StorefrontContext & { listing: AppListing | null } {
  const context = storefrontContext(result);
  const item = resultItems(result)[0];
  if (item === undefined) return { ...context, listing: null };
  const parsed = appInfoItemSchema.safeParse(item);
  if (!parsed.success) {
    console.error(
      "dataforseo.app_info.invalid-payload",
      parsed.error.issues.slice(0, 5),
    );
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO app_info returned an invalid response shape",
    );
  }
  const app = parsed.data;
  const description = app.description ?? null;
  const listing: AppListing = {
    appId: app.app_id,
    title: app.title ?? null,
    subtitle: app.subtitle ?? null,
    description:
      store === "google" && description !== null
        ? decodeHtmlEntities(description)
        : description,
    url: app.url ?? null,
    developer: app.developer ?? null,
    category: app.main_category ?? null,
    rating: app.rating?.value ?? null,
    ratingCount: app.rating?.votes_count ?? null,
    reviewCount: app.reviews_count ?? null,
    installs: app.installs ?? null,
    version: app.version ?? null,
    lastUpdated: app.last_update_date ?? null,
    screenshotCount: app.images?.length ?? 0,
    similarApps: (app.similar_apps ?? []).map((related) => ({
      appId: related.app_id,
      title: related.title ?? null,
    })),
  };
  return { ...context, listing };
}
