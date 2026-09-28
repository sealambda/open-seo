import { z } from "zod";
import type { AppDataStore } from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";
import type { AppStore } from "@/shared/aso-metadata-rules";

// Plumbing shared by the app store tools (app-store-tools.ts for store
// searches and listings, app-keyword-tools.ts for the US-only Labs data).

export const DATA_STORE: Record<AppStore, AppDataStore> = {
  app_store: "apple",
  google_play: "google",
};
export const STORE_LABELS: Record<AppStore, string> = {
  app_store: "App Store",
  google_play: "Google Play",
};

export const storeSchema = z
  .enum(["app_store", "google_play"])
  .describe("Which store to read.");

export const appIdSchema = z
  .string()
  .min(1)
  .max(200)
  .describe(
    "App Store numeric id (the digits after `id` in the listing URL, e.g. 570060128) or Google Play package name (e.g. com.duolingo).",
  );

/** Store ids are checked before posting, since a posted task is billed. */
export function normalizeAppId(store: AppStore, raw: string): string {
  const value = raw.trim();
  if (store === "app_store") {
    const digits = /^(?:id)?(\d+)$/i.exec(value)?.[1];
    if (digits) return digits;
  } else if (/^[a-z]\w*(\.[a-z0-9_]\w*)+$/i.test(value)) {
    return value;
  }
  throw new AppError(
    "VALIDATION_ERROR",
    store === "app_store"
      ? `"${raw}" is not an App Store id. Use the digits after "id" in the listing URL, e.g. 570060128.`
      : `"${raw}" is not a Google Play package name. Use the id= value from the listing URL, e.g. com.duolingo.`,
  );
}

export const formatNumber = (value: unknown) =>
  typeof value === "number" ? value.toLocaleString("en-US") : "-";

export const meteredAnnotations = {
  readOnlyHint: false,
  openWorldHint: false,
  destructiveHint: false,
} as const;
