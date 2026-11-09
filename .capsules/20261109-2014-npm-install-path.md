---
format: change-capsule/v1
id: 20261109-2014-npm-install-path
date: "2026-11-09T20:14:00Z"
title: Make npx the install path in the README now that the package is on npm
agent:
  client: claude-code
  model: claude-opus-5-5
outcome: completed
why: >
  Oscar published change-capsules 0.1.1 to npm. The README still asked "Not on npm yet",
  so the clone method now reads as the alternative for people who prefer not to use npm,
  and a line explains pinning the version with a dev dependency.
changes:
  files:
    - path: README.md
      status: modified
    - path: .capsules/20261109-2014-npm-install-path.md
      status: added
tests:
  - name: Kit test suite (includes the README example capsule)
    command: npm test
    result: passed
    count: 13
    failed: 0
  - name: npx change-capsules from the registry
    command: npx -y change-capsules --version
    result: not_run
    notes: At 20:13Z the registry held only a 0.0.0-stage placeholder; 0.1.1 was awaiting npm's staged release.
risks:
  - Until npm releases 0.1.1, npx change-capsules installs a placeholder and the README's main install path fails.
follow_ups:
  - Confirm npm shows 0.1.1 as latest and that npx change-capsules init works in an empty repository.
---

README only; no version bump, so the npm page shows the 0.1.1 README until the next publish.
