import { dataforseoGet } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  isNoResultsTask,
  isRecord,
  isTaskInProgress,
  type DataforseoApiResponse,
  type DataforseoResponseLike,
  type DataforseoTaskLike,
} from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";

// ---------------------------------------------------------------------------
// DataForSEO's task queue (task_post, then task_get). DataForSEO bills at
// task_post; task_get collection is free. Post fetchers therefore run through
// the metered client while collectQueuedTask deliberately does not — see
// index.ts.
// ---------------------------------------------------------------------------

// task_post creates a billed task. A 5xx does not prove the provider skipped
// the charge, so those posts must never be replayed.
export const NO_RETRY = { maxServerErrorRetries: 0 } as const;

/**
 * Validates a task_post response and returns the created task's id. `assertOk`
 * applies the standard charged-failure ladder (a rejected post entry still
 * carries the cost DataForSEO charged, and "Invalid Field" rejections stay
 * non-reportable); 20100 "Task Created" is the success status for posts.
 */
export function postedTaskId<T extends DataforseoTaskLike & { id?: string }>(
  response: DataforseoResponseLike<T> | null,
): DataforseoApiResponse<string> {
  const task = assertOk(response, { okTaskStatusCode: 20100 });
  if (!task.id) {
    throw new AppError("INTERNAL_ERROR", "DataForSEO did not return a task id");
  }
  return { data: task.id, billing: buildTaskBilling(task) };
}

export type QueuedTaskOutcome = {
  status: "pending" | "completed";
  /** The first `result` entry once the task completed; null when empty. */
  result: Record<string, unknown> | null;
};

/**
 * Collects one queued task from its task_get path. Deliberately not metered
 * and not wrapped in the billing envelope: collection is free (the task was
 * charged at task_post), so routing it through the metering seam would charge
 * twice.
 */
export async function collectQueuedTask(
  path: string,
): Promise<QueuedTaskOutcome> {
  const response = await dataforseoGet(path);

  const task = response?.tasks?.[0];
  if (!response || response.status_code !== 20000 || !task) {
    throw new AppError(
      "INTERNAL_ERROR",
      response?.status_message || "DataForSEO task_get failed",
    );
  }

  if (isTaskInProgress(task)) return { status: "pending", result: null };

  if (task.status_code !== 20000) {
    // "No Search Results" is a valid empty outcome.
    if (!isNoResultsTask(task)) {
      throw new AppError(
        "INTERNAL_ERROR",
        task.status_message || `DataForSEO task failed (${task.status_code})`,
      );
    }
    return { status: "completed", result: null };
  }

  const first = task.result?.[0];
  return { status: "completed", result: isRecord(first) ? first : null };
}
