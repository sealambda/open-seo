# Agent readiness and AI discovery plan

Status: slice 0 (this plan) in review. No product code yet. Written
2026-10-19 against `main` at v0.1.13 (`d7ea7852`).

Goal: the site audit measures how well a site can be found, read and used by AI
assistants and agents, and the AI visibility and analytics features measure the
result. Today the audit sets one `hasStructuredData` boolean and has no AI
crawler, llms.txt or agent-file checks.

## Corrections to the brief

Each of these contradicts something the task brief assumed. Per the brief,
the fact wins. Each one is listed under Open questions where it changes scope.

1. **Google-Extended also controls Gemini grounding, not only training.**
   Google's crawler page (updated 2026-10-15) says the token covers training
   future Gemini models and grounding in Gemini Apps and Vertex AI. Blocking it
   can therefore remove a site from live Gemini app answers. The
   `ai-visibility-audit` skill currently says it "affects model training, not
   live answers"; that sentence needs fixing.
2. **AI Overviews and AI Mode are opted out through a Search Console control,
   not robots.txt.** That control is available to all sites since 2026-08-31.
   It does not affect training, and Google-Extended does not affect inclusion
   in Search. The audit cannot see the Search Console setting; the skill should
   tell the user to check it.
3. **OpenAI does not say in primary docs that ChatGPT search uses Bing.** It
   says "third-party search providers" and names Microsoft in its privacy
   references. Issue copy can say a Bingbot block removes the site from Bing
   and Copilot. It must not say "invisible to ChatGPT".
4. **The MCP Server Card path in the brief is not the standard one.** SEP-2127
   (Final, merged 2026-10-06) rejects `/.well-known/mcp/server-card.json`.
   Discovery goes through `/.well-known/ai-catalog.json`, which points to cards
   served at `<mcp-url>/server-card`. isitagentready.com still checks the old
   path. We check `ai-catalog.json` and report the old path as legacy.
5. **User-triggered fetchers mostly ignore robots.txt.** OpenAI
   (`ChatGPT-User`), Perplexity (`Perplexity-User`), Google (`Google-Agent`),
   Meta and Amazon say these may not follow it. Anthropic's single statement
   covers `Claude-User` too. A robots.txt block of a user fetcher is often
   unenforced, and issue copy must say so.
6. **Google's local business docs require only `name` and `address`.**
   `telephone`, `url`, `openingHoursSpecification` and `geo` are recommended.
   The brief called all of these required.
7. **GA4 has had a native "AI Assistant" default channel since 2026-05-13.**
   Google does not publish its referrer list. The examples it names are ChatGPT,
   Gemini, Deepseek, Copilot and Grok. AI Overviews and AI Mode are excluded.
8. **llms.txt validity is just an H1.** The spec says the H1 is "the only
   required section". "No links" is not a validity failure.
9. **Ours was already on v0.1.13.** Our `main` matched upstream `main` at
   v0.1.13, not v0.1.12, so the sync was a no-op.
10. **The ASO plan's location differs from the brief.** It is
    `docs/maintainers/APP_STORE_OPTIMIZATION_PLAN.md`, not `maintainer-docs/`.

## Verified facts (checked 2026-10-19 unless noted)

Sources were read directly, or through a fetch summary where marked (s). The
(s) items get re-read when the slice that depends on them starts.

### AI crawler tokens

Purpose values used by the shared constant:

- `search_index`: a search engine's own index.
- `ai_search`: an index or retrieval used for live AI answers.
- `user_fetch`: fetches a page when a person asks.
- `training`: model training only.

| Token                  | Operator     | Purpose                                         | Honors robots.txt (vendor)             | Source                                             |
| ---------------------- | ------------ | ----------------------------------------------- | -------------------------------------- | -------------------------------------------------- |
| `Googlebot`            | Google       | search_index (Search, AI Overviews, AI Mode)    | yes                                    | developers.google.com crawlers                     |
| `Bingbot`              | Microsoft    | search_index (Bing, Copilot)                    | yes; no separate AI token              | Bing webmaster guidelines (s)                      |
| `OAI-SearchBot`        | OpenAI       | ai_search (ChatGPT search)                      | yes, about 24 h to take effect         | developers.openai.com/api/docs/bots (s)            |
| `ChatGPT-User`         | OpenAI       | user_fetch                                      | "may not apply"                        | same (s)                                           |
| `GPTBot`               | OpenAI       | training                                        | yes                                    | same (s)                                           |
| `OAI-AdsBot`           | OpenAI       | ad landing-page checks                          | not stated                             | same (s)                                           |
| `Claude-SearchBot`     | Anthropic    | ai_search                                       | yes                                    | support.claude.com/en/articles/8896518 (s)         |
| `Claude-User`          | Anthropic    | user_fetch                                      | yes (one statement for all three bots) | same (s)                                           |
| `ClaudeBot`            | Anthropic    | training                                        | yes                                    | same (s)                                           |
| `PerplexityBot`        | Perplexity   | ai_search (not training)                        | yes                                    | docs.perplexity.ai/guides/bots (s)                 |
| `Perplexity-User`      | Perplexity   | user_fetch                                      | "generally ignores"                    | same (s)                                           |
| `Google-Extended`      | Google       | training **and Gemini Apps / Vertex grounding** | control token, no crawler of its own   | developers.google.com crawlers, updated 2026-10-15 |
| `Google-Agent`         | Google       | user_fetch                                      | "generally ignore"                     | Google user-triggered fetchers page (s)            |
| `Applebot`             | Apple        | search_index (Siri, Spotlight); data may train  | yes                                    | support.apple.com/en-us/119829 (s)                 |
| `Applebot-Extended`    | Apple        | training (control token; does not crawl)        | yes                                    | same (s)                                           |
| `DuckAssistBot`        | DuckDuckGo   | ai_search (not training)                        | yes, about 72 h                        | duckduckgo.com help (s)                            |
| `Amzn-SearchBot`       | Amazon       | ai_search                                       | yes                                    | developer.amazon.com/amazonbot (s)                 |
| `Amzn-User`            | Amazon       | user_fetch                                      | "may not follow all"                   | same (s)                                           |
| `Amazonbot`            | Amazon       | training                                        | yes                                    | same (s)                                           |
| `meta-webindexer`      | Meta         | ai_search (Meta AI)                             | yes                                    | developers.facebook.com web crawlers (s)           |
| `meta-externalfetcher` | Meta         | user_fetch                                      | "may bypass"                           | same (s)                                           |
| `meta-externalagent`   | Meta         | training                                        | yes                                    | same (s)                                           |
| `MistralAI-Index`      | Mistral      | ai_search                                       | not stated                             | docs.mistral.ai/robots (s)                         |
| `MistralAI-User`       | Mistral      | user_fetch                                      | not stated                             | same (s)                                           |
| `MistralAI-Training`   | Mistral      | training                                        | yes                                    | same (s)                                           |
| `CCBot`                | Common Crawl | training (open corpus)                          | robots.txt is the documented opt-out   | commoncrawl.org/ccbot (s)                          |

