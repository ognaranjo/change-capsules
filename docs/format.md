# Change capsule format, v1

Format id: `change-capsule/v1`. Schema: [`schema/capsule.schema.json`](../schema/capsule.schema.json) (JSON Schema 2020-12, front matter only).

## File

- One UTF-8 Markdown file per finished task, in the folder named by `.capsules/kit.json` (`capsules`, default `.capsules`).
- Named `<id>.md`. `README.md`, `TEMPLATE.md` and files starting with `_` in that folder are not capsules.
- Starts with a `---` line, then YAML front matter, then a `---` line, then an optional Markdown body.
- LF or CRLF line endings; a byte-order mark is accepted.

## Id and date

- `id` is `YYYYMMDD-HHMM-<slug>`: the UTC date and time the task finished, then a lowercase slug of letters, digits and single dashes. Example: `20261107-1432-retry-on-sync-timeout`.
- `date` is the same moment in ISO 8601 with a time zone (`Z` or `±HH:MM`). Quote it: some YAML parsers turn unquoted timestamps into date objects.
- An id is permanent. A capsule is not edited after the task; later work writes a new capsule and names the earlier one in `resolves`.

## Commits

The capsule is committed together with the work, so its author can't know the hash of the commit that contains it. `changes.commits` therefore lists only the task's commits made before the capsule was written, and is often empty. The full set of a task's commits is:

1. the commits listed in `changes.commits`, and
2. the commit that added the capsule file: `git log --diff-filter=A --format=%H -- .capsules/<id>.md`.

Tools that read capsules (and any import) combine both. Do not amend the commit afterwards to write its own hash into the capsule: that changes the hash again.

## Fields

See the README table and the schema descriptions. Rules the schema can't express, enforced by `change-capsules check`:

- The file name equals `<id>.md`; ids are unique in the folder; a capsule does not resolve itself.
- No secrets: private keys, cloud and GitHub tokens, API secret keys, Slack tokens and connection strings with passwords are errors.
- Warnings: machine-local paths, an id whose date differs from `date` in UTC, `partial` or `failed` without `follow_ups` or `risks`, no tests and no risks, no files and no operations, a rename without `from`, `resolves` naming an unknown capsule.

## Open capsules

A capsule is **open** when no other capsule lists its id in `resolves`, and either its `outcome` is not `completed` or it has at least one `follow_ups` entry.

## YAML subset

Front matter must be plain YAML that every parser reads the same way. The checker refuses, with a line number: anchors and aliases, tags, multi-line quoted strings, nested flow collections, flow mappings other than `{}`, tabs in indentation, duplicate keys, and plain values containing `: ` (quote them). Plain scalars resolve with the YAML 1.2 core schema, so `true`, `42` and `null` are not strings: quote commit SHAs and anything else that must stay text.

## Manifest

`.capsules/kit.json`:

```json
{
  "kit": "change-capsules",
  "kitVersion": "0.1.1",
  "format": "change-capsule/v1",
  "formatVersion": 1,
  "capsules": ".capsules",
  "schema": ".capsules/capsule.schema.json",
  "agents": ["claude", "codex"]
}
```

Tools detect the kit by `kit == "change-capsules"` and read capsules from `capsules` using `format`. `init` sets these keys and keeps any other key you add.

## Versioning

- Within `change-capsule/v1` the field set and value lists are fixed. Kit releases (`kitVersion`) may change rules text, warnings and tooling, never what a valid v1 file is.
- Any new field, new allowed value or changed meaning is a new format id (`change-capsule/v2`) with a new `formatVersion`. Files keep the `format` they were written with, and the checker keeps validating v1 files as v1.
