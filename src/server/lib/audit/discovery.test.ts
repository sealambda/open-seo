import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAppLinkFiles } from "./discovery";

const ASSETLINKS = JSON.stringify([
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.example",
      sha256_cert_fingerprints: ["14:6D:E9"],
    },
  },
]);

function serve(files: {
  aasa: () => Response | Promise<Response>;
  assetlinks: () => Response | Promise<Response>;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.endsWith("/apple-app-site-association")
        ? files.aasa()
        : files.assetlinks(),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchAppLinkFiles", () => {
  it("accepts well-formed files", async () => {
    serve({
      aasa: () => new Response('{"applinks":{"details":[]}}'),
      assetlinks: () =>
        new Response(ASSETLINKS, {
          headers: { "content-type": "application/json" },
        }),
    });

    expect(await fetchAppLinkFiles("https://example.com")).toEqual({
      appleAppSiteAssociation: { status: "ok" },
      assetlinks: { status: "ok" },
    });
  });

  it("reads a single-page app's HTML shell as missing and a redirect as broken", async () => {
    serve({
      aasa: () =>
        new Response("<!doctype html><html></html>", {
          headers: { "content-type": "text/html" },
        }),
      assetlinks: () =>
        new Response(null, {
          status: 301,
          headers: {
            location: "https://www.example.com/.well-known/assetlinks.json",
          },
        }),
    });

    expect(await fetchAppLinkFiles("https://example.com")).toEqual({
      appleAppSiteAssociation: { status: "missing" },
      assetlinks: {
        status: "invalid",
        problem:
          "redirects to https://www.example.com/.well-known/assetlinks.json",
      },
    });
  });

  it("requires application/json for assetlinks only, and never throws", async () => {
    serve({
      aasa: () => Promise.reject(new TypeError("network down")),
      assetlinks: () =>
        new Response(ASSETLINKS, { headers: { "content-type": "text/plain" } }),
    });

    expect(await fetchAppLinkFiles("https://example.com")).toEqual({
      appleAppSiteAssociation: { status: "unreachable" },
      assetlinks: {
        status: "invalid",
        problem: "served as text/plain, not application/json",
      },
    });
  });
});