- **No primary source checked:** Bytespider and Cohere. They are left out
  until one is found.
- **`Google-NotebookLM`** is being replaced by `Google-GeminiNotebook`; Google
  supports the old token until August 2026. Both are user fetchers.
- **Search Console gen-AI control.** It opts a site out of AI Overviews, AI
  Mode and generative AI in Discover. It is not a ranking signal and does not
  affect training. Source: support.google.com/webmasters/answer/16908024,
  rolled out to all sites 2026-08-31.

### Content-Signal (Cloudflare, 2025-09-24)

- **Syntax:** a `Content-Signal:` line inside a robots.txt user-agent group,
  for example `Content-Signal: search=yes, ai-train=no`. Values are
  comma-separated `key=yes|no`.
- **`search`:** build a search index and return links and excerpts. It "does
  not include providing AI-generated search summaries".
- **`ai-input`:** use in real-time AI answers: retrieval, grounding,
  summaries.
- **`ai-train`:** training or fine-tuning.
- **Absence:** "Yes means go, no means stop, absence conveys no meaning."
- **Scope:** the examples put the line in a user-agent group. Neither source
  defines path scoping or inheritance from `*`. We treat a signal as applying
  to the group it sits in, and say so in the issue.
- **Status:** IETF individual draft `draft-romm-aipref-contentsignals-00`,
  vocabulary only, expired 2026-04-04 with no later revision found.
  contentsignals.org was not readable; it sits behind a JavaScript challenge.
- **Cloudflare default:** Markdown for Agents responses carry a default
  `Content-Signal: ai-train=yes, search=yes, ai-input=yes` header when the
  origin sends none. That is a response header, not robots.txt, and slice 1
  does not read it.

### llms.txt (llmstxt.org)

- **Location:** `/llms.txt`, or a subpath such as `/docs/llms.txt`.
- **Required:** an H1 with the site or project name only.
- **Optional, in order:** a blockquote summary, prose, then H2 sections with
  `[name](url): notes` lists. An `## Optional` section marks skippable links.
- **Content type:** not specified. llmstxt.org itself serves `text/plain`.
- **llms-full.txt** is a vendor convention, not part of the spec.
- **Validity rule for slice 1:**
  - Invalid: the response is 2xx with an HTML body (a soft 404 or SPA
    fallback), or the first non-blank line is not `# `.
  - A valid H1 with no links passes, but the issue copy mentions that links
    help.

### Markdown content negotiation

- **No standard.** It is HTTP content negotiation used by vendors.
- **Cloudflare Markdown for Agents:**
  - `Accept: text/markdown` returns `Content-Type: text/markdown;
charset=utf-8` with `Vary: Accept`.
  - HTML only, up to 6 MiB, on Pro plans and above.
  - `x-markdown-tokens` appears only in a February 2026 blog post, not in the
    current docs.
- **Vercel:** the same negotiation, plus `.md` URLs. (s)
- **llmstxt.org** also suggests `page.md` URLs and a
  `Link: <…md>; rel="alternate"; type="text/markdown"` header.
- **Slice 1 rule:** supported means a 2xx response whose `Content-Type` starts
  with `text/markdown`.

### `.well-known` discovery files

| Path                                   | Status                                                                                        | Valid when                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------- |
| `/.well-known/ai-catalog.json`         | MCP SEP-2127 discovery, Final 2026-10-06; wire format still in `experimental-ext-server-card` | 2xx and parses as JSON object |
| `/.well-known/mcp/server-card.json`    | rejected by SEP-2127; still checked by isitagentready.com                                     | reported as legacy only       |
| `/.well-known/agent-card.json`         | A2A spec v1.0.0 (2026-03-12), §14.3                                                           | 2xx JSON object               |
| `/.well-known/agent.json`              | A2A name before v0.3.0 (2025-07-30)                                                           | reported as legacy only       |
| `/.well-known/agent-skills/index.json` | Cloudflare RFC, Draft v0.2.0 (2026-03-12); `$schema` required                                 | 2xx JSON with `$schema`       |
| `/.well-known/api-catalog`             | RFC 9727, Standards Track (June 2025); MUST be `application/linkset+json`                     | 2xx JSON with `linkset`       |

isitagentready.com (Cloudflare, April 2026):

- It runs 23 checks in 5 categories.
- Its MCP endpoint is `https://isitagentready.com/mcp`. It has one tool,
  `scan_site`, with inputs `url`, `profile` (`all`, `content` or `apiApp`) and
  `enabledChecks[]`. It returns a level from 0 to 5 and pass or fail per check.
- It does not check llms.txt.

### GA4

- **Native channel.** "AI Assistant" became a default channel on 2026-05-13.
  It matches medium `ai-assistant`, which GA sets when the referrer is on
  Google's list (unpublished). It sits after Organic Search and before
  Referral.
