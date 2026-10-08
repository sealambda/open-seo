# 0015 — App Store Optimization: Agent Tools and Audit Checks

What the first app store optimization (ASO) release does, how it works, and
why. It is stateless: agent tools, a skill, and site audit checks for app
landing pages, with no new tables. Later steps are listed at the end.

## The feature

Five MCP tools, also available to SAM:

- **`validate_app_metadata`** checks draft App Store or Google Play listing
  text against the store's limits and rules and reports which target search
  terms it covers. It is free and makes no network call, so an agent can call
  it on every draft.
- **`get_app_store_results`** returns the apps that rank for a term in one
  country storefront, in order.
- **`get_app_listing`** returns one app's public listing in a storefront:
  title, subtitle, description, developer, rating, category, version and
  similar apps.
- **`get_app_ranking_keywords`** lists the terms an app ranks for, with its
  rank and the vendor's estimated search volume. US store only.
- **`find_app_competitors`** lists the apps that rank for the most of the same
  terms. US store only.

The `app-metadata-optimization` skill ties them together. It builds a target
term list, drafts two or three candidate listings, and loops each one against
the validator until it passes. It also tells the user when the change ships:
App Store name, subtitle and keyword field changes go out with the next app
version, while Play listing changes need no app update.

Spend on these tools shows up as "App Store Optimization" in usage breakdowns.
DataForSEO's Play app endpoints share the `google` path segment with its web
endpoints, so the label is matched on the endpoint name, not the store
segment.

## Data and its limits

Store searches and listings come from DataForSEO's `app_data` endpoints, which
work in any country storefront. Keyword and competitor data come from
DataForSEO Labs, which covers only the US store in English and refreshes about
weekly. Before building, we checked both against the live stores:

- App Store results matched Apple's public iTunes Search API in 8 to 10 of the
  top 10 apps, and Play results matched the Play search page exactly.
- The Play search page shows 30 results, so Play searches ask for 30. A deeper
  request returns nothing more.
- Play listings come without the short description, and their descriptions
  arrive HTML-escaped. The tool decodes them, since `&amp;` would otherwise
  count as five characters.
- The App Store keyword field is never public. App Store listings come without
  a category.
- Labs returns some word fragments as Play keywords ("s for"). The tools pass
  them through as the vendor's data, and the skill tells agents to skip them.

The two Labs tools default to the US store whatever the project's market, and
reject any other location before calling DataForSEO, so a wrong market is
never billed. Outside the US, the skill builds its term list from listing text
and checks it with store searches, and says the list has no volume data.

## Queued work inside one tool call

Store searches and listings are task-only: DataForSEO has no live mode for
them. Each tool posts the task, polls for about 20 seconds, and returns the
result, which normally arrives in under 10 seconds. If the task is still
running, the tool returns `status: "processing"` and a `taskId` the agent
passes back to collect the result. Only the post is billed, so resuming is
free. The `taskId` carries the store, so a resume can't read from the other
store's queue.

This is the same pattern as Google Business reviews, and the two features
share the post, collection and polling code.

## The validator

Every issue says where its rule comes from. `store` issues are rules Apple or
Google publish: field limits, Apple's keyword field wording, App Review
Guideline 2.3.7, and the Google Play metadata policy. `heuristic` issues are
common ASO practice that neither store documents. Agents should fix the first
kind and weigh the second.

- **Lengths.** The App Store keyword field is limited to 100 bytes, so it is
  measured in UTF-8 bytes; one accented letter takes two. Every other field is
  measured the way a browser form counts characters. That can overcount an
  emoji but never undercounts, so a draft that fits here fits in the console.
- **App Store keyword field.** Entries of two characters or fewer are errors,
  as Apple's field reference says. Words already in the app or company name
  are flagged as a store rule; words already in the subtitle, repeated words,
  spaces next to commas and possible singular and plural pairs are flagged as
  heuristics. The plural check is English only.
- **Google Play title.** Ranking, promotion and program terms ("#1", "best",
  "free", "Editor's Choice"), emoji, repeated symbols and all-caps titles are
  flagged, because the Play policy names the title for those rules. The same
  words in a description are not flagged.
