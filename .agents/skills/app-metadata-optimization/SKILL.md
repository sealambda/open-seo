---
name: app-metadata-optimization
description: "Draft App Store and Google Play listing metadata that covers an app's target search terms and passes each store's rules."
---

# OpenSEO App Metadata Optimization

## Goal

Write two or three candidate sets of store listing metadata for one app, so the user can pick one and paste it into App Store Connect or Play Console. On the App Store that is the name, subtitle and keyword field. On Google Play it is the title, short description and full description. Each candidate should cover the search terms the app needs and pass the store's rules.

Use this for an app's store listing. For the app's website, use `keyword-research` or `seo-audit`.

## Required inputs

- `projectId`
- The store and the app's id: the App Store numeric id (the digits after `id` in the listing URL) or the Google Play package name
- The storefront the listing is for: country and language. Default to the project's market.
- Optional: the current keyword field (App Store) or short description (Google Play). Neither is public, so only the developer can supply them.

## Project context

The project-context tools are free and shared with the app and other agents.

1. Call `get_project_context` first and ground the work in it — what the app does and who it is for decide which terms are worth covering.
2. This skill needs `business_overview`. If it is empty, run a minimal inline setup: infer what the app does from its listing (`get_app_listing`), confirm it with the user in one question, write it back with `update_project_context`, then continue. Never front-load the full interview; suggest `seo-project-setup` at the end for the rest.
3. Before spending credits, check the research log. If the same research ran within the last 30 days, reuse that result and say so instead of re-buying it.
4. On finish, append a research log entry with `update_project_context`: `{ appendResearchLog: { summary: "App metadata: <app> on <store>, <storefront>. Chosen: <candidate>" } }`. Don't save competitor apps as competitors; competitor rows are keyed by website domain.

## Deliver as a report

Deliver through the `seo-report` skill, saving with `skill: "app-metadata-optimization"`. If that skill is not available, give the candidates in chat.

## OpenSEO MCP tools

- `get_app_listing`: the public listing of the app or a competitor in any storefront — title, subtitle (App Store), full description, category (Google Play), rating and similar apps. Queued: a `processing` response returns a `taskId` — call again with it after 30-60 seconds, at no extra cost.
- `get_app_store_results`: which apps rank for a term in one storefront, in order. Use it to see who you are up against and where the app ranks. Queued, resumed the same way.
- `get_app_ranking_keywords`: the terms an app ranks for in the US store, with its rank and DataForSEO's estimated search volume. US store and English only.
- `find_app_competitors`: the apps that rank for the most of the same terms, US store only. It returns app ids; call `get_app_listing` for the ones worth a look.
- `validate_app_metadata`: free and instant. Checks every field against the store's limits and rules and reports which target terms a draft covers. Each issue is marked `store` (a published rule) or `heuristic` (common practice the store doesn't document).

## Workflow

1. Read the app's current listing with `get_app_listing` in the target storefront. Ask the user for the current keyword field or short description if they want those improved.
2. Build a target list of 15 to 30 terms:
   - **US storefront:** call `get_app_ranking_keywords` for the app, and `find_app_competitors` to pick two or three close competitors, then `get_app_ranking_keywords` for them. Favor terms where the app ranks 4 to 30, and terms competitors rank for that the app doesn't. Volumes are vendor estimates: use them to rank terms against each other, not as download or traffic forecasts. Skip word fragments like "s for"; the Play data has some.
   - **Any other storefront:** no keyword volume data exists. Take candidate terms, in the storefront's language, from the app's and competitors' listing text (`get_app_listing`, including its similar apps). Say in the report that the list has no volume data.
3. Check the four or five most important terms with `get_app_store_results` in the storefront: who ranks, and whether the app appears. A term owned by household-name apps is a weak target for a small app; prefer one where the top results look beatable.
4. Run `validate_app_metadata` on the current metadata with the target list. This is the baseline.
5. Draft two or three candidates, each built on a different idea, for example the category term in the name, a feature-led subtitle, or long-tail phrases. For each one, loop: call `validate_app_metadata`, fix every error, fix the warnings you agree with, raise coverage, and call it again. Stop when no errors remain and more coverage would make the text read worse.
   - **App Store:** people read the name and subtitle, so keep them readable. Put remaining words in the keyword field as single words, separated by commas with no spaces. Don't repeat words already in the name, subtitle or company name, and keep only one of each singular/plural pair.
   - **Google Play:** the title and short description must read naturally. Work target phrases into the full description word for word, where they fit, without repeating them.
   - `store` issues are rules. `heuristic` issues are judgment calls; say which ones you left in and why.
6. Compare the candidates: coverage, what each one gives up, and which terms none of them cover.

## Output format

`h1`: the app name, store and storefront.

If a report template applies (see `seo-report`), its sections and tone replace this list.

Sections in this order:

1. **Snapshot** — one or two opening sentences on the current listing, then a table of its fields with length and limit, and its baseline coverage.
2. **Target terms** — a table of term, source (ranking keywords, competitor listing, or store search), estimated volume (US only), and the app's current rank.
3. **Candidates** — one subsection per candidate: every field in a copyable block with its length and limit, covered and uncovered terms, and any warnings left in.
4. **Recommendation** — which candidate, and why, in one or two sentences.
5. **How the change ships** — App Store: name, subtitle and keyword field changes ship with the next app version and go through App Review. Google Play: listing changes don't need an app update and go live after Google's review.
6. **How this report was made** — opens with the skill link line from `seo-report`, pointing at `https://openseo.so/docs/skills/app-metadata-optimization` ("OpenSEO App Metadata Optimization skill"), then which tools reported what, and which checks were heuristics.

## Guardrails

- Never put another app's or company's name in any field. Apple doesn't allow it in keywords, and Google Play bars misleading metadata.
- Don't add pricing, promotion or ranking claims ("free", "sale", "#1", "best") to the App Store fields or the Play title.
- Keyword data is US only. Don't imply volumes or competitor data exist for other storefronts.
- Passing validation is not a ranking promise. App Store coverage is a heuristic: Apple doesn't document how it combines fields.
- OpenSEO can't edit store listings. Never say a change was made; the user pastes the chosen candidate into the store console.
