# Changelog

## 0.1.3 (2026-11-09)

From a Codex smoke test of the published 0.1.2 on Windows.

- README: the CI example selected every new file in `.capsules/`, so the pull request that installs the kit failed on `kit.json`, the schema, the template and the folder README. It now keeps only capsule files (`YYYYMMDD-HHMM-slug.md`) and doesn't fail when there are none.
- `check` skips files named on the command line that can't be capsules (not `.md`, `README.md`, `TEMPLATE.md`, or starting with `_`) and lists them as skipped, instead of failing on them. A misnamed capsule `.md` is still checked.

## 0.1.2 (2026-11-09)

From a Codex evaluation on Windows (Node 22.18, npm 11.6.1).

- Windows line endings: `init` normalizes the kit's rules and templates to LF before writing and compares installed files regardless of line endings, so a second `init` reports every file unchanged in a checkout made with `core.autocrlf=true`. A rules block no longer gets doubled carriage returns. The tests are portable, and `.gitattributes` keeps the kit's own files LF in every checkout.
- `resolves` must be credible: a capsule whose outcome is `failed`, or that is dated before the capsule it names, no longer closes it. `check` warns (an error under `--strict`) and `open` shows the ignored claim and why.
- New optional checks for closeout: `check --evidence` (local evidence paths exist; warns when Git ignores them) and `check --staged` (the capsule's `changes.files` matches the files staged in Git). The agent rules now save evidence first, stage the work with the capsule, and run `check --evidence --staged .capsules/<id>.md` before committing.
- Checking a single capsule file also reads the other capsules in its folder, so `resolves` is checked.
- README: capsules record what the agent reports; the kit does not prove tests ran or evidence is genuine.
- README: a CI example that checks every capsule with `--strict` and the evidence of capsules added in the pull request.

## 0.1.1 (2026-11-09)

- Rules, template and schema: `changes.commits` lists only the task's commits made before the capsule. The commit that adds the capsule can't be listed (its hash doesn't exist yet) and is read from Git with `git log --diff-filter=A -- .capsules/<id>.md`. Found in a trial where an agent following the rules left `commits` empty in every capsule. Run `change-capsules init --refresh` to update an installed template; the format stays `change-capsule/v1`.
- `npm test` works on Node 22.

## 0.1.0 (2026-11-07)

- First version: format `change-capsule/v1`, `init`, `check`, `open`, rules for Codex (`AGENTS.md`) and Claude Code (`CLAUDE.md`).
