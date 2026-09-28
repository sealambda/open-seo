import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  parseAppListing as ParseAppListing,
  parseAppSearchResult as ParseAppSearchResult,
} from "@/server/lib/dataforseo/apps";
import { findAppCompetitorsTool } from "./app-keyword-tools";
import { getAppListingTool, getAppStoreResultsTool } from "./app-store-tools";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  createDataforseoClient: vi.fn(),
  fetchAppDataTaskResult: vi.fn(),
  getProjectForOrganization: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));

// Keep the real result parsers; only the network and metering are mocked.
vi.mock("@/server/lib/dataforseo", async () => {
  const apps = await vi.importActual<{
    parseAppListing: typeof ParseAppListing;
    parseAppSearchResult: typeof ParseAppSearchResult;
  }>("@/server/lib/dataforseo/apps");
  return {
    createDataforseoClient: mocks.createDataforseoClient,
    fetchAppDataTaskResult: mocks.fetchAppDataTaskResult,
    parseAppListing: apps.parseAppListing,
    parseAppSearchResult: apps.parseAppSearchResult,
    LABS_APP_LOCATION_CODE: 2840,
  };
});

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

const toolContext = makeToolContext();

beforeEach(() => {
  mocks.getProjectForOrganization.mockResolvedValue({
    id: "project_1",
    locationCode: 2826,
    languageCode: "en",
  });
});

describe("get_app_store_results", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("posts Play searches at the store's 30-result depth and returns a store-tagged taskId", async () => {
    vi.useFakeTimers();
    const searchTaskPost = vi.fn().mockResolvedValue("task-1");
    mocks.createDataforseoClient.mockReturnValue({ apps: { searchTaskPost } });
    mocks.fetchAppDataTaskResult.mockResolvedValue({
      status: "pending",
      result: null,
    });

    const pending = getAppStoreResultsTool.handler(
      {
        projectId: "project_1",
        store: "google_play",
        keyword: "habit tracker",
        depth: 200,
      },
      toolContext,
    );
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(searchTaskPost).toHaveBeenCalledWith({
      store: "google",
      keyword: "habit tracker",
      locationCode: 2826,
      languageCode: "en",
      depth: 30,
    });
    expect(result.structuredContent).toMatchObject({
      status: "processing",
      taskId: "google_play:task-1",
    });
  });

  it("rejects a taskId from the other store without posting", async () => {
    const searchTaskPost = vi.fn();
    mocks.createDataforseoClient.mockReturnValue({ apps: { searchTaskPost } });

    await expect(
      getAppStoreResultsTool.handler(
        { projectId: "project_1", store: "app_store", taskId: "google_play:x" },
        toolContext,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(searchTaskPost).not.toHaveBeenCalled();
  });
});

describe("get_app_listing", () => {
  it("resumes a Play listing and decodes its HTML-escaped description", async () => {
    mocks.fetchAppDataTaskResult.mockResolvedValue({
      status: "completed",
      result: {
        items: [
          {
            app_id: "com.duolingo",
            title: "Duolingo",
            description: "Learn &amp; play &#39;every day&#39;",
          },
        ],
      },
    });

    const result = await getAppListingTool.handler(
      {
        projectId: "project_1",
        store: "google_play",
        taskId: "google_play:task-2",
      },
      toolContext,
    );

    expect(mocks.fetchAppDataTaskResult).toHaveBeenCalledWith({
      store: "google",
      endpoint: "app_info",
      taskId: "task-2",
    });
    expect(result.structuredContent).toMatchObject({
      listing: { description: "Learn & play 'every day'" },
    });
  });

  it("rejects a malformed app id before posting a billed task", async () => {
    const infoTaskPost = vi.fn();
    mocks.createDataforseoClient.mockReturnValue({ apps: { infoTaskPost } });

    await expect(
      getAppListingTool.handler(
        { projectId: "project_1", store: "app_store", appId: "Duolingo" },
        toolContext,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(infoTaskPost).not.toHaveBeenCalled();
  });
});

describe("find_app_competitors", () => {
  it("drops the app itself from its competitors", async () => {
    const competitors = vi.fn().mockResolvedValue({
      totalCount: 3,
      competitors: [
        { appId: "com.todoist", sharedKeywords: 9260 },
        { appId: "com.anydo", sharedKeywords: 4086 },
        { appId: "com.ticktick.task", sharedKeywords: 3538 },
      ],
    });
    mocks.createDataforseoClient.mockReturnValue({ apps: { competitors } });

    const result = await findAppCompetitorsTool.handler(
      {
        projectId: "project_1",
        store: "google_play",
        appId: "com.todoist",
        limit: 1,
      },
      toolContext,
    );

    expect(competitors).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 2 }),
    );
    expect(result.structuredContent).toMatchObject({
      totalCount: 2,
      competitors: [{ appId: "com.anydo" }],
    });
  });
});
