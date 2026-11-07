---
format: change-capsule/v1
id: 20261107-1945-first-release-of-the-kit
date: "2026-11-07T19:45:00Z"
title: First version of the change-capsules kit (format v1, init, check, open)
agent:
  client: claude-code
  model: claude-opus-5-5
outcome: partial
why: >
  Agents change code and the reason, the tests that really ran and the evidence vanish
  with the chat. This kit gives a single agent in a single repository a local, plain-file
  way to keep them: one capsule per finished task, rules for Codex and Claude Code, and a
  zero-dependency checker. The format is a strict subset of a ClearTrace change record so
  capsules can be imported later without loss.
changes:
  commits: []
  files:
    - path: README.md
      status: added
    - path: LICENSE
      status: added
    - path: package.json
      status: added
    - path: .gitignore
      status: added
    - path: bin/change-capsules.mjs
      status: added
    - path: lib/yaml.mjs
      status: added
    - path: lib/schema.mjs
      status: added
    - path: lib/capsules.mjs
      status: added
    - path: lib/init.mjs
      status: added
    - path: schema/capsule.schema.json
      status: added
    - path: templates/rules.md
      status: added
    - path: templates/TEMPLATE.md
      status: added
    - path: templates/capsules-README.md
      status: added
    - path: examples/capsules/20261103-1610-retry-on-sync-timeout.md
      status: added
    - path: examples/capsules/20261105-1415-iis-cert-renewal-check.md
      status: added
    - path: docs/format.md
      status: added
    - path: docs/cleartrace-mapping.md
      status: added
    - path: test/kit.test.mjs
      status: added
    - path: test/fixtures/broken/20261106-1200-broken-capsule.md
      status: added
    - path: AGENTS.md
      status: added
    - path: CLAUDE.md
      status: added
    - path: .capsules/kit.json
      status: added
    - path: .capsules/capsule.schema.json
      status: added
    - path: .capsules/TEMPLATE.md
      status: added
    - path: .capsules/README.md
      status: added
    - path: .capsules/20261107-1945-first-release-of-the-kit.md
      status: added
tests:
  - name: Kit test suite (parser, schema, check, open, init idempotence)
    command: npm test
    result: passed
    count: 13
    failed: 0
  - name: init twice on a scratch Git repository with an existing AGENTS.md
    command: change-capsules init (run twice), then git status --porcelain
    result: passed
    notes: Second run reported every file unchanged and git status was empty.
  - name: check on the examples and on a broken capsule
    command: change-capsules check examples/capsules; change-capsules check test/fixtures/broken
    result: passed
    notes: Examples exit 0 with no warnings; the broken capsule exits 1 with ten named errors.
  - name: Front matter parsed identically by the kit parser and the yaml library (core schema)
    result: passed
    notes: Both examples, the template and two edge-case snippets.
  - name: Run on Windows
    result: not_run
    notes: CRLF and byte-order-mark handling are covered by unit tests only.
evidence:
  - test/kit.test.mjs
  - test/fixtures/broken/20261106-1200-broken-capsule.md
risks:
  - Not run on Windows yet; paths, CRLF files and the npx entry point need a real check there.
  - The parser accepts a strict YAML subset on purpose; an agent writing anchors, tags or multi-line quoted strings gets an error and must rewrite.
  - The npm name change-capsules was free on 2026-11-07 but is not reserved.
follow_ups:
  - Review by Oscar before anything is published.
  - Choose the GitHub owner and repository name, and replace OWNER in README.md.
  - Run npm test and the init/check walkthrough on Windows.
  - Reserve and publish the npm package so npx change-capsules works.
---

Built from ClearTrace's own concepts (task closeout, change capsules, test runs, evidence,
operation runs) without copying its code. The mapping to a ClearTrace change record is in
docs/cleartrace-mapping.md. Outcome is partial because publishing waits for review.