- **`sessionSource`.** No Google document lists values per assistant. Source
  is the referrer hostname, so we expect `chatgpt.com`, `chat.openai.com`
  (legacy), `perplexity.ai`, `gemini.google.com`, `copilot.microsoft.com` and
  `claude.ai`. Unverified against real data; see Open questions.
- **UTM tags.** OpenAI's publisher FAQ says ChatGPT adds
  `utm_source=chatgpt.com` to referral links. (s) We found no primary source
  for Perplexity or Copilot UTM tags.
- **Direct traffic.** Many AI-influenced visits arrive with no referrer (app
  webviews, copied links) and count as Direct. Only secondary sources say this;
  the tool copy says "can", not "does".
- **Search Console AI report.** Search Console reports AI Overviews and AI
  Mode impressions since 2026-06-03, for all sites since 2026-08-31. Whether
  the API exposes them is not stated.

### Bing Webmaster Tools API (learn.microsoft.com/en-us/bingwebmaster)

- **Auth:**
  - An API key per Bing user, covering all of that user's verified sites,
    generated under Settings → API Access.
  - Or OAuth 2.0 on Bing's own server (`bing.com/webmasters/oauth/*`), not
    Microsoft identity. Scopes are `webmaster.read` and `webmaster.manage`;
    access tokens last about 1 hour.
- **Protocol:** JSON only since SOAP and POX were retired on 2026-08-31:
  `https://ssl.bing.com/webmaster/api.svc/json/<Method>?siteUrl=…&apikey=…`.
- **Read methods:** `GetUserSites` (`IsVerified`), `GetQueryStats` (weekly),
  `GetPageStats`, `GetQueryPageStats`, `GetRankAndTrafficStats`,
  `GetCrawlStats`, `GetCrawlIssues`, `GetUrlInfo`.
- **Rate limits:** not documented in any primary source found.
- **Terms:** accepted in the BWT UI and linked to the Microsoft Services
  Agreement. Not read in full.
- **AI Performance** (Copilot and Bing AI citations, preview since 2026-02-10)
  is CSV export only. No API was found. (s)

### DataForSEO and the cost of repeated samples

Per answer, raw USD from the existing constants, with hosted credits per
answer in brackets:

| Engine                                | Queued (scheduled) | Live (Run now) |
| ------------------------------------- | ------------------ | -------------- |
| ChatGPT, Gemini, AI Overviews         | $0.0012 [2]        | $0.004 [6]     |
| Perplexity (always model API, search) | $0.04 [52]         | $0.04 [52]     |
| Claude (always model API, search)     | $0.18 [231]        | $0.18 [231]    |

- **Cost per month = prompts × engines × N × checks per month.** Example: 20
  prompts, weekly (4 checks a month):
  - ChatGPT + Gemini + AI Overviews at N = 1 is $0.29 raw, 480 credits. At
    N = 5 it is $1.44, 2,400 credits.
  - Adding Claude and Perplexity at N = 5 adds $88 raw a month. The model-API
    engines dominate, so the estimate must show N before any run.
- **Determinism.** DataForSEO's ChatGPT live endpoint defaults to temperature
  0.94 and top_p 0.92 and has no seed. (s) Answers are expected to vary, which
  is the point of sampling.
- **Unverified:** whether a repeated identical post is cached. This is slice
  4's first gate.
- **Vendor list prices** (s), for reference:
  - LLM Responses live: $0.0006 per task plus provider tokens.
  - LLM Responses standard: $0.0002 per task plus a refundable advance.
  - AI Mode SERP: $0.0012 standard, $0.004 live.
  - The constants in `pricing.ts` are what OpenSEO charges against and stay
    the source of truth.

## Upstream landscape (checked 2026-10-19)

The task brief assumed we would propose PRs upstream. That no longer holds.

- **Upstream does not merge external PRs.** `docs/CONTRIBUTING.md` says issues
  are the way to contribute "for the next few months" (since 2026-08-12). A PR
  is still welcome as a proof of concept for an issue, but it won't be merged.
  So "mergeable as they are" only matters inside the fork.
- **Both big themes are on upstream's roadmap under "Soon":** "Agent readiness
  checks in site audits" and "Bing Webmaster Tools integration".
  "IndexNow support" is under "Highest priority".
- **Issue #99** (open) already proposes AI crawlers in robots.txt, llms.txt,
  Markdown alternates and JSON-LD graph quality. Two community PRs implemented
  parts of it. #122 (crawler and llms.txt checks) is closed unmerged. #204
  (schemamap and JSON-LD linked-graph checks) is open and stale since
  2026-08-12. Both got the "not accepting PRs" reply.
- **Issue #232** (open) asks for Bing Webmaster Tools. PR #411 (open, updated
  2026-10-16) implements it with an API key and OAuth, three read-only MCP
  tools, and a spec.
- **PR #427** (open) adds a separate "AI access audit" feature with its own
  workflow and tables. It does not extend the site audit.
- **Spec numbers.** `main` ends at `0015-website-dashboard.md`. Our fork's ASO
  work adds a second `0015` (`specs/0015-app-store-optimization.md` on the
  `aso/*` branches, at the repo root rather than under `docs/maintainers/specs/`).
  Open upstream PRs #411 and #427 both claim `0016`. This plan uses **0017**
  for the first new spec, to avoid all three collisions. If upstream lands a
  0017 first, we renumber when we rebase.

What this means for the plan:

- Build the slices in the fork, shaped so upstream could lift them, and keep
  each diff small and in its own files. Upstream will probably build its own
  version. When it lands, we drop ours instead of fighting rebase conflicts.
- Upstream contribution is issue text: a comment on #99 plus small new issues
  for what #99 does not cover (see "Issue drafts").
- Slice 5 (Bing) would duplicate #411 and the roadmap item. See its section.

## Repository facts (checked 2026-10-19)

### Site audit

- **Discovery.** `discoverUrls` in `src/server/lib/audit/discovery.ts` fetches
  `/robots.txt`, capped at 500 KiB, and returns the raw text. The workflow
  checkpoints the text in the `discover-urls-v2` step and re-parses it with
  `robots-parser` outside the step. Changing that step's return shape forces a
  step rename, so new checks should not touch it.
