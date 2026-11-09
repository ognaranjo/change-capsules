---
format: change-capsule/v1
id: 20261109-2050-windows-eol-resolves-staged
date: "2026-11-09T20:50:00Z"
title: "0.1.2: Windows line endings, credible resolves, check --evidence and --staged"
agent:
  client: claude-code
  model: claude-opus-5-5
outcome: completed
why: >
  A Codex evaluation on Windows (Node 22.18, npm 11.6.1, kit 758e5ae and npm 0.1.1) found
  three test failures and an unstable second init with core.autocrlf=true, a resolves
  field that lets a failed or earlier capsule hide a later partial one from open, no way
  to check a capsule against the staged files or its evidence, and a README that did not
  say capsules are self-reported. Oscar approved the four fixes.
changes:
  files:
    - path: .gitattributes
      status: added
    - path: lib/init.mjs
      status: modified
    - path: lib/capsules.mjs
      status: modified
    - path: bin/change-capsules.mjs
      status: modified
    - path: templates/rules.md
      status: modified
    - path: test/kit.test.mjs
      status: modified
    - path: README.md
      status: modified
    - path: docs/format.md
      status: modified
    - path: docs/cleartrace-mapping.md
      status: modified
    - path: CHANGELOG.md
      status: modified
    - path: package.json
      status: modified
    - path: AGENTS.md
      status: modified
    - path: CLAUDE.md
      status: modified
    - path: .capsules/kit.json
      status: modified
    - path: .capsules/20261109-2050-windows-eol-resolves-staged.md
      status: added
tests:
  - name: Reproduce the Windows failure in a clone made with core.autocrlf=true (before the fix)
    command: git -c core.autocrlf=true clone; npm test; init twice
    result: failed
    count: 13
    failed: 3
    notes: Same three tests as on Windows; the second init updated AGENTS.md and CLAUDE.md. Expected, this is the reproduction.
  - name: Kit test suite on macOS (6 new tests for line endings, resolves, --evidence, --staged)
    command: npm test
    result: passed
    count: 19
    failed: 0
  - name: This capsule against the staged files and its evidence
    command: node bin/change-capsules.mjs check --evidence --staged --strict .capsules/20261109-2050-windows-eol-resolves-staged.md
    result: passed
  - name: Tests and init twice in clones with autocrlf=true and autocrlf=false, and in a copy converted to CRLF
    result: passed
    notes: Run after this capsule was staged; results are in the commit message.
  - name: Same on Windows
    result: not_run
    notes: Needs Codex on Windows; brief in change-capsules-trial-run/windows/RETEST-0.1.2.md.
risks:
  - Windows itself is untested; the autocrlf checkouts are simulated with Git on macOS.
  - "--staged compares paths and statuses only: it cannot tell whether the staged content is what the capsule describes."
follow_ups:
  - Retest 0.1.2 on Windows with Codex, then publish 0.1.2 to npm.
---

Everything the kit writes is now built from LF text and compared without regard to line
endings; an existing file keeps its own line endings when updated. The resolves rule is
the same in check, open and the ClearTrace mapping: a failed capsule, or one dated
before its target, does not close it.
