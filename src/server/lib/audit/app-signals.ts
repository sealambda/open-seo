/**
 * Signals that a site has a mobile app: Safari's Smart App Banner, app schema
 * markup, and links to App Store or Google Play listings. Pure helpers for the
 * page analyzer, the page reporters and the crawl fold.
 */
import type { CrawledPageResult } from "./types";

/**
 * The first crawled page that shows each platform's app, or null. A page URL
 * rather than a boolean so an issue can say where the signal came from.
 */
export interface AppSignals {
  ios: string | null;
  android: string | null;
}

export const NO_APP_SIGNALS: AppSignals = { ios: null, android: null };

const APP_STORE_HOSTS = new Set(["apps.apple.com", "itunes.apple.com"]);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function linksToAppStore(url: string) {
  const host = hostOf(url);
  return host !== null && APP_STORE_HOSTS.has(host) && /\/id\d+/.test(url);
}

function linksToGooglePlay(url: string) {
  return (
    hostOf(url) === "play.google.com" &&
    url.includes("/store/apps/details") &&
    url.includes("id=")
  );
}

export function pageAppSignals(
  page: Pick<CrawledPageResult, "url" | "links" | "smartAppBanner">,
): AppSignals {
  const targets = page.links.map((link) => link.targetUrl);
  return {
    ios:
      page.smartAppBanner !== null || targets.some(linksToAppStore)
        ? page.url
        : null,
    android: targets.some(linksToGooglePlay) ? page.url : null,
  };
}

export function mergeAppSignals(a: AppSignals, b: AppSignals): AppSignals {
  return { ios: a.ios ?? b.ios, android: a.android ?? b.android };
}

/**
 * Parses `content="app-id=123, app-argument=https://…"`. Apple documents the
 * two keys (plus the retired `affiliate-data`); anything else is ignored.
 */
export function parseSmartAppBanner(content: string): {
  appId: string | null;
  appArgument: string | null;
} {
  const values = new Map<string, string>();
  for (const part of content.split(",")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim().toLowerCase();
    const value = part.slice(separator + 1).trim();
    if (key && !values.has(key)) values.set(key, value);
  }
  return {
    appId: values.get("app-id") || null,
    appArgument: values.get("app-argument") || null,
  };
}

const APP_SCHEMA_TYPES = new Set([
  "SoftwareApplication",
  "MobileApplication",
  "VideoGame",
]);
const MAX_JSON_LD_DEPTH = 8;

function declaresApp(node: unknown, depth: number): boolean {
  if (depth > MAX_JSON_LD_DEPTH || node === null || typeof node !== "object") {
    return false;
  }
  if (Array.isArray(node)) {
    return node.some((child) => declaresApp(child, depth + 1));
  }
  const type: unknown = "@type" in node ? node["@type"] : undefined;
  const types: unknown[] = Array.isArray(type) ? type : [type];
  if (types.some((t) => typeof t === "string" && APP_SCHEMA_TYPES.has(t))) {
    return true;
  }
  // Apps are often nested (an @graph, or a WebPage's mainEntity).
  return Object.values(node).some((child: unknown) =>
    declaresApp(child, depth + 1),
  );
}

/** True when a JSON-LD block declares an app anywhere in it. */
export function jsonLdDeclaresApp(text: string): boolean {
  try {
    return declaresApp(JSON.parse(text), 0);
  } catch {
    return false;
  }
}

/**
 * Firebase Dynamic Links shut down on 2025-08-25 and every link now returns
 * 404. Only the default `*.page.link` domains are recognizable; links on a
 * custom domain look like any other URL.
 */
export function isFirebaseDynamicLink(url: string) {
  const host = hostOf(url);
  return host !== null && host.endsWith(".page.link");
}