- **Redirect handling.** Discovery follows redirects by hand
  (`fetchFollowingRedirects`, 5 hops), re-checks each hop with `isCrawlableUrl`
  and re-matches crawler-access headers per host.
  - It does not re-run `normalizeAndValidateStartUrl` per hop, and only the
    sitemap path checks that the final URL is same-origin.
  - New fetches must be stricter (see Slice 1).
  - This plan does not change discovery itself; the gap is flagged here only.
- **Start URL.** `AuditService` validates it with `normalizeAndValidateStartUrl`.
  `resolveStartUrlRedirects` re-validates every hop before the audit anchors
  its origin. So the audit origin is already SSRF-checked.
- **User agent and throttle.** Discovery, start-URL probing and the crawler all
  send `OpenSEO-Audit/1.0` plus crawler-access headers for the matching host.
  The crawl throttle (`crawl-throttle.ts`) paces only crawl-chunk fetches.
  Discovery's few fetches are sequential and unthrottled, with 10–15 s
  timeouts.
- **Site-level issues.** `audit_issues.page_id` is nullable. `crawl-rate-limited`
  is pushed in the `multipage-checks` finalize step with `pageId: null` and the
  start URL as `pageUrl`.
- **ASO precedent (fork only).** The ASO branch added a post-crawl
  `app-link-files` step that fetches two `.well-known` files and returns small
  verdicts, then raises issues in `multipage-checks`. Slice 1 copies that shape
  so the two branches merge cleanly.
- **Severity per type.** The issue registry (`src/shared/audit-issues.ts`)
  fixes severity per issue type, so one finding with two severities needs two
  types.
- **Details rendering.** `IssuesView` renders `details` as flat `key: value`
  pairs and joins arrays with " → ". Nested objects render as
  `[object Object]`. Details must stay flat strings, numbers or short string
  arrays.
  - CSV export and `get_audit_issues` pass details through unchanged.
  - New issue types need no UI or export changes if they follow this rule.
- **JSON-LD today.** `page-analyzer.ts` streams HTML through htmlparser2 and
  sets `hasStructuredData` when it sees `<script type="application/ld+json">`.
  Script text is suppressed (`NON_CONTENT_TAGS`), so parsing JSON-LD needs a
  capped capture of that text. `has_structured_data` is written to
  `audit_pages`, and nothing in the client reads it.
- **Upstream is removing per-page JSON columns.** #878 dropped
  `heading_order_json`, `images_json` and `hreflang_tags_json` from
  `audit_pages`. New per-page data should be normalized rows, not JSON columns.
- **BadSEO** (`tests/badseo`) is a public site, badseo.dev. Its harness checks
  that every issue type is triggered by some fixture and that each fixture
  raises exactly its expected issues. It has one origin and one robots.txt, so a
  site-level fixture changes the live site's robots.txt.
- **Prior art in #204:** `jsonld.ts`, a streaming-safe accumulator with caps of
  25 blocks, 64,000 characters per block, depth 12 and 200 tracked `@id`s.
  Worth copying.

### AI visibility

- **Engines.** ChatGPT, Gemini and Google AI Overviews use DataForSEO's LLM
  scraper: queued on a schedule, live on "Run now". Claude and Perplexity always
  use the live LLM Responses API.
- **Cost constants.**
  - `AI_RECORD_COST_USD` is $0.0012 per queued answer.
  - `AI_LIVE_RECORD_COST_USD` is $0.004 per live answer.
  - `llmResponseUsd` with web search costs $0.18 for Claude and $0.04 for
    Perplexity.
  - Hosted credits are `ceil(usd × 1.28 × 1000)` per answer: 2, 6, 231 and 52
    credits respectively.
- **One answer per cell today.** `ai_observations` has a unique index on (run,
  prompt, engine). `scope.prompts.flatMap(() => scope.engines)` sizes a run in
  four places: estimate, credit gate, max-cost check and row creation.
- **Trend.** `aiVisibilityTrend.ts` already tallies `answers` and `mentions` per
  cell and computes a mention rate as mentions ÷ answers. Extra samples flow
  into that tally without new math.
- **Run size limits.** Up to 100 prompts × 5 engines = 500 answers per run
  today. Live answers are collected in batches of 6, each batch in its own
  Workflow step with a 10-minute timeout.

### Analytics and Search Console

- **GA4 tool.** `get_google_analytics_traffic_acquisition` takes
  `breakdown: channel_group | source_medium | campaign`. `Ga4ReportDefinitions`
  maps each breakdown to one GA4 dimension. Adding a breakdown value is one
  enum member, one dimension mapping and one filter.
- **Search Console.** It uses its own OAuth flow, with grants encrypted in
  `account`, and one property per project in `gsc_connections`. Reads are free
  and not metered.

### Skills and plugin

- **Plugin version.** `ai-visibility-audit`, `seo-audit`, `local-seo` and
  `seo-report` are shipped skills. The plugin is at 1.0.21 in all three
  manifests.
- **Bot list in `ai-visibility-audit`.** The skill lists `GPTBot`,
  `OAI-SearchBot`, `ChatGPT-User`, `Google-Extended`, `PerplexityBot` and
  `ClaudeBot`. It explains search versus training for OpenAI and Google only.
  It does not name `Claude-SearchBot`, `Claude-User`, `Perplexity-User` or
  `Bingbot`. It also says `Google-Extended` affects training only, which is
  now wrong (correction 1). Slice 1 updates the skill to match the shared
  constant: a minor edit, run through `pnpm sync-plugin-skills`, with no
  version bump.

## Decisions

### Where each check runs

