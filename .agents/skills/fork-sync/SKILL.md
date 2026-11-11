---
name: fork-sync
description: Rebase the sealambda fork's branch (sealambda/main) onto the latest every-app/open-seo main and make the fork's features work with what upstream added. Use when asked to sync, update or rebase the fork on upstream, when the fork is behind upstream, or when a deploy fails after a sync with "table already exists".
metadata:
  internal: true
---

# Sync the fork with upstream

This repository is a fork (`origin` = sealambda/open-seo) of `upstream` =
every-app/open-seo. Everything the fork adds lives on one branch,
`sealambda/main`: upstream `main` with the fork's commits on top, in a straight
line. Syncing means replaying those commits on the newest upstream `main` and
then closing the gaps a textual rebase cannot see.

Small, frequent syncs are cheap. The first sync after 272 upstream commits hit
18 conflicted files; aim for weekly.

## Ground rules

- `main` on the fork is a pure mirror of `upstream/main`. Never commit to it.
- `sealambda/main` is the fork's default branch and the only branch that is
  deployed. New work goes on a short-lived branch off it, with a pull request
  against it on the fork (`-R sealambda/open-seo`), squash-merged. Nothing goes
  to upstream unless the user says so.
- Rebase, do not merge upstream in. Keep each fork feature one or a few clean
  commits so it can be cherry-picked onto `main` if it is ever sent upstream.
- A sync rewrites `sealambda/main`, so it ends in `--force-with-lease` to
  `origin`, only after the user agrees. Open pull requests then need rebasing
  and other clones need `git reset --hard origin/sealambda/main`.
- Follow the user's own rules for who runs git and GitHub write commands.

## 1. See what needs syncing

```bash
git fetch --all --prune
git log --oneline sealambda/main..upstream/main | wc -l   # upstream commits to take
git log --oneline upstream/main..sealambda/main           # the fork's commits
gh pr list -R sealambda/open-seo
```

Note the commit `sealambda/main` currently sits on
(`git merge-base sealambda/main upstream/main`); it is `<old-base>` below.
Warn the user about open pull requests before rewriting the branch.

## 2. Rebase

```bash
git switch sealambda/main
git rebase upstream/main
```

`rerere` is enabled, so a resolution made once is replayed next time. Fix
whatever the sync needs inside the commit it belongs to where that is easy, or
as a new commit on top; do not leave the fixes uncommitted.

Then install dependencies before judging anything: `pnpm install
--frozen-lockfile`. Stale `node_modules` produces dozens of unrelated type
errors.

When the sync is verified and pushed, fast-forward the mirror as well: `main`
to `upstream/main`, locally and on `origin`.

## 3. Conflicts that recur

| Where | Resolution |
| --- | --- |
| `drizzle/*/meta/_journal.json`, `*_snapshot.json`, numbered `.sql` | Never text-merge. See "Migrations" below. |
| `plugins/openseo/.*-plugin/plugin.json` version | Take main's files, then set all three to one patch above main's version if the fork adds MCP tools or shipped skills. |
| `src/server/everyapp/tools.test.ts` tool count | Main's count plus the fork's tools. Shows up as a failing test, not a conflict. |
| `.agents/PAPERCUTS.md`, env examples, `deploy/alchemy/alchemy.run.ts` | Keep both sides. |
| Routes and pages upstream restructured | Take upstream's structure and re-insert the fork's component in it. Do not keep the fork's stale copy of the surrounding page. |
| Test fixtures of shared types | Upstream's shape plus the fork's fields. |

When upstream redesigned something the fork extends, the fork's code can merge
cleanly and still be wrong. Compare the fork's component with its closest
upstream sibling (for example a fork dashboard card against `Ga4Card`) and
bring it to the current pattern.

## 4. Migrations

Upstream keeps adding migrations, so a fork migration's number is taken on
every sync. Renumber it to go last:

1. Save the fork's `.sql` files somewhere outside the repo, then delete them
   and their snapshots.
2. Restore `_journal.json` and the colliding snapshots from `upstream/main`
   for both `drizzle/sqlite` and `drizzle/pg`.
3. Regenerate with the original name:

   ```bash
   pnpm exec drizzle-kit generate --config drizzle/sqlite.config.ts --name <name>
   pnpm exec drizzle-kit generate --config drizzle/pg.config.ts --name <name>
   ```

4. Diff the new `.sql` against the saved one. It should be identical; if not,
   upstream changed a table the fork touches and the difference needs reading.
5. Search the repo for the old filename. Tests read migrations by path.

### Deployed databases must be told about the rename

D1 records applied migrations by filename in `d1_migrations`. A database that
already ran the fork's migration under its old name will try to run the
renamed file and fail with `table ... already exists`. Upstream's new
migrations still apply first, so the database is not left half-migrated.

Confirm before changing anything (read-only):

```bash
pnpm exec wrangler d1 execute <db-name> --remote --json \
  --command "SELECT id, name FROM d1_migrations ORDER BY id"
```

Expect exactly one recorded name with no file (the old name) and one file with
no record (the new name), and check the live tables match the new `.sql`. Then
the fix is one row, run by the user or with their go-ahead since it writes to a
deployed database:

```bash
pnpm exec wrangler d1 execute <db-name> --remote --command \
  "UPDATE d1_migrations SET name = '<new>.sql' WHERE name = '<old>.sql'"
```

The self-hosted database is `open-seo-db-selfhost`. Do this before deploying,
for every environment that ran the old name, including local D1 (`--local`).
Postgres tracks migrations by journal timestamp instead and has not been
through a rename yet; check how it behaves before deploying one there.

Tell the user about the rename in the sync report every time.

## 5. Find what upstream added around the fork's features

These gaps cause no conflict and no failing test. After each sync, for every
fork feature, find where upstream handles the nearest equivalent and check the
fork's feature is handled too. For the Bing integration the equivalent is
Search Console:

```bash
git diff --stat <old-base> upstream/main -- src | tail -1
grep -rln "gscConnections\|GOOGLE_CLIENT_ID" --exclude-dir=node_modules \
  --exclude-dir=.git . | xargs grep -L -i "bing"
```

Places that mattered so far:

- Account erasure (`src/server/account-deletion/`): rows with a user id but no
  user foreign key must be deleted explicitly.
- Workspace merge (`src/server/auth/workspace-merge.ts`): organization-scoped
  rows must be repointed, or they are deleted with the old workspace.
- Deploy surfaces that forward an explicit list of variables: `compose.yaml`,
  `deploy/standalone/`, `scripts/celld/runtime/configure.mjs`,
  `deploy/alchemy/alchemy.run.ts`.
- New auth modes and editions (`everyapp.config.ts`, `src/lib/auth-mode`): a
  fork feature may need a secret or a gate there.

Fix real gaps; report product decisions (hide a feature in a mode, add
telemetry) instead of deciding them.

## 6. Verify, then report

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm knip && pnpm format:check && pnpm test
```

Report to the user: the new tip, each conflict that involved a choice, the gaps
fixed in step 5, migration renames and the databases that need the
`d1_migrations` update, anything not checked (for example the UI in a running
app), and that `sealambda/main` now needs a force-push before deploying from
it.
