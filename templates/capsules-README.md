# Change capsules

Each `.md` file here records one finished task done in this repository, usually by an AI coding agent: why it was done, which files and commits it changed, which tests ran and what they returned, the evidence, and what is still open.

- One file per task, named `<id>.md` (`YYYYMMDD-HHMM-short-slug`, UTC). Capsules are never edited after the fact; later work writes a new capsule that `resolves` the earlier one.
- `TEMPLATE.md` is the starting point; `capsule.schema.json` describes the front matter; `kit.json` names the kit and format version.
- `npx change-capsules open` lists capsules that still need attention; `npx change-capsules check` validates them.

The agent rules live in `AGENTS.md` and `CLAUDE.md`, between the `change-capsules` markers.