| Check                       | Runs in                                                      | Level       | New fetch            |
| --------------------------- | ------------------------------------------------------------ | ----------- | -------------------- |
| AI crawler access           | `multipage-checks` (finalize), from checkpointed robots text | site        | none                 |
| Content-Signal              | same, own line parse                                         | site        | none                 |
| llms.txt                    | new post-crawl `agent-files` step                            | site        | 1                    |
| Markdown negotiation        | same step, the start URL                                     | site        | 1                    |
| Agent discovery files       | same step                                                    | site        | 6 (2 of them legacy) |
| JSON-LD parse, schema types | `page-analyzer.ts` during the crawl                          | page        | none                 |
| Invalid JSON-LD             | `page-reporters.ts`                                          | page        | none                 |
| Local business markup       | `page-reporters.ts` (incomplete); finalize (none found)      | page / site | none                 |

- **AI crawler evaluation** uses the robots text that `discover-urls-v2`
  already checkpoints.
  - `robots-parser`'s `isAllowed(url, token)` decides whether a bot may fetch a
    URL.
  - `getMatchingLineNumber(url, token)` points at the exact rule, which the
    issue quotes.
  - A bot counts as blocked when it may not fetch the start URL, or any crawled
    HTML page that OpenSEO itself was allowed to fetch. That second set is the
    concrete meaning of "key sections".
  - Details give the blocked page count and up to three example URLs. Each
    issue states only what that bot's purpose implies.
  - No new fetch and no change to the discovery step.
- **One post-crawl step for the extra fetches,** named `agent-files` and placed
  right after the crawl, like ASO's `app-link-files`. It returns parsed verdicts
  only, never bodies, so the checkpoint stays small. It never throws: a failed
  fetch is recorded as "not checked" and does not fail the audit.
- **Fetch rules for the new step:**
  - Only fixed paths on the audit's origin, which `normalizeAndValidateStartUrl`
    has already validated.
  - `redirect: "manual"`. A redirect is followed only when its target is
    same-origin and passes `isCrawlableUrl`, up to 5 hops. A cross-origin hop is
    not fetched; it is recorded as "redirects off-site, not checked". So no host
    other than the validated origin is ever contacted.
  - `OpenSEO-Audit/1.0` plus crawler-access headers, 10 s timeout per request.
  - Requests run one at a time. The crawl throttle does not cover this step,
    the same as discovery. A 429 stops the remaining fetches and marks them
    "not checked (rate limited)".
  - Body reads are capped: 64 KiB for llms.txt (validity only needs the head
    of the file, so the read truncates rather than skips) and 64 KiB for JSON
    files. The Markdown probe reads no body.
- **One issue row per bot** for crawler blocks, using `dedupeKey` = token. That
  keeps details flat (`bot`, `operator`, `purpose`, `rule`, `blockedPages`,
  `examples`) and makes "which rule blocks which bot" readable in the UI and CSV
  without special cases.
- **Agent discovery files** get one info row in total, with flat `present` and
  `missing` lists. No row is raised when every file is present.

### Severities (proposed; see Open questions)

| Issue id                           | Level | Severity | Raised when                                                                                                                                                                              |
| ---------------------------------- | ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search-engine-crawler-blocked`    | site  | critical | `Googlebot` or `Bingbot` may not fetch the start URL or a crawled page. One row per bot.                                                                                                 |
| `ai-answer-crawler-blocked`        | site  | warning  | An `ai_search` token, or `Google-Extended` (Gemini grounding), is blocked the same way.                                                                                                  |
| `ai-user-fetcher-blocked`          | site  | info     | A `user_fetch` token is blocked. The copy says the vendor may not honor the rule. `Claude-User` is the exception (Anthropic says it honors robots.txt); its copy says the block applies. |
| `ai-training-crawler-blocked`      | site  | info     | Only `training` tokens are blocked. Framed as a legitimate choice.                                                                                                                       |
| `content-signal-opts-out-of-ai`    | site  | warning  | `ai-input=no` or `search=no` in the `*` group or an AI answer bot's group. The copy names which key and what it covers.                                                                  |
| `missing-llms-txt`                 | site  | info     | No 2xx `/llms.txt`.                                                                                                                                                                      |
| `llms-txt-invalid`                 | site  | info     | 2xx but an HTML body, or no leading H1. Details give the reason.                                                                                                                         |
| `markdown-negotiation-unsupported` | site  | info     | The start URL with `Accept: text/markdown` does not return `text/markdown`.                                                                                                              |
| `agent-discovery-files`            | site  | info     | Any checked `.well-known` file missing. Flat `present` / `missing` / `legacy` lists.                                                                                                     |
| `invalid-structured-data`          | page  | warning  | A JSON-LD block does not parse.                                                                                                                                                          |
| `local-business-markup-incomplete` | page  | warning  | A LocalBusiness-family entity lacks a property in the slice 2 list.                                                                                                                      |
| `no-local-business-markup`         | site  | info     | No crawled page declares a LocalBusiness-family type. Conditional wording.                                                                                                               |

- **Training bots.** Blocking `GPTBot`, `ClaudeBot`, `Applebot-Extended`,
  `CCBot`, `meta-externalagent`, `Amazonbot` or `MistralAI-Training` is info.
- **`Google-Extended`.** The brief called it training-only. It is now a warning
  because of correction 1. Its copy says it affects Gemini app answers and
  training, not Google Search or AI Overviews.
- **Partial blocks.** A partial block (some crawled pages, not the start URL)
  keeps the same type and severity. Details say "N of M crawled pages" so the
  copy never overstates.
- **Content-Signal.** Present with no opt-out raises nothing. `ai-train=no`
  alone raises nothing; it is a training choice, like a training-bot block.

### Data shape (slice 2; needs approval)

- **New table `audit_page_schema_types`:** `id`, `audit_id`, `page_id` (FK,
  cascade), `schema_type`. Unique on (`page_id`, `schema_type`). Capped at 20
  types per page.
  - Types are normalized: strip `schema:` and `http(s)://schema.org/`, then
    keep the bare name.
  - This replaces `has_structured_data`. The recommendation is to drop that
    column in the same migration, because nothing reads it and #878 set the
    precedent.
