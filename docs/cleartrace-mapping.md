# Mapping change capsules to ClearTrace

Status: design reference for a future `cleartrace import`. Nothing in this kit talks to ClearTrace; this page only fixes how a v1 capsule will map, so capsules written today import without loss.

The capsule format is a strict subset of what a ClearTrace change record holds. Every capsule field has exactly one target; nothing is guessed or dropped. ClearTrace adds identity and context the local kit does not have (solution, project, repository, environment), which the import supplies from the user's ClearTrace project, never from the capsule.

## Detection

A repository uses this kit when `.capsules/kit.json` exists with `"kit": "change-capsules"`. The import reads `format` (must be `change-capsule/v1`), `capsules` (the folder) and validates each file with the same rules as `change-capsules check`. Files that fail are reported and skipped, never repaired.

## One capsule → one change record

Each capsule becomes one `change_capsule` write in a ClearTrace write set (`delivery-to-changehub-push-v1` envelope), plus a change package carrying its files, tests and operations.

| Capsule (v1) | ClearTrace | Notes |
| --- | --- | --- |
| `id` | envelope `objectId` (stored as `changeCapsuleId`) | Kept verbatim. The import may prefix it with the project id when one solution holds several repositories (`<projectId>.<id>`); the original id is kept in `payload.localCapsuleId`. Re-importing the same id with the same content is a no-op. |
| `date` | envelope `createdAt` | Normalized to UTC. |
| `title` | `payload.title` | Same length limits (ClearTrace allows 500; the kit allows 200). |
| `why` | `payload.summary` | ClearTrace's summary limit is 4000, the same as the kit. |
| `outcome` | `payload.outcome` | Same values: `completed`, `partial`, `failed`. |
| `agent.client` | package `actor.tool` | e.g. `claude-code`, `codex`. |
| `agent.model` | package `actor.model` | Information only, as in ClearTrace. |
| (derived) | package `actor.actorType`, `actor.roles`, `actor.connectionId`, `actor.displayName` | `ai_agent` with role `agent`, or `human` with role `developer` when `client` is `human`. `connectionId` is `change-capsules:<client>`. |
| `changes.commits[]` | package `contents.commits` | SHAs as written. The import may resolve short SHAs against the repository when it has access. |
| `changes.files[].path` | `fileChanges[].filePath` | Repository-relative in both. |
| `changes.files[].status` | `fileChanges[].changeStatus` | Same values; ClearTrace also has `unknown`, which the kit never writes. |
| `changes.files[].from` | `fileChanges[].previousFilePath` | For `renamed` and `copied`. |
| `tests[]` | package `contents.tests[]` | `name`, `result`, `count` map by name; `command`, `failed`, `skipped`, `notes` are kept on the same entry. `not_run` is kept as is: a skipped check is evidence too. |
| `operations[]` | one operation run per entry | `kind`, `target`, `runs`, `outcome`, `notes` map by name (same value lists). `target` `<environment>:<service>[:<database>]` splits into ClearTrace's `environment`, `service`, `database`. `startedAt` is the capsule `date` (marked approximate), `ranBy` is `agent` (`user` when `client` is `human`), `actor` is `<client>/<model>`. |
| `evidence[]` | envelope `evidenceRefs` | Paths stay repository-relative; https links stay links. Files are not uploaded unless the user asks. |
| `risks[]` | package `contents.risks` | |
| `follow_ups[]` | `payload.followUps` | Kept on the record. The import may offer to turn them into tickets; it never does so without the user's approval. |
| `resolves[]` | a link from this change record to each resolved one | Resolved capsules not in ClearTrace yet are imported first, or the link is reported as unresolved. |
| `refs[]` | envelope `sourceRefs` | Next to the `project:<projectId>` ref the import adds. |
| Markdown body | `payload.notes` | Text only, never executed or rendered as HTML. |
| `format` | `payload.localFormat` | Kept so the origin of each record is visible. |

Privacy: a capsule holds metadata and summaries, never patch text, so imported packages use privacy mode `metadata_summary`. ClearTrace may add exact diffs later from the commits, only where the project's privacy settings allow it.

## What the import adds, and what stays ClearTrace-only

The import supplies, from the ClearTrace project the user selects: tenant, solution, project, repository and source provenance (branch, remote).

Not in the kit, by design, and not inferred from capsules:

- task sessions with captured base and head commits and working-tree fingerprints, and the plan-hash approval of each closeout;
- typed tickets, findings and test runs as their own records, shared across projects;
- several agents, machines and repositories handing work to each other on one record;
- architecture, data-model, data-flow and environment scans.

## Compatibility promise

- `change-capsule/v1` files will always import with this mapping.
- A future `change-capsule/v2` gets its own section here before it ships.
- Fields are never renamed within a format; see [format.md](format.md#versioning).
