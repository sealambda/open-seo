/**
 * Site-level fetches for the site audit crawler: robots.txt, sitemap.xml, and
 * the app link files.
 */
import robotsParser from "robots-parser";
import { XMLParser } from "fast-xml-parser";
import { isSameOrigin, normalizeUrl } from "./url-utils";
import { isCrawlableUrl } from "./url-policy";
import { crawlerHeadersFor, type CrawlerAccess } from "@/shared/crawler-access";

const SITEMAP_FETCH_TIMEOUT_MS = 15_000;
// robots.txt is checkpointed as durable Workflow step state (~1MiB cap, shared
// with the rest of the step's return). RFC 9309 requires parsers to handle at
// least 500 KiB and permits ignoring anything beyond it — Google does exactly
// that — so this cap matches standard crawler behavior while keeping a
// misbehaving server (e.g. HTML at /robots.txt) from blowing the step limit.
const MAX_ROBOTS_TXT_BYTES = 500 * 1024;
const MAX_SITEMAP_DEPTH = 3;
const MAX_SITEMAP_DOCS = 300;
const SITEMAP_CONCURRENCY = 5;
const SITEMAP_RETRIES = 1;
// Sitemap shards can legally reach 50 MB and SITEMAP_CONCURRENCY of them are
// read at once, so unbounded reads can exhaust Worker memory. Oversized
// shards are skipped whole — truncated XML would not parse anyway, and real
// generators shard far below this.
const MAX_SITEMAP_BYTES = 10 * 1024 * 1024;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  isArray: (name) => name === "sitemap" || name === "url",
});

export interface RobotsResult {
  isAllowed: (url: string) => boolean;
  sitemapUrls: string[];
}

/**
 * Fetch the raw robots.txt body (null = missing/unreachable). Kept separate
 * from parsing so Workflows can checkpoint the text as durable step state and
 * re-derive the parsed result deterministically on replay.
 */
async function fetchRobotsTxtText(
  origin: string,
  access?: CrawlerAccess | null,
): Promise<string | null> {
  try {
    const fetched = await fetchFollowingRedirects(
      `${origin}/robots.txt`,
      10_000,
      access,
    );
    if (!fetched?.response.ok) return null;
    return (await fetched.response.text()).slice(0, MAX_ROBOTS_TXT_BYTES);
  } catch (error) {
    console.warn("Failed to fetch robots.txt:", error);
    return null;
  }
}

const MAX_DISCOVERY_REDIRECT_HOPS = 5;

/**
 * Redirects are followed by hand so each hop is revalidated against the crawl
 * policy and crawler-access headers — bot-protection credentials — are
 * re-matched against the hop's host instead of riding along to another site.
 */
async function fetchFollowingRedirects(
  url: string,
  timeoutMs: number,
  access: CrawlerAccess | null | undefined,
): Promise<{ response: Response; finalUrl: string } | null> {
  // One budget for the whole chain, as the automatic follow had.
  const deadline = Date.now() + timeoutMs;
  let current = url;
  for (let hop = 0; hop <= MAX_DISCOVERY_REDIRECT_HOPS; hop++) {
    const response = await fetch(current, {
      headers: {
        "User-Agent": "OpenSEO-Audit/1.0",
        ...crawlerHeadersFor(current, access),
      },
      redirect: "manual",
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    });

    if (response.status < 300 || response.status >= 400) {
      return { response, finalUrl: current };
    }

    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) return null;

    let next: string;
    try {
      next = new URL(location, current).toString();
    } catch {
      return null;
    }
    if (!isCrawlableUrl(next)) return null;
    current = next;
  }
  return null;
}

/** Deterministic: same text in, same result out. Null = everything allowed. */
export function parseRobotsTxt(
  origin: string,
  text: string | null,
): RobotsResult {
  if (text === null) {
    return { isAllowed: () => true, sitemapUrls: [] };
  }

  const robots = robotsParser(`${origin}/robots.txt`, text);
  return {
    isAllowed: (url: string) => robots.isAllowed(url) ?? true,
    sitemapUrls: robots.getSitemaps(),
  };
}