- **New table `audit_local_businesses`,** one row per distinct LocalBusiness
  entity in an audit:
  - Columns: `id`, `audit_id`, `page_id` (first page seen, FK, cascade),
    `schema_type`, `name`, `street_address`, `address_locality`,
    `address_region`, `postal_code`, `address_country`, `telephone`, `url`,
    `opening_hours`, `has_geo`, `same_as_count` and `page_count`.
  - `opening_hours` is a short normalized text summary, capped. It is a
    display value, not relational data.
  - Unique on (`audit_id`, `entity_key`), where the key is a hash of name,
    address and telephone. A footer that repeats the same markup on 500 pages
    becomes one row with `page_count` 500.
- **Both tables:**
  - Written inside the crawl-chunk steps with deterministic ids and
    insert-or-ignore (or conflict-safe upsert for `page_count`), like page rows.
  - Statements are batched under D1's parameter limit.
  - SQLite and Postgres definitions, both generated migrations and
    `schema-parity.test.ts` stay in step.
- **Alternative considered:** carry local business fields in issue `details`,
  with no migration. Rejected because a complete, correct entity raises no
  issue, so an agent comparing it with the Business Profile would see nothing.
- **Alternative considered:** a JSON column on `audit_pages`. Rejected because
  of #878 and the review guidelines' normalized-data rule.

## Slices

Order: slice 1, then 2, 3 and 4 in any order, then 6. Slice 5 is on hold
(see below). Each slice is one fork PR, stacked when it depends on an earlier
one. Done means:

- `pnpm ci:check` and the relevant Vitest suites pass;
- this file's status line is updated;
- papercuts are logged in `.agents/PAPERCUTS.md`.

### Slice 1: agent-readiness site checks (about 3 days; no gate)

Spec: `0017-agent-readiness-audit-checks.md`, covering slices 1 and 2. It
records what is checked, why each severity, and the fetch rules. It leaves out
business context and vendor study numbers.

- **Shared constant** `src/shared/ai-crawlers.ts`: each verified token with
  its operator and purpose (`search_index`, `ai_search`, `user_fetch`,
  `training`), plus whether the vendor says it honors robots.txt. This is the
  only list. `ai-visibility-audit` is updated to say the same things.
- **Crawler access.** A pure function takes the robots text, the start URL and
  the crawled page URLs, and returns issues. It is called in `multipage-checks`
  using `discovery.robotsText`, which is already in scope in `runAuditPhases`.
- **Content-Signal.**
  - A line parse of `Content-Signal:` within each user-agent group. A signal
    applies to the group it sits in. No inheritance from `*` is assumed,
    because neither source defines one.
  - `search=no` or `ai-input=no` in the `*` group, or in a group naming an
    assistant's search bot, raises a warning.
  - Anything else raises no issue.
- **`agent-files` step:** llms.txt, Markdown negotiation and the
  `.well-known` files, using the fetch rules above. A new
  `AGENT_FILES_STEP` config holds one attempt with a short timeout, and
  retries are safe because the step only reads.
- **New issue types** in `audit-issues.ts`, with explanation and fix copy in
  the existing tone. Ids are listed under Severities.
- **Tests**, at the public entry points:
  - one test per severity rule for the crawler and Content-Signal function,
    with robots text as input;
  - verdict tests for the `agent-files` fetcher with a stubbed `fetch`: a
    cross-origin redirect is not followed, a 429 stops the rest, and a body
    over the cap is not buffered.
- **BadSEO:**
  - The robots.txt gains a `Bingbot` group, an `OAI-SearchBot` group and a
    `GPTBot` group that each disallow one fixture section only. The `*` rules
    are copied into each group, because a named group replaces `*` for that
    bot.
  - The live site therefore really does block those bots from that section,
    which is the point of a deliberate-mistake site.
  - BadSEO serves no llms.txt and no agent files, so the info issues fire. A
    second "valid" variant cannot exist on one origin. Unit tests cover the
    valid cases instead.
  - Content-Signal opt-out is unit-tested only, so badseo.dev keeps its search
    signal.
- **Wiring.** No UI, CSV or MCP change: `get_audit_issues`, the issues view
  and the export read the registry. One check confirms a `pageId: null` row of
  each new type renders and exports.

Acceptance:

- A badseo audit raises the Bingbot critical, the OAI-SearchBot warning, the
  GPTBot info, missing llms.txt, Markdown not supported and the agent-files
  info, and nothing else new.
- Each crawler issue names the bot, the rule line and the blocked page count.
- A site whose fetches all time out finishes its audit with those checks
  marked "not checked".

### Slice 2: structured data and local business markup (about 4 days; gated on schema approval)

- **Capture.** The analyzer captures `application/ld+json` text with #204's
  caps. It runs `JSON.parse`, then walks arrays and `@graph`, and collects
  `@type` strings and arrays. Results go to `PageAnalysis`.
  - The existing cheerio parity test gets the new fields.
- **`invalid-structured-data`** (page, warning): at least one block failed to
  parse. Details give the count and the first parser message, capped.
- **LocalBusiness family.** A generated constant holds every schema.org type
  that is a transitive subtype of `LocalBusiness`, from the vocabulary file of
  a pinned schema.org release.
  - Examples: `MedicalBusiness` and its 26 subtypes, `Dentist`, `MedicalClinic`,
    `HealthAndBeautyBusiness`, `LodgingBusiness`, `FoodEstablishment`, `Store`.
  - The constant records its source version.
  - A short script regenerates it. It is not fetched at runtime.
- **`local-business-markup-incomplete`** (page, warning; see Open questions):
  a LocalBusiness-family entity lacks `name`, a `PostalAddress` address with at
  least `streetAddress` and `addressLocality`, `telephone`, `url`, or
  `openingHoursSpecification`/`openingHours`. Details list what is missing and
  name `geo` and `sameAs` as also recommended. The row is deduplicated per
  entity key so a footer does not raise 500 rows.
- **`no-local-business-markup`** (site, info): raised at finalize when no
  crawled page declares a LocalBusiness-family type. The wording is
  conditional: "If this is a local business…".
