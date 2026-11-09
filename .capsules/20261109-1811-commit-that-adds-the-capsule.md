---
format: change-capsule/v1
id: 20261109-1811-commit-that-adds-the-capsule
date: "2026-11-09T18:11:00Z"
title: Say that capsules list only earlier commits; the one that adds the capsule comes from Git
agent:
  client: claude-code
  model: claude-opus-5-5
outcome: completed
why: >
  In the Claude Code trial (four tasks in a sample repo, prompts never mentioning
  capsules) every capsule had an empty commits list. The rules say to commit the capsule
  with the work, so the agent cannot know the hash of the commit that contains it; one
  agent said so in a comment. The rules, template, schema text and docs now say to list
  only earlier commits and to read the capsule's own commit from Git.
changes:
  files:
    - path: templates/rules.md
      status: modified
    - path: templates/TEMPLATE.md
      status: modified
    - path: schema/capsule.schema.json
      status: modified
    - path: README.md
      status: modified
    - path: docs/format.md
      status: modified
    - path: docs/cleartrace-mapping.md
      status: modified
    - path: package.json
      status: modified
    - path: CHANGELOG.md
      status: added
    - path: AGENTS.md
      status: modified
    - path: CLAUDE.md
      status: modified
    - path: .capsules/kit.json
      status: modified
    - path: .capsules/capsule.schema.json
      status: modified
    - path: .capsules/TEMPLATE.md
      status: modified
    - path: .capsules/20261109-1811-commit-that-adds-the-capsule.md
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
    count: 3
  - name: An agent following the new commits rule
    result: not_run
    notes: The trial ran with 0.1.0; the Codex run on Windows will use 0.1.1.
risks:
  - Only the wording changed; whether agents now list earlier commits correctly is not yet observed.
---

Format stays change-capsule/v1: no field or allowed value changed, only descriptions and
rules text. Installed repos get the new rules with `change-capsules init` and the new
template with `init --refresh`.
