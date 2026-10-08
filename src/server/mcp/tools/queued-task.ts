import type { QueuedTaskOutcome } from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";

// DataForSEO queues these tasks. They normally settle inside the poll window,
// and the tool hands back a resumable taskId when they don't.
const TASK_POLL_ATTEMPTS = 6;
const TASK_POLL_INTERVAL_MS = 4000;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls a paid task until it completes or the window closes. */
export async function pollQueuedTask(
  collect: () => Promise<QueuedTaskOutcome>,
  publicTaskId: string,
): Promise<QueuedTaskOutcome> {
  try {
    for (let attempt = 0; attempt < TASK_POLL_ATTEMPTS; attempt++) {
      if (attempt > 0) await wait(TASK_POLL_INTERVAL_MS);
      const outcome = await collect();
      if (outcome.status === "completed") return outcome;
    }
    return { status: "pending", result: null };
  } catch (error) {
    // The task was already paid for at post; don't let a collection failure
    // discard the only handle to it, or the caller re-posts and pays again.
    const isAppError = error instanceof AppError;
    throw new AppError(
      isAppError ? error.code : "UPSTREAM_UNAVAILABLE",
      `${isAppError ? error.message : "Collecting the queued task failed."} The queued task is still collectable — call again with taskId "${publicTaskId}" at no extra cost.`,
    );
  }
}
