---
title: "Hansung-owned runtime identity and external-service boundary"
status: accepted
date: 2026-05-24
---

# ADR-0123: Hansung-owned runtime identity and external-service boundary

## Context

HS-Hub is derived from the former Tolaria codebase, but the runtime product is now a Hansung University dedicated app. Previous public community, sponsor, telemetry, starter-vault, cache, storage, MCP, and generated-doc surfaces must not direct users to prior-team services or namespaces.

## Decision

HS-Hub uses Hansung-owned app identifiers, storage keys, event names, cache paths, MCP labels, docs, and feedback copy. Optional telemetry remains supported only when explicitly configured by the build/runtime environment; the app does not ship hardcoded PostHog hosts or prior public support endpoints. The Getting Started clone endpoint is disabled unless `HS_HUB_GETTING_STARTED_REPO_URL` is configured.

## Consequences

- Prior app localStorage/config/cache compatibility fallbacks are intentionally removed for the Hansung-specific build.
- Core local features remain: Markdown vault editing, wikilinks/properties, Git workflows, AI/MCP integration, and optional telemetry with explicit HS-Hub-owned configuration.
- Future external services require Hansung-owned URLs or environment configuration before being exposed in UI or docs.

## Verification

- Runtime scan must find no prior `Tolaria`/`Laputa`/prior-team endpoint tokens in source, scripts, tests, MCP, or Tauri runtime files.
- Targeted Vitest and TypeScript checks cover feedback, telemetry config, storage, editor formatting, note windows, theme, and MCP-adjacent behavior.
