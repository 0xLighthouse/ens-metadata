---
name: changelog
description: Update CHANGELOG.md following the Keep a Changelog 1.0.0 standard. Adds entries to [Unreleased] or cuts a dated version section.
disable-model-invocation: true
argument-hint: "[unreleased|patch|minor|major]"
---

# Changelog Maintenance

Maintain `CHANGELOG.md` at the repo root per the Keep a Changelog 1.0.0 spec: https://keepachangelog.com/en/1.0.0/ — **when in doubt about format or wording, fetch that URL and re-read it.**

Mode: **$ARGUMENTS** — `unreleased` (default) means add new items under `## [Unreleased]`. `patch`, `minor`, or `major` means cut a release: compute the next SemVer version from the most recent dated entry in `CHANGELOG.md`, then promote `[Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` and start a fresh empty `[Unreleased]`.

## Core rules from the spec

- Changelogs are **for humans**, not machines. Summarize intent, don't dump commits.
- Newest version first. Keep `[Unreleased]` at the top so readers see what's coming.
- Every release gets a date in **ISO 8601** (`YYYY-MM-DD`).
- Use only these six categories, in this order, omitting any that are empty:
  1. **Added** — new features
  2. **Changed** — changes in existing functionality
  3. **Deprecated** — soon-to-be removed features
  4. **Removed** — now-removed features
  5. **Fixed** — bug fixes
  6. **Security** — vulnerabilities
- State explicitly that the project adheres to Semantic Versioning (link https://semver.org/spec/v2.0.0.html) in the header.
- Make versions linkable: reference-style links at the bottom comparing tags (e.g. `[1.2.0]: https://github.com/ORG/REPO/compare/v1.1.0...v1.2.0`). Add an `[Unreleased]` link against `HEAD`.
- Don't ignore deprecations — surface them one release before removal.
- Don't confuse dates — never use `mm-dd-yyyy` or `dd-mm-yyyy`.
- Don't let entries become a commit-log diff. Merge related commits into one bullet. Drop noise (typo fixes in comments, reverted-then-restored work, internal refactors with no observable effect).

## Bootstrap (only if CHANGELOG.md does not exist)

Create it with this header, preserving the exact text:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
```

Then add reference-style link definitions at the bottom once you know the repo URL (derive from `git remote get-url origin`, normalize SSH to HTTPS):

```markdown
[Unreleased]: https://github.com/ORG/REPO/compare/vX.Y.Z...HEAD
```

If this is the very first entry and there is no prior tag, use `...HEAD` against the root commit or omit the compare link until the first version is cut.

## Mode: unreleased (default)

1. **Gather raw material.** Look at commits since the last `[Unreleased]` update or last release tag — whichever is more recent:
   ```
   git log --oneline <last-tag>..HEAD
   ```
   Also inspect any PRs/issues referenced. Read the diff where a one-line commit message is ambiguous. Do **not** paste commit hashes or messages verbatim into the changelog.

2. **Synthesize, don't transcribe.** For each meaningful change, write one bullet in the user's voice: what changed from the user's perspective, not what the diff did. Merge related commits. Drop churn, internal refactors with no observable effect, formatting-only passes, and dependency bumps unless they materially affect the user.

3. **Categorize.** Put each bullet under exactly one of the six headings. If something is both a fix and a breaking change, prefer **Changed** and call out the breaking nature inline (`**BREAKING:**`). Security fixes always go under **Security**, even if also a bug fix.

4. **Insert under `## [Unreleased]`.** Preserve existing unreleased bullets. Do not reorder unrelated sections. Keep category headings in spec order.

5. **Show the diff** of the CHANGELOG change to the user before stopping. Do not commit.

## Mode: patch | minor | major (cut a release)

1. **Validate the bump keyword.** Accept exactly `patch`, `minor`, or `major`. Reject anything else and ask the user to correct it.

2. **Determine the current version** by reading `CHANGELOG.md` and finding the first dated heading under `[Unreleased]` — that's the source of truth. Pattern: `## [X.Y.Z] - YYYY-MM-DD`. If no dated entry exists yet (very first release from this skill), treat the current version as `0.0.0` so a `patch` → `0.0.1`, `minor` → `0.1.0`, `major` → `1.0.0`. Do **not** read `package.json` or git tags for this — the changelog is authoritative for its own history.

3. **Compute the next version** by bumping per SemVer:
   - `patch`: `X.Y.Z` → `X.Y.(Z+1)`
   - `minor`: `X.Y.Z` → `X.(Y+1).0`
   - `major`: `X.Y.Z` → `(X+1).0.0`

4. **Confirm `[Unreleased]` is non-empty.** If empty, stop and tell the user there's nothing to release — don't create empty version sections.

5. **Sanity-check major vs minor.** If the user picked `patch` or `minor` but `[Unreleased]` contains a `**BREAKING:**` marker or a `### Removed` section, stop and ask — breaking changes usually warrant a `major` (or a `minor` pre-1.0). Don't silently downgrade user intent, but do flag the mismatch.

6. **Promote `[Unreleased]` to a dated version:**
   - Rename the heading from `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` (today's date in the user's local time, ISO 8601).
   - Insert a fresh empty `## [Unreleased]` section above it so the top of the file always has one.

7. **Update the reference links at the bottom:**
   - `[Unreleased]: .../compare/vX.Y.Z...HEAD`
   - `[X.Y.Z]: .../compare/v<prev>...vX.Y.Z` (or the root commit if this is the first tagged release)
   - Derive repo URL from `git remote get-url origin`. Normalize `git@github.com:ORG/REPO.git` → `https://github.com/ORG/REPO`.

8. **Show the diff** to the user. Tell them the computed version explicitly (`cutting 1.2.0 (minor bump from 1.1.3)`) so they can catch a mis-bump. Do not tag, commit, or push. That's the release workflow's job — this skill only edits `CHANGELOG.md`.

## Guardrails

- **Never** auto-commit or push from this skill.
- **Never** invent entries that aren't supported by the diff/git log.
- **Never** paste raw commit messages as bullets — always rewrite in the user's voice.
- When a commit's intent is unclear, read the diff or ask the user. Don't guess.
- If the user has an unusual project structure (monorepo with per-package changelogs, for instance), ask which file to target before editing.
- If anything in this skill feels underspecified, re-read https://keepachangelog.com/en/1.0.0/ — that's the canonical reference.
