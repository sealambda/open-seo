import { describe, expect, it } from "vitest";
import { pageAppSignals } from "./app-signals";
import type { PageLink } from "./types";

const link = (targetUrl: string): PageLink => ({
  targetUrl,
  anchor: null,
  isInternal: false,
  isNofollow: false,
});

describe("pageAppSignals", () => {
  it("reads store listing links, and ignores other store pages", () => {
    const url = "https://example.com/download";
    expect(
      pageAppSignals({
        url,
        smartAppBanner: null,
        links: [
          link("https://apps.apple.com/us/app/example/id570060128"),
          link("https://play.google.com/store/apps/details?id=com.example"),
        ],
      }),
    ).toEqual({ ios: url, android: url });
    expect(
      pageAppSignals({
        url,
        smartAppBanner: null,
        links: [
          link("https://apps.apple.com/us/charts"),
          link("https://play.google.com/store/games"),
        ],
      }),
    ).toEqual({ ios: null, android: null });
  });
});
