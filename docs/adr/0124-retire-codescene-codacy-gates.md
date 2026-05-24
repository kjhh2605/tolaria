---
title: "Retire CodeScene and Codacy quality gates"
date: 2026-05-24
status: active
supersedes:
  - 0018-codescene-code-health-gates
  - 0064-ratcheted-codescene-thresholds
---

## Context

HS-Hub no longer uses CodeScene or Codacy as development, commit, push, or release gates. Keeping those tools in project instructions creates false blockers and makes local delivery depend on services that are not part of the current workflow.

The repository still needs quality gates, but those gates should be the local, reproducible checks already owned by the project: lint, TypeScript, unit tests, coverage, Rust tests, Rust coverage, documentation builds, localization validation, and Playwright smoke tests for core flows.

## Decision

Remove CodeScene and Codacy from active project workflow instructions and repository ignore rules. Do not require CodeScene scores, Codacy scans, CodeScene MCP access, Codacy MCP access, `.codescene-thresholds`, `.codacy/cli.sh`, or related environment variables for task completion.

Existing historical ADRs remain as immutable records. This ADR supersedes the CodeScene gate policy and establishes local reproducible checks as the active quality baseline.

## Consequences

- Commits and pushes are no longer blocked by unavailable CodeScene or Codacy services.
- Completion reports no longer include CodeScene or Codacy sections.
- Developers still run lint, typecheck, tests, coverage, docs, localization validation, and smoke tests where relevant.
- Security-sensitive changes must still be reviewed and tested, but there is no Codacy-specific command or MCP requirement.

## Rejected alternatives

- **Keep optional CodeScene/Codacy instructions**: rejected because optional service-specific guidance still causes stale automation and agent confusion.
- **Replace with another hosted quality service now**: rejected because the current requirement is removal, not dependency replacement.