- **Storage:** the two tables under Decisions, in both dialects, with
  migrations generated by `pnpm db:generate` and parity kept.
- **Agents.**
  - `get_audit_pages` gains a `schemaTypes` field per page and a
    `localBusinesses` list for the audit in `structuredContent`, plus a short
    text table.
  - No new tool and no plugin bump.
  - No DataForSEO call from the audit; the Business Profile comparison lives in
    the slice 6 skill.
- **BadSEO:**
  - one page with malformed JSON-LD;
  - one `Dentist` page missing `telephone` and hours;
  - one complete `MedicalClinic` page that must stay clean.

Acceptance:

- A badseo audit raises exactly those issues.
- `get_audit_pages` returns that fixture's name, address, phone, URL and hours.
- The parity test, the D1 bundle check and both migrations are green.

### Slice 3: AI assistant referrals in GA4 (about 1 day; no gate)

- **Breakdown.** Add `breakdown: "ai_assistant"` to
  `get_google_analytics_traffic_acquisition`.
  - It reports by GA4 `sessionSource`, filtered to the verified source values
    in one shared constant (`src/shared/ai-assistant-sources.ts`, source to
    assistant).
  - Rows are summed per assistant: sessions, engaged sessions, key events.
  - This fits the existing input schema as one enum member, so no new tool and
    no plugin bump.
- **Description.** The tool description says GA4 undercounts AI-influenced
  visits, because many arrive with no referrer and count as Direct.
- **Tests:** one through the tool handler with a stubbed report, checking that
  two ChatGPT source values merge into one row and that a non-AI source is
  dropped. Report fixtures use `ga4-test-fixtures.ts`.

Acceptance: an agent asking "how much traffic comes from AI assistants" gets
one row per assistant, with the caveat in the description.

### Slice 4: repeated sampling for AI visibility (about 4 days; gated)

Gates, in order:

1. Verify that DataForSEO returns a fresh answer for an identical repeated
   post, and doesn't serve a cached one. If it caches, N samples measure
   nothing and the slice stops. This takes a paid test of about $0.01:
   5 × queued ChatGPT plus 5 × live ChatGPT for one prompt. It needs your OK.
2. Your approval of the schema below.

Design:

- `ai_trackers.samples_per_prompt`: integer, not null, default 1. Zod limits
  it to 1–5.
- `ai_observations.sample`: integer, not null, default 0. The unique index
  becomes (`run_id`, `prompt_id`, `engine`, `sample`). It must be `NOT NULL`
  with a default because SQLite treats NULLs as distinct in a unique index.
  Both dialects drop and recreate the index, and parity stays green.
- **Run size.** One helper, `runAnswers(scope, samples)`, replaces the four
  `scope.prompts.flatMap(() => scope.engines)` sites, so estimate, credit gate,
  max-cost check and row creation price the same N.
- **Run cap.** Prompts × engines × samples is capped at 500 answers per run,
  today's maximum, so Workflow step counts and run duration stay inside the
  current envelope. Settings that exceed it are rejected with the reason.
- **Results.** For a cell (prompt × engine) in a run, report
  "mentioned in k of N" plus the mention rate. Across the trend period, report
  the rate's min–max over runs as the spread. The trend math already divides
  mentions by answers, so with N > 1 it becomes a per-sample rate with no
  formula change.
- **Default.** With N = 1, every row has `sample` 0, run sizes, prices and
  outputs are unchanged, and existing tests pass untouched. One new test
  asserts that N = 3 prices three times as many answers and creates three rows
  per cell.
- **Spec:** `0018-ai-visibility-repeated-sampling.md`.

Acceptance:

- `estimate_ai_visibility_cost` with N = 3 shows three times the answers.
- A run creates N rows per cell.
- Results show k of N.
- N = 1 is byte-for-byte unchanged in outputs.

### Slice 5: Bing Webmaster Tools (on hold; recommend not building)

The brief wanted a spec that mirrors 0003, then read-only tools. That is
already done upstream as PR #411 and roadmap item "Bing Webmaster Tools
integration (Soon)":

- `0016-bing-webmaster-tools-integration.md`;
- API key and OAuth `webmaster.read`, keys encrypted per user;
- `get_bing_search_performance`, `inspect_bing_urls`, `get_bing_crawl_stats`.

Options:

- (a) Wait for upstream. Recommended.
- (b) Cherry-pick #411 into the fork if we need Bing before upstream ships it.
  This is about 17k lines, a schema change and a plugin bump. Review it, don't
  rewrite it.
- (c) Build our own as specified. Not recommended: it duplicates #411, and an
  upstream version would conflict with it.

Out of scope in every option: URL submission and IndexNow. IndexNow is
upstream's "Highest priority" item.

### Slice 6: `agent-readiness-audit` skill (about 2 days; after slices 1–2)

- **Skill.** A shipped skill at `.agents/skills/agent-readiness-audit/`,
  created with `create-repo-skill` and mirrored by `pnpm sync-plugin-skills`.
  It follows the style of `ai-visibility-audit`.
- **Steps:**
  1. Run or read the latest audit, and interpret the slice 1 and 2 issues.
  2. Compare the audit's `localBusinesses` with `get_business_profile`: name,
     address, phone, hours and website. Say that this charges credits, and ask
     before calling.
  3. Tell the user to check Search Console's generative AI control. It can
     opt a site out of AI Overviews and AI Mode, and the audit cannot see it.
  4. If the user has the isitagentready.com MCP connected, call its scan tool
     for a reference score, as an MCP the user installs, not proxied through
     OpenSEO.
  5. Write a short report: one to three fixes ranked by effect on AI answers,
     each tied to evidence, then "How this report was made" per `seo-report`.
- **Plugin.** This is a new shipped skill, so it bumps the plugin patch
  version (1.0.21 to 1.0.22, or one above whatever main has then) in all three
  manifests.
