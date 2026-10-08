/**
 * Fetches the app link files: /.well-known/apple-app-site-association (iOS
 * Universal Links) and /.well-known/assetlinks.json (Android App Links). The
 * verdicts are checkpointed as step state, so they stay tiny: no file bodies.
 */
import { readBodyCapped } from "./html-response";
import { auditRequestHeaders } from "@/server/lib/audit/web-bot-auth";
import { publicFetch } from "@/server/lib/public-fetch";
import type { CrawlerAccess } from "@/shared/crawler-access";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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
    access: CrawlerAccess | null | undefined;
    requireJsonContentType: boolean;
    check: (json: unknown) => AppLinkFileVerdict;
  },
): Promise<AppLinkFileVerdict> {
  try {
    const response = await publicFetch(url, {
      headers: await auditRequestHeaders(url, options.access),
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
  access?: CrawlerAccess | null,
): Promise<AppLinkFileVerdicts> {
  const [appleAppSiteAssociation, assetlinks] = await Promise.all([
    // Apple's current docs name no content type, only HTTPS and no redirects.
    fetchAppLinkFile(`${origin}/.well-known/apple-app-site-association`, {
      access,
      requireJsonContentType: false,
      check: checkAasa,
    }),
    fetchAppLinkFile(`${origin}/.well-known/assetlinks.json`, {
      access,
      requireJsonContentType: true,
      check: checkAssetlinks,
    }),
  ]);
  return { appleAppSiteAssociation, assetlinks };
}
