---
format: change-capsule/v1
id: 20261109-1608-set-github-owner
date: "2026-11-09T16:08:00Z"
title: Point the README and package.json at github.com/ognaranjo/change-capsules
agent:
  client: claude-code
  model: claude-opus-5-5
outcome: completed
why: >
  Oscar reviewed the first version and created the public repository
  github.com/ognaranjo/change-capsules under his personal account. The README clone
  command still had an OWNER placeholder, and package.json had no repository links
  for npm.
changes:
  commits: []
  files:
    - path: README.md
      status: modified
    - path: package.json
      status: modified
    - path: .capsules/20261109-1608-set-github-owner.md
      status: added
tests:
  - name: Kit test suite
    command: npm test
    result: passed
    count: 13
    failed: 0
  - name: Capsules in this repository
    command: node bin/change-capsules.mjs check --strict
    result: passed
    count: 2
risks:
  - The clone command in the README was not run against GitHub; the repository was empty when this capsule was written.
follow_ups:
  - Run the agent test project (Claude Code on macOS, Codex on Windows) before announcing the kit.
  - Run npm test and the init/check walkthrough on Windows.
  - Reserve and publish the npm package so npx change-capsules works.
resolves:
  - 20261107-1945-first-release-of-the-kit
---

package.json also fixes the test script: `node --test test/` fails on Node 22 (a directory
is not accepted), so `npm test` now runs `node --test`, which finds test/kit.test.mjs.

The first capsule's review and owner follow-ups are done; its Windows and npm
follow-ups are carried here, so this capsule is the one that stays open.
