---
title: "Read-only Hansung LMS dashboard boundary"
date: 2026-05-26
status: active
---

# ADR-0128: Read-only Hansung LMS dashboard boundary

## Context

HS-Hub needs a sidebar LMS dashboard for Hansung e-class assignments and deadlines. The available Hs-MCP repository already contains LMS status/course/assignment helpers, but exposing that MCP directly to the renderer or importing the generic MCP server would widen the app's write and data-exposure surface.

## Decision

HS-Hub adds a native read-only LMS command boundary (`lms_status`, `lms_login`, `lms_overview`, `lms_clear_session`) backed by `src-tauri/src/lms_dashboard.rs` and a dedicated Python bridge resource (`src-tauri/resources/lms-hs-mcp-bridge.py`). The bridge imports only Hs-MCP LMS client/tool modules from the bundled `study-space-python/` runtime and does not import `hs_mcp.server` or expose an external MCP endpoint.

The renderer shows a dedicated `LMS 대시보드` sidebar page for connection state, today's urgent assignments, this week's deadlines, manual refresh/logout, and safe original LMS links. Original links are limited to clean `https://learn.hansung.ac.kr` URLs. P0 stays read-only: no submission/editing, no automatic notes, no Calendar write, no grades/attendance, and no periodic polling.

## Consequences

- Credentials and LMS session cookies remain in the native/Hs-MCP keyring path; React receives only dashboard DTOs and Korean-safe errors.
- Native bridge calls enforce timeout, output caps, URL allowlisting, and DTO caps before data reaches the renderer.
- The dashboard fetches on page open/resume/manual refresh only; future background sync or Calendar integration requires a separate ADR and user-facing consent design.
- Hs-MCP LMS changes must be absorbed through the bridge DTO rather than by binding renderer code to MCP server models.

## Verification

- `cargo test --manifest-path src-tauri/Cargo.toml lms_dashboard --lib`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `python3 -m py_compile src-tauri/resources/lms-hs-mcp-bridge.py`
- `pnpm exec vitest run src/lib/lmsDashboard.test.ts src/hooks/useLmsDashboard.test.tsx src/components/LmsDashboardPage.test.tsx`
