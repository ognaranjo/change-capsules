---
format: change-capsule/v1
id: 20260101-0000-short-slug           # UTC finish time + slug; the file is named <id>.md
date: "2026-01-01T00:00:00Z"           # when the task finished, quoted
title: "One line: what was done"
agent:
  client: claude-code                  # claude-code, codex, cursor, copilot, aider, human, unknown
  model: unknown                       # as the agent reports it; unknown rather than a guess
outcome: completed                     # completed | partial | failed
why: >
  The request, bug or decision behind this change, in a few sentences.
changes:
  commits: []                          # quoted SHAs, oldest first, e.g. ["3f2c9ab"]
  files:
    - path: src/example.ts
      status: modified                 # added | modified | deleted | renamed | copied (add from: for the last two)
tests:
  - name: Unit tests
    command: npm test
    result: passed                     # passed | failed | skipped | not_run
    count: 0
evidence: []                           # repository-relative paths or https URLs
risks: []
follow_ups: []                         # work left for later; keeps this capsule open
resolves: []                           # ids of earlier capsules this task finished
refs: []                               # issue or ticket ids, spec paths, PR links
---

Optional notes for reviewers: decisions taken, alternatives rejected, how to verify by hand.