- **Coverage.** On the App Store, a phrase counts as covered when each of its
  words, or its English singular or plural form, appears somewhere in the
  name, subtitle, keyword field or company name. That is observed behavior,
  not documented, and the output says so. On
  Google Play a phrase must appear word for word in one field, and a phrase
  repeated past a threshold is flagged as keyword stuffing.

Tokenizing splits on spaces and punctuation, so the coverage checks work for
space-delimited languages only.

## Site audit checks for app landing pages

The site audit checks what a website does to send people to its app.

- **Smart App Banner** (`<meta name="apple-itunes-app">`). A banner without a
  numeric `app-id`, which Apple requires, is a warning. So is an
  `app-argument` that points at the home page from a deeper page, because
  Apple suggests passing the page's own URL so the app opens the same content.
  Arguments with a custom scheme or on another site are left alone.
- **App markup.** A page with a banner but no SoftwareApplication,
  MobileApplication or VideoGame JSON-LD gets an info note. It is not framed as
  a rich result promise.
- **Firebase Dynamic Links.** Links to `*.page.link` are a warning, since the
  service shut down on August 25, 2025 and every link now returns 404. Links on
  a custom Dynamic Links domain can't be recognized.
- **App link files.** The audit fetches `/.well-known/apple-app-site-association`
  and `/.well-known/assetlinks.json` without following redirects. Both
  platforms refuse redirected files, so a redirect is a finding. The Apple file
  must be a JSON object declaring `applinks`, `webcredentials` or `appclips`.
  The Android file must be served as `application/json` and hold a statement
  granting `handle_all_urls` to an Android app with a package name and
  certificate fingerprint. Apple's current documentation names no content
  type, so none is required for its file. A site that answers with its HTML
  shell counts as not having the file.

A broken app link file is always reported, since serving one at all says the
site has an app. A missing file is only an info note, and only when a crawled
page promotes that platform's app: a Smart App Banner or an App Store link for
iOS, a Google Play link for Android. Without that gate, every site without an
app would be told to add one.

The two files are fetched once per audit, after the crawl, in their own
workflow step whose checkpoint holds only a verdict per file, never the file
itself. The per-page signals travel with the crawl chunk results, so pages need
no new columns. A crawl chunk that fails after saving pages can lose those
pages' signals; the cost is at most a missing info note.

## Alternatives considered

| Alternative                                             | Why not                                                                                                                                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app_listings/search` (live) for listings and rankings  | It searches DataForSEO's own listing database, not a store's ranked results, so it can't say where an app ranks in a storefront.                                                 |
| A single ASO score                                      | It hides which rule failed. Agents fix drafts one issue at a time, so they need the issues themselves.                                                                           |
| Marking the source of every value                       | With one data vendor there is nothing to compare. Revisit when store console data arrives.                                                                                       |
| One severity scale for rules and heuristics             | Agents would treat undocumented practice as a rule, for example dropping a real term to silence a plural warning. Keeping the source separate lets them tell the two apart.      |
| Counting user-perceived characters                      | It counts an emoji as one character where a browser form may count two, so a draft could pass here and be rejected in the console.                                               |
| Storing apps in projects now                            | Tables, a tracker workflow and UI are weeks of work. Stateless tools test demand first.                                                                                          |
| Scraping the stores, or undocumented Apple endpoints    | Fragile, and against the stores' terms.                                                                                                                                          |
| A page column recording each page's app signals         | A migration in two databases for a flag only the app link file check reads. Carrying the signal with the crawl results costs, at worst, an info note after a failed crawl chunk. |
| Fetching the app link files only when pages show an app | A broken file on a site whose crawled pages don't link to its app would go unreported. Two small requests per audit are cheap.                                                   |

## Later

- Apps as part of a project, with daily store rank tracking per keyword and
  storefront and a history of listing changes. Store search results were
  checked deep and fresh enough to support it.
- App Store Connect and Google Play Console connections, for first-party
  numbers, the real keyword field, and publishing listing changes after
  explicit confirmation.
