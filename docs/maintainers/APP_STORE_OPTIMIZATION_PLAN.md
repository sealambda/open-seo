# App Store optimization (ASO) plan

Status: slices 0, 1 and 2 built 2026-09-28 (see "Slice 0 results" and spec
0015); slice 3 is gated on demand. Written 2026-09-26 against `main` at v0.1.9.

Sources: [issue #256](https://github.com/every-app/open-seo/issues/256) and the
[proposal gist](https://gist.github.com/caloon/3553c682e963aba5099ec401b880f783)
it links. Read the gist for background, personas and screen sketches. Where this
file and the gist disagree, this file wins: the facts below were checked against
the code and DataForSEO's docs, and the gist was written against v0.1.6 without
an API key.

## Verified facts

### DataForSEO app endpoints (docs checked 2026-09-26, prices confirmed 2026-09-28)

| Endpoint                                       | Mode      | Coverage                                               | Billing unit                                | Standard price                       |
| ---------------------------------------------- | --------- | ------------------------------------------------------ | ------------------------------------------- | ------------------------------------ |
| `app_data/apple/app_searches`                  | task only | App Store locations (`/v3/app_data/apple/locations`)   | per 100 results; depth default 100, max 700 | $0.0012 / 100                        |
| `app_data/google/app_searches`                 | task only | Play locations                                         | per 30 results; depth default 30, max 200   | $0.0012 / 30                         |
| `app_data/apple/app_info`                      | task only | as above                                               | per result                                  | $0.0006                              |
| `app_data/google/app_info`                     | task only | as above                                               | per result                                  | $0.0006                              |
| `app_data/{apple,google}/app_listings/search`  | live      | DataForSEO's listing database, not a ranked store SERP | per task or per item                        | Apple $0.10 / task; Play not checked |
| `dataforseo_labs/apple/keywords_for_app/live`  | live      | **US and English only**, updated weekly                | per request + per item                      | $0.012 / request + $0.00012 / row    |
| `dataforseo_labs/google/keywords_for_app/live` | live      | **US and English only**, updated weekly                | per request + per item                      | $0.012 / request + $0.00012 / row    |

- The Play Labs path segment is `google`, not `google_play`. The `google_play`
  docs URL returns 404.
- Labs also has `app_competitors`, `app_intersection` and `bulk_app_metrics`
  for both stores. The `app_competitors` docs list the same US and English
  limit; assume it for the other two.
- `keywords_for_app` returns `search_volume` (a vendor estimate with no
  published method), rank per keyword, and `last_updated_time`. Limit up to
  1,000 rows per request.
- High priority (`priority: 2`) costs about twice as much and finishes faster.
  No turnaround time is documented.

What this means:

- Rank checks for a keyword work in any storefront. Keyword discovery, estimated
  volume and competitor discovery only work for the US storefront.
- Store searches and app info are task_post → task_get only. There is no live
  fallback, so anything interactive has to poll and be resumable.
- Cost is small. 100 keywords × 3 storefronts daily on Apple is about $11/month.
  The risk is data depth, accuracy and freshness, not price.

### Repository

- `projects.domain` is nullable and `create_project` takes an optional domain.
  An app-only project needs no change to `projects`.
- `src/server/lib/dataforseo/client.ts` meters every call on the real `costUsd`
  DataForSEO returns. `CreditFeature` in `src/shared/billing-credit-features.ts`
  is only an attribution label. `mapDataforseoPathToCreditFeature` sends any
  unknown module to `site_audit`, so `app_data/*` calls would be labelled as
  site audit today.
- Precedent for task-based calls in MCP: `get_business_reviews` in
  `src/server/mcp/tools/local-seo-tools.ts`. The task_post is metered
  (`client.business.reviewsTaskPost`), collection through
  `fetchBusinessDataTaskResult` is free, the tool polls inside the call, and it
  returns `status: "processing"` plus a `taskId` the caller passes back to resume
  at no cost. Copy this for app searches and app info.
- Web rank tracking is `src/server/workflows/RankCheckWorkflow.ts`,
  `rankCheckPaths.ts` (`runQueuedCheck` / `runLiveCheck`) and
  `src/server/features/rank-tracking/`. That is about 2,500 lines of non-test
  server code before UI and MCP, which is the realistic size of store rank
  tracking. Scheduling is `scheduledRankChecks.ts`, called from the `*/5` cron in
  `src/server.ts`.
- Site audit: site-level fetches (robots.txt, sitemaps) live in
  `src/server/lib/audit/discovery.ts`; per-page checks in `page-analyzer.ts` and
  `issues/page-reporters.ts`; issue types in `src/shared/audit-issues.ts`; test
  fixtures in `badseo/`.
- Schema: SQLite in `src/db/*.schema.ts`, Postgres in `src/db/pg/*.schema.ts`,
  kept in sync by `src/db/schema-parity.test.ts`. Migrations are generated with
  `pnpm db:generate` into `drizzle/` and `drizzle-pg/`.
- The next free spec number is `0015` (the gist's `0011` is taken).
- Onboarding already stores `interestedFeatures`
  (`src/client/features/onboarding/onboardingModel.ts`).

## Corrections to the gist

1. **Play Labs path.** It is `dataforseo_labs/google/...`, which settles the
   gist's open question 1b.
2. **Billing routing.** The gist says to match `path[2]` against `apple` /
   `google_play`. Play app endpoints share `google` with the web Labs endpoints,
   so match the endpoint name at `path[3]` (`keywords_for_app`,
   `app_competitors`, `app_intersection`, `bulk_app_metrics`) as well as
   `path[1] === "app_data"`. A wrong mapping mislabels usage breakdowns. It does
   not change invoice amounts.
3. **Keyword discovery is US-only.** Don't promise "what do I rank for" or
   competitor discovery outside the US.
4. **No live mode for store searches or app info.** `add_app` cannot return the
   listing synchronously, and app rank checks can only use the queued path.
5. **No JSON arrays for storefronts or device classes.** `appRankTrackingConfigs`
   storing them as JSON text breaks the CLAUDE.md rule on normalized data. Use
   one config per (project, app, storefront, locale), the way
   `rank_tracking_configs` has one config per location.
6. **Audit checks are not all page-level.** `apple-app-site-association` and
   `assetlinks.json` are site-level fetches and belong next to robots.txt in
   `discovery.ts`, not in `page-reporters.ts`.
7. **Provenance.** Label the vendor's estimated volume as an estimate and name
   the vendor. Skip the four-class provenance column and `assertSameProvenance`
   until a second data source exists (the console integrations). With one vendor
   it is machinery with nothing to compare.
8. **Size.** "One new file and two lines in billing" describes only the client
   wrapper. The full gist Phase 1 is weeks of work.

## Decisions

- Apps belong to existing projects (the gist's option b). Competitor apps are
  rows in the same table with an ownership flag.
- Build in the order below: slice 0, then 1 and 2. Stop after slice 2 and check
  demand (onboarding answers, issue activity) before starting slice 3.
- Don't build the gist's surface switcher, which swaps the project tab strip
  between website and app. Slice 3 starts with a plain `apps` route.
- Keep the gist's non-goals: no download or revenue estimates for competitors,
  no store scraping, no undocumented Apple endpoints, no composite "ASO score",
  no metadata write-back without the store consoles.

## Slice 0: test the data (hours)

Get the maintainer's OK first. It spends their DataForSEO balance, expected
under $0.10. Use `DATAFORSEO_API_KEY` from the local env with a throwaway script
in scratch space. Don't commit it.

Calls:

1. `app_data/apple/app_searches` for one head term and one mid-tail term, in the
   US and one non-US storefront (GB or DE), depth 100.
2. `app_data/google/app_searches`, same keywords and storefronts, depth 60.
3. `app_data/{apple,google}/app_info` for one known app on each store, in two
   locales.
4. `dataforseo_labs/apple/keywords_for_app/live` and
   `dataforseo_labs/google/keywords_for_app/live` for a mid-tail app, limit 100.
5. One `app_competitors` call per store, to confirm the paths.

Record for each:

- turnaround at normal priority
- results actually returned against depth requested
- whether the top results match what the live store shows for that storefront
- which `app_info` fields are filled per locale (title, subtitle or short
  description, description, category, rating, version, screenshots)
- Labs `last_updated_time`
- actual cost per task from the response

Add the findings to this file under a "Slice 0 results" heading, and ask the
maintainer whether to summarize them on issue #256.

Decision rule: if store search results are shallow, stale or don't match the
store, drop store rank tracking from slice 3. Slices 1 and 2 go ahead either way.

## Slice 0 results

Run 2026-09-28 at normal priority (`priority: 1`). Total spend $0.093,
including a second pass that timed two tasks precisely.

Inputs: keywords "photo editor" (head) and "habit tracker" (mid-tail) in the US
and GB; Duolingo (`570060128`, `com.duolingo`) for app info in US/en and DE/de;
Todoist (`572688855`, `com.todoist`) for Labs, limit 100 for keywords and 10
for competitors.

| Call                               | Turnaround | Returned vs requested       | Cost per call           |
| ---------------------------------- | ---------- | --------------------------- | ----------------------- |
| Apple `app_searches`, depth 100    | ≤ 22 s     | 96–100 of 100               | $0.0012                 |
| Play `app_searches`, depth 60      | ≤ 22 s     | 30, 30, 30, 22 of 60        | $0.0024 (billed for 60) |
| Apple `app_info`                   | ≤ 22 s     | 1 item                      | $0.0006                 |
| Play `app_info`                    | ≤ 22 s     | 1 item                      | $0.0006                 |
| Labs `keywords_for_app`, limit 100 | 0.5–0.7 s  | 100 (335 Apple, 9,260 Play) | $0.024                  |
| Labs `app_competitors`, limit 10   | 1.6 s      | 10                          | $0.0132                 |

Turnaround in the table is an upper bound: every task was done at the first
poll, 15 s after the last post. Polling every 2 s in a second pass measured
4.5 s for Play `app_info` and 8.6 s for an Apple search, well inside a 20 s
poll window. `task_get` cost $0 in every case. Labs pricing works out to
$0.012 per request plus $0.00012 per returned row on both stores.

Store search quality:

- Apple top 10 against the public iTunes Search API for the same term and
  country: 8–10 of 10 apps in common, same top 1 in all four cases. US and GB
  results differ, so storefronts are really separate.
- Play top 10 against the public Play search page (`check_url`): identical order
  in all four cases. The Play page itself only shows 30 results (22 for "photo
  editor" in GB), so depth above 30 is billed and returns nothing more. Use depth
  30 on Play.
- `datetime` on each result is the crawl time, so results are fresh.

`app_info` fields:

| Field                        | Apple                       | Play                                                |
| ---------------------------- | --------------------------- | --------------------------------------------------- |
| title                        | localized                   | localized                                           |
| subtitle / short description | `subtitle`, localized       | **not returned**                                    |
| description                  | localized, plain text       | localized, **HTML-escaped** (`&amp;`)               |
| category                     | **null** (`categories` too) | `main_category` and `genres`, localized             |
| rating, reviews count        | per storefront              | rating per storefront, reviews count global         |
| version                      | filled                      | **null** (size and minimum OS too)                  |
| screenshots                  | `images`, 8                 | `images`, 16–24                                     |
| other                        | `similar_apps`, `languages` | `installs`, `tags`, `similar_apps`, developer email |

Labs:

- `last_updated_time` spans 2026-09-09 to 2026-09-25 on Apple and 2026-08-27 to
  2026-09-26 on Play: weekly-ish, and up to a month old per keyword.
- Apple ranks go to 99. Play ranks stop at 29, which matches the 30-result Play
  surface.
- Play returns fragment keywords with large volumes ("s for" 129,951, "ta to"
  11,523). Apple has fewer ("do to"). The tools must show these as the
  vendor's data, not filter them silently.
- `app_competitors` lists the target app itself first and returns app ids only,
  no titles. The tool drops the self row, and an agent needs
  `get_app_listing` to name competitors.
- Play `app_searches` collects at `task_get/advanced/{id}` like Apple. The
  Play docs page shows the path without `advanced`.

Verdict: store search results are deep (up to the store's own limit), fresh and
match the store. Store rank tracking stays in slice 3.

What changes for slice 1:

- Play store search depth is 30, not 60. The Play `app_searches` billing unit
  is confirmed per 30 results.
- Normal priority is fast enough for the poll-in-call pattern; don't pay for
  `priority: 2`.
- `validate_app_metadata` can't be fed a competitor's Play short description or
  Apple keyword field, because neither is public in this data. Say so in the
  tool and skill.
- Decode HTML entities in Play descriptions before counting characters.

## Slice 1: agent tools, no new tables (a few days)

Built. Spec 0015 records what shipped, which differs from this outline in
places: output schemas are inline in each tool, as in the rest of the MCP code,
and the Labs tools accept the US location only as a schema literal.

Everything here is stateless, so it ships without migrations.

1. **`src/shared/aso-metadata-rules.ts`**, pure, no I/O:
   - Field limits. Apple: name 30, subtitle 30, keyword field 100 bytes (UTF-8). Play: title
     30, short description 80, full description 4,000.
   - Tokenizer, and repeated-token detection across fields.
   - Apple keyword field rules: comma-separated with no spaces; no tokens already
     in the name or subtitle; no plural of a token already used.
   - Keyword coverage. On Apple, a phrase counts as covered when its tokens
     appear across name, subtitle and keyword field together. That is
     vendor-observed behavior, not Apple-documented, so the output says so.
   - Play policy flags: ranking claims ("#1"), promotional words ("free",
     "% off"), repeated word blocks, unwarranted capitals.
2. **MCP `validate_app_metadata`.** Free, no network. Returns per-field length
   and limit, repeated tokens, policy flags, and covered and uncovered target
   keywords. This is the scoring function an agent loops against.
3. **DataForSEO fetchers** in a new `src/server/lib/dataforseo/apps.ts`: store
   search task_post / task_get, app info task_post / task_get, Labs
   `keywords_for_app` and `app_competitors`. Register them in `client.ts` with
   `meter`. Meter the task_post only, like `business.reviewsTaskPost`.
4. **MCP tools:**
   - `get_app_store_results`: who ranks for a keyword in a storefront.
   - `get_app_listing`: one app's public listing.
   - `get_app_ranking_keywords`: Labs, US only.
   - `find_app_competitors`: Labs, US only.

   The first two follow the `get_business_reviews` poll-and-resume pattern. The
   two Labs tools reject non-US locations with a clear error, and their
   descriptions say they are US only.

5. **Billing label.** Add `"aso"` to `CreditFeature` and its label. Route
   `app_data/*` and the Labs app endpoints to it. Add a test for an Apple Labs
   path, a Play Labs path and an `app_data` path.
6. **MCP contract.** Output schemas in `src/server/mcp/output-schemas.ts`,
   registration in `src/server/mcp/server.ts`, and entries in
   `chatgpt-app-submission.json` next to the existing tools.
7. **Skill `app-metadata-optimization`**, created with the `create-repo-skill`
   skill. It loops against `validate_app_metadata` and shows two or three
   candidates with their coverage. It must say that Apple name, subtitle and
   keyword changes ship with the next app version (review required), while Play
   listing changes go live on their own.
8. **Demand signal.** Add an app store optimization option to the onboarding
   interests.
9. **Spec `specs/0015-app-store-optimization.md`**, following the spec rules in
   CLAUDE.md (what and why, alternatives, no line numbers or test plans).

Verify with the `verify-local-mcp` skill and `pnpm ci:check`, then run
`merge-ready`.

Done when an agent can fetch a competitor's listing, get the US keywords an app
ranks for, and produce a validated Apple keyword field for 20 target terms.

## Slice 2: landing-page audit checks (small)

Built differently from this outline; spec 0015 has the shipped design. Both
app link files are fetched after the crawl in their own step, not in discovery.
A broken file is always reported, and only a missing one needs a page that
promotes the app. The per-page signal rides on the crawl chunk results, so no
`auditPages` column was added. Apple's current docs name no content type, so
none is required for its file.

- Page-level, in `page-analyzer.ts` and `page-reporters.ts`:
  - A malformed Smart App Banner (`<meta name="apple-itunes-app">`), including an
    `app-argument` that points at the site root on a deep page. Severity: warning.
  - `SoftwareApplication` or `MobileApplication` JSON-LD missing on a page that
    has an app banner. Severity: info. Don't frame it as a rich-result promise.
- Site-level, fetched in `discovery.ts`:
  - `/.well-known/apple-app-site-association`: valid JSON, served as
    `application/json`, no redirect.
  - `/.well-known/assetlinks.json`: valid `relation`, `package_name` and
    `sha256_cert_fingerprints`.

  Discovery output is checkpointed as Workflow step state with a size cap, so
  store a parsed verdict, not the body.

- Only report missing or invalid app files when the site shows it has an app:
  a Smart App Banner, or links to an App Store or Play listing. Otherwise every
  site without an app gets noise. Those signals only exist after pages are
  analyzed, and discovery runs before the crawl, so discovery cannot decide on
  its own. Fetch and keep the verdict in discovery, record the per-page app
  signal during page analysis (this likely needs a new `auditPages` column in
  both dialects), and raise the issue in the cross-page pass,
  `runMultipageChecks` in `issues/multipage.ts`, which runs over `auditPages`
  after the crawl. Pass the discovery verdict through to that phase in
  `siteAuditWorkflowPhases.ts`.
- The gist says Firebase Dynamic Links shut down on 2025-08-25 and pages still
  using them are worth flagging. Verify that before adding the check.
- Add a `badseo/` fixture for each issue.

Done when the badseo audit raises each new issue and a site with no app signals
raises none.

## Slice 3: apps in projects and store rank tracking (weeks; gated)

Start only after slice 0 passes and slices 1–2 show demand.

- **Tables**, in both dialects:
  - `apps`: project, organization, platform, store app id (Apple numeric id or
    Play package name), ownership flag, primary storefront and locale, display
    title and icon, website URL. Unique on (project, platform, store app id).
  - App rank tracking: config per (project, app, storefront, locale); keywords;
    runs; snapshots. Every column in a unique index is `NOT NULL` with a default,
    because SQLite treats NULLs as distinct and the uniqueness guarantee silently
    stops working.
  - Metadata snapshots: write only when the listing changes, deduplicated by a
    content hash.
- **Workflow.** A new `AppRankCheckWorkflow` on the queued path only. Copy the
  batching and lease logic from `RankCheckWorkflow` instead of generalizing it;
  extract shared code only if a third tracker appears. Step outputs carry
  counters only, and writes stay idempotent against the unique index. Register
  it like `RankCheckWorkflow`: a `workflows` entry (binding and class name) in
  `wrangler.jsonc`, which `alchemy.run.ts` picks up; an export from
  `src/server.ts`; then `pnpm cf-typegen` to regenerate
  `worker-configuration.d.ts`.
- **Scheduling and cost.** Hook into the existing `*/5` dispatcher. Add a cost
  estimate and approval gate like `estimateRankCheckCredits`, and cap keywords
  × storefronts × apps per project.
- **UI.** A `/p/$projectId/apps` list and an app page with rank history and
  listing changes. A plain route, not the surface switcher.
- **MCP.** Create, get and run app rank trackers, mirroring the web tools.
- **Retention.** The gist proposes writing ranks only when they change and
  rolling up raw rows after 90 days. Measure real row counts in a beta project
  before building that.

Done when a user adds an iOS and an Android app to a project, sees daily rank
history per keyword and storefront, and sees a timeline of listing changes for
their own apps and competitors'. Both migrations committed, parity test and
lean-worker bundle check green.

## Later, not planned in detail

- The gist's surface switcher and listing editor UI.
- App Store Connect and Play Console integrations, following the GSC and GA4
  shape. These unlock first-party numbers, the real Apple keyword field, and
  metadata write-back behind explicit confirmation.
- Store listings versus the landing page in Google results, and Search Console
  branded-query overlap.
- Apple Ads search popularity, and app recommendations in LLM answers using the
  existing AI search features.

## Open questions

- Do enough OpenSEO users publish apps? Read the onboarding answers before
  slice 3.
- Will DataForSEO extend Labs app data beyond the US? Until then, non-US
  keyword ideas have to come from listing text and store search results.
