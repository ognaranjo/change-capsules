## Change capsules

This repository keeps one change capsule per finished task in `.capsules/`, so the reason for a change, what was tested and what is still open stay with the code.

**Before you start a task**

1. Read the open capsules: run `npx change-capsules open`, or read the files in `.capsules/` whose `outcome` is not `completed` or that list `follow_ups` that no later capsule names in `resolves`.
2. If one of them is about your task, say so, continue from it, and list its id in `resolves` when you finish. Only a capsule that isn't `failed`, written after the one it names, closes it.

**When you finish a task that changed files or ran an operation (deploy, migration, script run)**

3. Save the logs, reports or screenshots you will cite as evidence first, inside the repository.
4. Write one capsule: copy `.capsules/TEMPLATE.md` to `.capsules/<id>.md`, where the id is the UTC finish time plus a short slug, for example `20261107-1432-retry-on-sync-timeout`.
5. Fill it from what actually happened, not from the plan:
   - `why`: the request, bug or decision behind the change.
   - `changes`: every file the task changed, including saved evidence and the capsule itself. Take the list from `git status` after everything is saved. In `commits`, list only the task's commits made before the capsule; leave out the commit that will contain the capsule, because its hash doesn't exist yet. Tools find that one from Git.
   - `tests`: each check you ran, with the exact command and its real result. A check you skipped is `not_run`; never report a test you did not run.
   - `evidence`: repository-relative paths or https links to logs, screenshots or CI runs that back the claims.
   - `risks` and `follow_ups`: what was not verified and what is left.
   - `agent`: your client (`claude-code`, `codex`, …) and your model as you know it; write `unknown` rather than guess.
   - `outcome`: `completed`, `partial` (useful work landed, more remains) or `failed`.
6. Never put secrets, tokens, connection strings, customer data or machine-local paths (`/Users/...`, `C:\Users\...`) in a capsule.
7. Stage the work, the evidence and the capsule (`git add`), then run `npx change-capsules check --evidence --staged .capsules/<id>.md`. It compares `changes.files` with what is staged and checks that the evidence files exist. Fix the capsule or the staging until it passes, then commit. Without Node, compare `git diff --cached --name-status` with `changes.files` yourself.
8. End your reply with one line: the capsule id and its path.

Small questions and read-only answers need no capsule. One task, one capsule: if the work continues later, write a new capsule that `resolves` the earlier one instead of editing it.
