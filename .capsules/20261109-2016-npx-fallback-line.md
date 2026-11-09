---
format: change-capsule/v1
id: 20261109-2016-npx-fallback-line
date: "2026-11-09T20:16:00Z"
title: Point readers to the git clone method while npm holds 0.1.1 in staged publishing
agent:
  client: claude-code
  model: claude-opus-5-5
outcome: completed
why: >
  npm put change-capsules 0.1.1 into staged publishing; the registry serves only a
  0.0.0-stage placeholder, so `npx change-capsules init` fails for now. The README already
  made npx the main install path, so a line under the npx command sends readers to the
  git clone method until 0.1.1 is released.
changes:
  files:
    - path: README.md
      status: modified
    - path: .capsules/20261109-2016-npx-fallback-line.md
      status: added
tests:
  - name: Kit test suite (includes the README example capsule)
    command: npm test
    result: passed
    count: 13
    failed: 0
  - name: npm registry version
    command: npm view change-capsules version
    result: failed
    notes: Printed 0.0.0-stage at 20:14Z; 0.1.1 not released yet.
risks:
  - The fallback line becomes stale once npm releases 0.1.1 and should then be removed.
follow_ups:
  - When `npm view change-capsules version` prints 0.1.1, remove the fallback line and check `npx change-capsules init` in an empty repository.
---

Kept short on purpose: one line, no explanation of npm's staged publishing.