/**
 * Fetch and parse a sitemap (supports sitemap index recursion).
 * Returns a flat list of page URLs found.
 */
function isProbablySitemapXml(
  contentType: string | null,
  body: string,
): boolean {
  if (contentType?.toLowerCase().includes("xml")) {
    return true;
  }

  const trimmed = body.trimStart().toLowerCase();
  return (
    trimmed.startsWith("<?xml") ||
    trimmed.startsWith("<urlset") ||
    trimmed.startsWith("<sitemapindex")
  );
}

function getSitemapLocations(input: unknown): string[] {
  if (!input) return [];
  const entries = Array.isArray(input) ? input : [input];
  return entries
    .map((entry) => {
      if (isRecord(entry)) {
        const loc = entry["loc"];
        return typeof loc === "string" ? loc : null;
      }
      return null;
    })
    .filter((loc): loc is string => typeof loc === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function getParsedSitemapSections(parsed: unknown): {
  sitemap: unknown;
  url: unknown;
} {
  if (!parsed || typeof parsed !== "object") {
    return { sitemap: undefined, url: undefined };
  }

  const root = parsed as {
    sitemapindex?: { sitemap?: unknown };
    urlset?: { url?: unknown };
  };

  return {
    sitemap: root.sitemapindex?.sitemap,
    url: root.urlset?.url,
  };
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return "name" in error && error.name === "TimeoutError";
}

/** Read a response body up to maxBytes; null when the body exceeds it. */
async function readBodyCapped(
  response: Response,
  maxBytes: number,
): Promise<string | null> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

async function fetchSitemapDocumentWithRetry(
  sitemapUrl: string,
  access?: CrawlerAccess | null,
): Promise<{
  nestedSitemaps: string[];
  pageUrls: string[];
  timedOut: boolean;
}> {
  const normalizedSitemapUrl = normalizeUrl(sitemapUrl);
  if (!normalizedSitemapUrl) {
    return { nestedSitemaps: [], pageUrls: [], timedOut: false };
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= SITEMAP_RETRIES; attempt++) {
    try {
      const fetched = await fetchFollowingRedirects(
        normalizedSitemapUrl,
        SITEMAP_FETCH_TIMEOUT_MS,
        access,
      );
      if (!fetched) {
        return { nestedSitemaps: [], pageUrls: [], timedOut: false };
      }
      const { response } = fetched;

      const finalUrl = normalizeUrl(fetched.finalUrl, normalizedSitemapUrl);
      if (!finalUrl || !isSameOrigin(finalUrl, normalizedSitemapUrl)) {
        return { nestedSitemaps: [], pageUrls: [], timedOut: false };
      }

      if (!response.ok) {
        return { nestedSitemaps: [], pageUrls: [], timedOut: false };
      }

      const body = await readBodyCapped(response, MAX_SITEMAP_BYTES);
      if (
        body === null ||
        !isProbablySitemapXml(response.headers.get("content-type"), body)
      ) {
        return { nestedSitemaps: [], pageUrls: [], timedOut: false };
      }

      const parsed = xmlParser.parse(body) as unknown;
      const sections = getParsedSitemapSections(parsed);
      const nestedSitemaps = getSitemapLocations(sections.sitemap)
        .map((loc) => normalizeUrl(loc, finalUrl))
        .filter((loc): loc is string => loc !== null);
      const pageUrls = getSitemapLocations(sections.url)
        .map((loc) => normalizeUrl(loc, finalUrl))
        .filter((loc): loc is string => loc !== null);

      return { nestedSitemaps, pageUrls, timedOut: false };
    } catch (error) {
      lastError = error;
      if (!isTimeoutError(error) || attempt === SITEMAP_RETRIES) {
        break;
      }
    }
  }

  return {
    nestedSitemaps: [],
    pageUrls: [],
    timedOut: isTimeoutError(lastError),
  };
}

/**
 * Discover all page URLs from robots.txt + sitemaps for an origin.
 * Also tries the default /sitemap.xml if not listed in robots.txt.
 */
export async function discoverUrls(
  origin: string,
  maxPages = 50,
  access?: CrawlerAccess | null,
): Promise<{ urls: string[]; robotsText: string | null }> {
  const robotsText = await fetchRobotsTxtText(origin, access);
  const robots = parseRobotsTxt(origin, robotsText);

  // Collect sitemap URLs: from robots.txt + default location
  const sitemapSources = new Set(robots.sitemapUrls);
  sitemapSources.add(`${origin}/sitemap.xml`);

  const maxDiscoveredUrls = Math.min(Math.max(maxPages * 20, 500), 50_000);
  const allUrls = new Set<string>();

  const queue: Array<{ url: string; depth: number }> = Array.from(
    sitemapSources,
  )
    .map((url) => normalizeUrl(url, origin))
    .filter((url): url is string => url !== null)
    .filter((url) => isSameOrigin(url, origin))
    .map((url) => ({ url, depth: MAX_SITEMAP_DEPTH }));
  const seenSitemapDocs = new Set<string>();
  let fetchedDocs = 0;
  let failedDocs = 0;
  let timedOutDocs = 0;

  while (queue.length > 0 && allUrls.size < maxDiscoveredUrls) {
    if (fetchedDocs >= MAX_SITEMAP_DOCS) {
      break;
    }
    const batch = queue.splice(0, SITEMAP_CONCURRENCY);
    await Promise.all(
      batch.map(async ({ url, depth }) => {
        const normalizedUrl = normalizeUrl(url);
        if (
          !normalizedUrl ||
          !isSameOrigin(normalizedUrl, origin) ||
          depth <= 0 ||
          seenSitemapDocs.has(normalizedUrl)
        ) {
          return;
        }

        seenSitemapDocs.add(normalizedUrl);
        fetchedDocs += 1;

        const result = await fetchSitemapDocumentWithRetry(
          normalizedUrl,
          access,
        );
        if (
          result.pageUrls.length === 0 &&
          result.nestedSitemaps.length === 0
        ) {
          failedDocs += 1;
          if (result.timedOut) {
            timedOutDocs += 1;
          }
          return;
        }

        for (const pageUrl of result.pageUrls) {
          if (!isSameOrigin(pageUrl, origin)) continue;
          if (allUrls.size >= maxDiscoveredUrls) break;
          allUrls.add(pageUrl);
        }

        if (depth <= 1) return;

        for (const nestedUrl of result.nestedSitemaps) {
          if (!isSameOrigin(nestedUrl, origin)) continue;
          if (!seenSitemapDocs.has(nestedUrl)) {
            queue.push({ url: nestedUrl, depth: depth - 1 });
          }
        }
      }),
    );
  }

  if (failedDocs > 0) {
    console.warn(
      `Sitemap discovery completed with partial failures for ${origin}: fetched=${fetchedDocs}, failed=${failedDocs}, timedOut=${timedOutDocs}, discoveredUrls=${allUrls.size}`,
    );
  }

  // Cap at the crawl's page budget: these are seeds, the crawl can never use
  // more — and an uncapped list can blow the ~1MiB Workflow step-state limit.
  return {
    urls: Array.from(allUrls).slice(0, maxPages),
    robotsText,
  };
}

// ---------------------------------------------------------------------------
// App link files: /.well-known/apple-app-site-association (iOS Universal
// Links) and /.well-known/assetlinks.json (Android App Links). The verdicts
// are checkpointed as step state, so they stay tiny: no file bodies.
// ---------------------------------------------------------------------------

const APP_LINK_FILE_TIMEOUT_MS = 10_000;
// Both files are small by design; anything bigger is not what we want to parse.
const MAX_APP_LINK_FILE_BYTES = 256 * 1024;
const AASA_SERVICES = ["applinks", "webcredentials", "appclips"];
const HANDLE_ALL_URLS = "delegate_permission/common.handle_all_urls";
// Header values from the audited site are echoed into the verdict; keep it tiny.
const MAX_ECHOED_HEADER_CHARS = 200;

export type AppLinkFileVerdict =
  | { status: "ok" }
  | { status: "missing" }
  /** Blocked, timed out or erroring: says nothing about the file. */
  | { status: "unreachable" }
  | { status: "invalid"; problem: string };

export interface AppLinkFileVerdicts {
  appleAppSiteAssociation: AppLinkFileVerdict;
  assetlinks: AppLinkFileVerdict;
}

function checkAasa(json: unknown): AppLinkFileVerdict {
  if (!isRecord(json) || Array.isArray(json)) {
    return { status: "invalid", problem: "not a JSON object" };
  }
  return AASA_SERVICES.some((service) => service in json)
    ? { status: "ok" }
    : {
        status: "invalid",
        problem: "declares none of applinks, webcredentials or appclips",
      };
}

function isAppLinkStatement(statement: unknown): boolean {
  if (!isRecord(statement) || !isRecord(statement.target)) return false;
  const { relation, target } = statement;
  const fingerprints = target.sha256_cert_fingerprints;
  return (
    Array.isArray(relation) &&
    relation.includes(HANDLE_ALL_URLS) &&
    target.namespace === "android_app" &&
    typeof target.package_name === "string" &&
    target.package_name !== "" &&
    Array.isArray(fingerprints) &&
    fingerprints.length > 0
  );
}

function checkAssetlinks(json: unknown): AppLinkFileVerdict {
  if (!Array.isArray(json)) {
    return { status: "invalid", problem: "not a JSON array of statements" };
  }
  return json.some(isAppLinkStatement)
    ? { status: "ok" }
    : {
        status: "invalid",
        problem:
          "no statement grants handle_all_urls to an android_app with a package_name and sha256_cert_fingerprints",
      };
}

async function fetchAppLinkFile(
  url: string,
  options: {
    requireJsonContentType: boolean;
    check: (json: unknown) => AppLinkFileVerdict;
  },
): Promise<AppLinkFileVerdict> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "OpenSEO-Audit/1.0" },
      // Both platforms refuse redirected files, so a redirect is the finding.
      redirect: "manual",
      signal: AbortSignal.timeout(APP_LINK_FILE_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      return {
        status: "invalid",
        problem: `redirects${location ? ` to ${location.slice(0, MAX_ECHOED_HEADER_CHARS)}` : ""}`,
      };
    }
    if (response.status === 404 || response.status === 410) {
      return { status: "missing" };
    }
    if (!response.ok) return { status: "unreachable" };

    const body = await readBodyCapped(response, MAX_APP_LINK_FILE_BYTES);
    if (body === null) {
      return { status: "invalid", problem: "larger than 256 KB" };
    }
    // Single-page apps answer every path with their HTML shell.
    if (body.trimStart().startsWith("<")) return { status: "missing" };

    const contentType = response.headers.get("content-type") ?? "";
    if (
      options.requireJsonContentType &&
      !contentType.toLowerCase().includes("application/json")
    ) {
      return {
        status: "invalid",
        problem: `served as ${contentType.slice(0, MAX_ECHOED_HEADER_CHARS) || "no content type"}, not application/json`,
      };
    }
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return { status: "invalid", problem: "not valid JSON" };
    }
    return options.check(json);
  } catch {
    return { status: "unreachable" };
  }
}

/** Checks both app link files. Never throws; failures read as unreachable. */
export async function fetchAppLinkFiles(
  origin: string,
): Promise<AppLinkFileVerdicts> {
  const [appleAppSiteAssociation, assetlinks] = await Promise.all([
    // Apple's current docs name no content type, only HTTPS and no redirects.
    fetchAppLinkFile(`${origin}/.well-known/apple-app-site-association`, {
      requireJsonContentType: false,
      check: checkAasa,
    }),
    fetchAppLinkFile(`${origin}/.well-known/assetlinks.json`, {
      requireJsonContentType: true,
      check: checkAssetlinks,
    }),
  ]);
  return { appleAppSiteAssociation, assetlinks };
}
