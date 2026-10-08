import type { BillingCustomerContext } from "@/server/billing/subscription";
import {
  fetchAppCompetitors,
  fetchKeywordsForApp,
} from "@/server/lib/dataforseo/app-labs";
import {
  postAppInfoTask,
  postAppSearchTask,
} from "@/server/lib/dataforseo/apps";
import { meter } from "@/server/lib/dataforseo/client";
import { dataforseoPricing } from "@/server/lib/dataforseo/pricing";

/** The metered App Store and Google Play calls. */
export function createDataforseoAppsClient(customer: BillingCustomerContext) {
  const { apps } = dataforseoPricing;
  return {
    // task_post is where DataForSEO charges; collection runs unmetered
    // through fetchAppDataTaskResult (see index.ts).
    searchTaskPost: meter(
      customer,
      postAppSearchTask,
      apps.searchTaskPost,
      "aso",
    ),
    infoTaskPost: meter(customer, postAppInfoTask, apps.infoTaskPost, "aso"),
    keywordsForApp: meter(
      customer,
      fetchKeywordsForApp,
      apps.keywordsForApp,
      "aso",
    ),
    competitors: meter(customer, fetchAppCompetitors, apps.competitors, "aso"),
  };
}