- **Fork-only extra, on its own branch** and out of anything proposed upstream:
  a Spanish-language prompt pack for one local-service vertical. It is
  reference material the skill can load: 5 intents × city × treatment.
  - The intents are symptom to treatment, treatment research, shortlist,
    verification and action.
  - It feeds `generate_ai_visibility_prompts`, because
    `research_ai_visibility_prompts` is US-English only.

### Not in this plan

- Batch scanning of many domains.
- Voice or booking agents.
- Per-business MCP or A2A endpoints.
- Any branding.
- **The free-audit report template.** That is data. Create it later per
  project with `save_report_template`: name, one-line description, sections,
  tone and accent, up to 3,000 characters of instructions. Then name it when
  running the slice 6 skill.

## Issue drafts

Upstream already has #99 for the audit checks and #232 for Bing, so a new
umbrella issue would duplicate them. `simple-issue-description` also asks for
one problem per issue. The drafts below are therefore a comment on #99 plus
three short issues. Nothing is posted without your OK.

### Comment on #99

> Two things we found while scoping this, in case they help whoever picks it up:
>
> - `Google-Extended` is no longer training-only. Google's crawler docs (updated 2026-10-15) say it also controls grounding in Gemini Apps, so blocking it can remove a site from Gemini answers. AI Overviews and AI Mode are opted out in Search Console instead, not in robots.txt.
> - Several user-triggered fetchers (`ChatGPT-User`, `Perplexity-User`, `Google-Agent`) are documented as not following robots.txt, so a block on them often has no effect. Worth saying so rather than warning about it.
>
> We'd also suggest flagging a `Bingbot` or `Googlebot` block as critical, since it removes the site from that engine and the AI answers built on it. And quote the exact robots.txt line that blocks each bot.

### Issue: Check local business markup in site audits

> **TL;DR**
>
> A local business site can have structured data that is broken or missing its address, phone or opening hours, and the audit only says "has structured data". It should say what the markup is missing.
>
> **What is happening?**
>
> The audit notes whether a page has any JSON-LD at all. It does not say when a block fails to parse, or when a `LocalBusiness` (for example `Dentist` or `MedicalClinic`) lacks `name` or `address`, which Google requires, or `telephone`, `url` or opening hours, which Google recommends.
>
> **What should happen?**
>
> Flag JSON-LD that does not parse. For local business markup, list the missing properties. If no page has local business markup, mention it once, worded for sites that are local businesses.
>
> **Extra context**
>
> Google's local business structured data docs: https://developers.google.com/search/docs/appearance/structured-data/local-business

### Issue: Show traffic from AI assistants in Google Analytics

> **TL;DR**
>
> I can't ask the agent how many visits came from ChatGPT, Perplexity, Gemini, Copilot or Claude. Acquisition data should break those out per assistant.
>
> **What is happening?**
>
> `get_google_analytics_traffic_acquisition` groups by channel, source/medium or campaign. AI referrals are mixed in with other referrals, and GA4's own "AI Assistant" channel does not say which assistant, nor does it publish which sites it counts.
>
> **What should happen?**
>
> A breakdown that shows sessions, engaged sessions and key events per AI assistant. The description should say that many AI-influenced visits arrive as Direct, so the numbers are a floor.

### Issue: AI visibility answers change between runs

> **TL;DR**
>
> AI answers vary from one ask to the next, so one answer per prompt can show my brand as mentioned one week and missing the next with nothing changed. I'd like to collect a few answers per prompt and see a mention rate.
>
> **What is happening?**
>
> Each check stores one answer per prompt and engine. The trend moves with the randomness of single answers.
>
> **What should happen?**
>
> A tracker setting for 1–5 answers per prompt (default 1, unchanged cost). Results show "mentioned in 3 of 5", and the cost estimate prices the extra answers before a run starts.

## Open questions

Scope changes caused by verified facts, which need your call:

1. **Upstream route.** Upstream merges no external PRs. Do we post the #99
   comment and the three issues above, all, some or none? Should fork PRs still
   use the upstream PR format? The plan assumes yes, since it costs nothing.
2. **Slice 5 (Bing).** Wait for upstream (recommended), cherry-pick #411, or
   build our own?
3. **`Google-Extended` severity.** Warning, because it gates Gemini app
   grounding (correction 1), against the brief's training-only info. This also
   changes one sentence in the shipped `ai-visibility-audit` skill. That is a
   minor edit: we run `pnpm sync-plugin-skills` and don't bump the version.
4. **Local business severity.** The brief made `telephone`, `url` and hours
   "required". Google requires only `name` and `address`. Options:
   - (a) one warning type for any of the five missing, with copy saying which
     are Google-required (current plan);
   - (b) warning only for `name` and `address`, and an info type for the rest.
5. **MCP Server Card path.** Check `ai-catalog.json` and report the old
   `mcp/server-card.json` as legacy (correction 4). OK?

Design questions:

6. **Partial crawler blocks.** Is a `Bingbot` block on some crawled pages (not
   the start URL) still critical? The plan says yes, with "N of M pages" in
   the details.
7. **Drop `has_structured_data`.** Drop it in slice 2's migration, since the
   types table supersedes it and nothing reads it? The alternative is to keep
   it and drop it later.
8. **Slice 4 cache test.** May we spend about $0.01 on the repeated-post test
   before designing further?
9. **Slice 4 run cap.** Should runs be capped at 500 answers (today's maximum),
   or should N be allowed to push past it with a longer run?
10. **GA4 source values.** They come from the hostname convention and are not
    verified. Can you share a GA4 property with real AI referrals, read-only
    through the existing connection, so we can confirm them before slice 3
    ships?

Flagged, not planned (found by reading, no user report):

- **robots.txt 5xx.** A 5xx on robots.txt is checkpointed as "no robots.txt",
  but RFC 9309 says to treat it as full disallow. Every bot would read as
  allowed.
- **Discovery redirects.** Discovery re-checks redirect hops with
  `isCrawlableUrl` rather than `normalizeAndValidateStartUrl`, and only sitemaps
  check same-origin on the final URL.
