# Changelog

## 0.1.1 (2026-11-09)

- Rules, template and schema: `changes.commits` lists only the task's commits made before the capsule. The commit that adds the capsule can't be listed (its hash doesn't exist yet) and is read from Git with `git log --diff-filter=A -- .capsules/<id>.md`. Found in a trial where an agent following the rules left `commits` empty in every capsule. Run `change-capsules init --refresh` to update an installed template; the format stays `change-capsule/v1`.
- `npm test` works on Node 22.

## 0.1.0 (2026-11-07)

- First version: format `change-capsule/v1`, `init`, `check`, `open`, rules for Codex (`AGENTS.md`) and Claude Code (`CLAUDE.md`).
