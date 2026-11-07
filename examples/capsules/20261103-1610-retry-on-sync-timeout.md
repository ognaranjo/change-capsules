---
format: change-capsule/v1
id: 20261103-1610-retry-on-sync-timeout
date: "2026-11-03T16:10:00Z"
title: Retry the nightly inventory sync when the supplier API times out
agent:
  client: claude-code
  model: claude-opus-5-5
outcome: completed
why: >
  The nightly inventory sync failed three times last week because the supplier API
  timed out once and the job gave up. Issue #142 asks for retries on timeouts only,
  not on validation errors, so bad data still fails fast.
changes:
  commits: ["3f2c9ab", "8d41e07"]
  files:
    - path: src/sync/supplier-client.ts
      status: modified
    - path: src/sync/retry.ts
      status: added
    - path: test/sync/retry.test.ts
      status: added
    - path: docs/operations/inventory-sync.md
      status: modified
tests:
  - name: Unit tests
    command: npm test
    result: passed
    count: 48
    failed: 0
  - name: Retry behaviour against a stubbed slow supplier
    command: npm test -- test/sync/retry.test.ts
    result: passed
    count: 6
  - name: End-to-end sync against the supplier sandbox
    result: not_run
    notes: Sandbox credentials are not available on this machine.
evidence:
  - logs/test-run-20261103.txt
  - https://github.com/example/inventory/actions/runs/1234567890
risks:
  - The end-to-end run against the supplier sandbox did not happen; retries are verified with a stub only.
  - Three retries with a 2 s, 4 s, 8 s backoff add up to 14 s to a failing night; the job timeout is 10 minutes.
follow_ups:
  - Run the sync against the supplier sandbox once credentials are available, and attach the log.
refs:
  - "#142"
---

Retries apply to `ETIMEDOUT`, `ECONNRESET` and HTTP 502/503/504 only. A 4xx answer still fails
on the first attempt, as the issue asked. The backoff lives in `retry.ts` so the other two
supplier clients can use it later; they were left unchanged on purpose.
