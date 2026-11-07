---
format: change-capsule/v1
id: 20261105-1415-iis-cert-renewal-check
date: "2026-11-05T09:15:00-05:00"
title: Add a PowerShell check that warns 30 days before an IIS certificate expires
agent:
  client: codex
  model: gpt-5.1-codex
outcome: completed
why: >
  A certificate on the staging web farm expired unnoticed in October. The team asked for
  a scheduled check that reads the bound certificates on each IIS site and raises a
  warning 30 days before expiry, without changing any binding itself.
changes:
  commits: ["c71e5d2"]
  files:
    - path: scripts/Test-IisCertificateExpiry.ps1
      status: added
    - path: tests/Test-IisCertificateExpiry.Tests.ps1
      status: added
    - path: scripts/README.md
      status: modified
tests:
  - name: Pester unit tests with mocked certificate store
    command: Invoke-Pester -Path tests/Test-IisCertificateExpiry.Tests.ps1
    result: passed
    count: 9
    failed: 0
  - name: PSScriptAnalyzer
    command: Invoke-ScriptAnalyzer -Path scripts/Test-IisCertificateExpiry.ps1 -Severity Warning,Error
    result: passed
operations:
  - kind: check
    target: staging:web-farm
    runs: scripts/Test-IisCertificateExpiry.ps1 -WarnDays 30
    outcome: succeeded
    notes: Read-only run on the two staging nodes; one warning for a certificate expiring in 21 days.
evidence:
  - logs/pester-20261105.xml
  - logs/staging-cert-check-20261105.txt
risks:
  - Only tested on Windows Server 2022 with the WebAdministration module; not tried on Server 2016.
---

The script only reads bindings and certificates (`Get-WebBinding`, `Cert:\LocalMachine\My`) and
exits with code 1 when anything is within the warning window, so the scheduler can alert on it.
It never renews or rebinds a certificate.
