---
format: change-capsule/v1
id: 20261109-2153-ci-filter-skip-kit-files
date: "2026-11-09T21:53:00Z"
title: "0.1.3: CI example and check skip the kit's own files"
agent:
  client: claude-code
  model: claude-opus-5-5
outcome: completed
why: >
  Codex smoke-tested the published 0.1.2 on Windows and found that the README's CI
  example selects every new file in .capsules/, so the pull request that installs the
  kit fails on kit.json, the schema, the template and the folder README. Reproduced
  here with npx change-capsules@0.1.2. Oscar asked for a 0.1.3 with the README filter
  and a checker that skips those files when they are named on the command line.
changes:
  files:
    - path: README.md
      status: modified
    - path: lib/capsules.mjs
      status: modified
    - path: bin/change-capsules.mjs
      status: modified
    - path: test/kit.test.mjs
      status: modified
    - path: CHANGELOG.md
      status: modified
    - path: package.json
      status: modified
    - path: docs/format.md
      status: modified
    - path: .capsules/kit.json
      status: modified
    - path: .capsules/20261109-2153-ci-filter-skip-kit-files.md
      status: added
tests:
  - name: Reproduce the failure with the published 0.1.2 on a kit-install pull request
    command: git diff --name-only --diff-filter=A main...HEAD -- .capsules/ | xargs -r npx -y change-capsules@0.1.2 check --evidence --strict
    result: failed
    notes: Expected; all four kit files reported FAIL. This is the reproduction.
  - name: Kit test suite, including the README's CI step run from the README text on an install PR and a capsule PR
    command: npm test
    result: passed
    count: 21
    failed: 0
  - name: The workflow on GitHub Actions
    result: not_run
    notes: The step is run locally with bash -eo pipefail, as Actions runs it; not on a real pull request.
risks:
  - The README test needs bash; it skips itself where bash is missing (some Windows setups).
follow_ups:
  - After Oscar publishes 0.1.3, confirm npm gitHead and smoke-test npx change-capsules@0.1.3 on a kit-install pull request.
---

The checker change is a safety net; the README filter is the fix. A misnamed capsule .md
named on the command line is still checked, so the skip can't hide a broken capsule.
