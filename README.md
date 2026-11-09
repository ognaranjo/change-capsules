# Change capsules

**Keep the why, the tests and the evidence of every AI agent change, in your repo.**

Coding agents change a lot of code, fast. The diff survives in Git. What doesn't survive is everything around it: why the change was made, which tests actually ran and what they returned, what the agent didn't verify, and what it left for later. That lives in a chat window that scrolls away. A week later nobody can say whether "all tests pass" meant the full suite, one file, or nothing at all.

A **change capsule** is one small Markdown file per finished task, written by the agent itself into `.capsules/`, committed with the work:

- **why** the change was made,
- **what** changed (files and commits),
- **which tests ran**, with the exact command and the real result (including the ones that didn't run),
- **evidence**: logs, screenshots, CI runs,
- **risks** and **follow-ups** that are still open.

This kit gives your agents the rules to write capsules and to read the open ones before starting new work, plus a tiny checker. One repo, one agent at a time, plain files. No account, no service, no network, no dependencies.

## Install (2 minutes)

You need Node 18 or later for the installer and checker. The capsules themselves are plain Markdown; any agent can write them without Node.

```bash
cd your-repo
npx change-capsules init
```

To pin the version for your team and CI, add it as a dev dependency (`npm install --save-dev change-capsules`); `npx change-capsules` then uses the installed copy.

Prefer not to use npm? Clone this repository and run the script directly:

```bash
git clone https://github.com/ognaranjo/change-capsules.git ~/change-capsules
cd your-repo
node ~/change-capsules/bin/change-capsules.mjs init
```

`init` adds:

| File | What it is |
| --- | --- |
| `AGENTS.md` | Rules for Codex (and other agents that read `AGENTS.md`), between `change-capsules` markers |
| `CLAUDE.md` | The same rules for Claude Code, between the same markers |
| `.capsules/kit.json` | Manifest: kit name, kit version, format version |
| `.capsules/capsule.schema.json` | JSON Schema of the capsule front matter |
| `.capsules/TEMPLATE.md` | The capsule the agent copies and fills |
| `.capsules/README.md` | A short note for humans browsing the folder |

Run it again at any time: it only rewrites the text between its own markers and its own schema and manifest. Your text in `AGENTS.md` and `CLAUDE.md`, your edited template and your capsules are never touched. Options: `--agents codex` or `--agents claude` to install one adapter, `--dry-run` to see what would change, `--refresh` to replace an edited template with the kit's.

Commit the files. From the next task on, the agent closes out with a capsule.

**What a capsule proves, and what it doesn't.** A capsule records what the agent reports. The kit checks that the record is complete and consistent and, with `--staged` and `--evidence`, that it matches the staged files and that the cited evidence exists. It does not prove that a test ran or that a log is genuine. Before you rely on a capsule, have a person or another agent read the logs it cites.

## What the agent does

Before a task, it runs `npx change-capsules open` (or reads `.capsules/`) to see unfinished work: capsules whose outcome is `partial` or `failed`, or that list follow-ups nobody has resolved yet.

After a task that changed files, it saves any logs it will cite, writes `.capsules/<id>.md`, stages the work with the capsule, checks them with `npx change-capsules check --evidence --staged .capsules/<id>.md`, commits, and tells you the capsule id. When it finishes something an earlier capsule left open, it lists that capsule in `resolves`, and the earlier one drops off the open list. A failed capsule, or one dated before the capsule it names, doesn't close it. Capsules are never edited after the fact.

## An example capsule

`.capsules/20261103-1610-retry-on-sync-timeout.md`:

```markdown
---
format: change-capsule/v1
id: 20261103-1610-retry-on-sync-timeout
date: "2026-11-03T16:10:00Z"
title: Retry the nightly inventory sync when the supplier API times out
agent:
  client: claude-code
  model: claude-opus-5-5
outcome: completed
why: >
  The nightly inventory sync failed three times last week because the supplier API
  timed out once and the job gave up. Issue #142 asks for retries on timeouts only,
  not on validation errors, so bad data still fails fast.
changes:
  commits: ["3f2c9ab", "8d41e07"]
  files:
    - path: src/sync/supplier-client.ts
      status: modified
    - path: src/sync/retry.ts
      status: added
    - path: test/sync/retry.test.ts
      status: added
tests:
  - name: Unit tests
    command: npm test
    result: passed
    count: 48
  - name: End-to-end sync against the supplier sandbox
    result: not_run
    notes: Sandbox credentials are not available on this machine.
evidence:
  - logs/test-run-20261103.txt
risks:
  - The end-to-end run did not happen; retries are verified with a stub only.
follow_ups:
  - Run the sync against the supplier sandbox once credentials are available.
refs: ["#142"]
---

Retries apply to ETIMEDOUT, ECONNRESET and HTTP 502/503/504 only. A 4xx answer
still fails on the first attempt, as the issue asked.
```

It works the same outside application code. [`examples/capsules`](examples/capsules) also has a PowerShell change with Pester tests and a read-only check run against staging, recorded under `operations`.

## The format

YAML front matter (machine-readable) plus a free Markdown body (human notes). The front matter fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `format` | yes | Always `change-capsule/v1` |
| `id` | yes | `YYYYMMDD-HHMM-short-slug`, UTC finish time; the file is `<id>.md` |
| `date` | yes | Finish time, ISO 8601 with time zone, quoted |
| `title` | yes | One line: what was done |
| `agent` | yes | `client` (`claude-code`, `codex`, …) and `model`, as the agent declares them (`unknown` is fine) |
| `outcome` | yes | `completed`, `partial` or `failed` |
| `why` | yes | The request, bug or decision behind the change |
| `changes` | yes | `files` (`path`, `status`, `from` for renames) and the task's earlier `commits`; the commit that adds the capsule is read from Git |
| `tests` | yes | Each check: `name`, `command`, `result` (`passed`, `failed`, `skipped`, `not_run`), counts, notes |
| `operations` | no | Deploys, migrations, scripted runs: `kind`, `target` (`env:service`), `runs`, `outcome` |
| `evidence` | no | Repository-relative paths or https links |
| `risks` | no | What is unverified or could still be wrong |
| `follow_ups` | no | Work left for later; keeps the capsule open |
| `resolves` | no | Ids of earlier capsules this task finished (ignored when this capsule failed or is dated before them) |
| `refs` | no | Issues, tickets, specs, PRs |

The full contract is [`schema/capsule.schema.json`](schema/capsule.schema.json) and [`docs/format.md`](docs/format.md). The format is versioned: a future `change-capsule/v2` will be a new `format` value, and v1 files stay valid.

## Checking capsules

```bash
npx change-capsules check            # validates .capsules/
npx change-capsules check --strict   # warnings fail too (useful in CI)
npx change-capsules check --evidence --staged .capsules/<id>.md   # at closeout, after git add
npx change-capsules open             # what is still open
```

`check` validates every capsule against the schema, checks that file names match ids and ids are unique, and refuses capsules that look like they contain a token, private key or a connection string with a password. It warns about machine-local paths, `partial` or `failed` capsules that don't say what's left, capsules with no tests and no risks, and `resolves` claims that don't count (from a failed capsule, or one dated before its target). Add `--json` for machine-readable output.

Two optional checks are meant for the moment a task closes:

- `--evidence`: every local evidence path in the capsule exists, with a warning when Git ignores it (only this machine would have it).
- `--staged`: the capsule's `changes.files` lists exactly the files staged in Git, naming any that are missing or extra. It applies to the capsules that are themselves staged.

To check capsules in CI, run `npx change-capsules check --strict` as a step.

## Scope

This kit is deliberately small: one repository, one agent at a time, local files. There is no server, nothing leaves your machine, and the checker has no dependencies.

## License

MIT. See [LICENSE](LICENSE).

## When work spans agents

When several agents hand work to each other — one coding, one testing, one handling customer intake, on one machine or across a team — that's ClearTrace ([cleartrace.dev](https://cleartrace.dev)).
