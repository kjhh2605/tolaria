---
title: "Hs-MCP Python bridge for study-space reservations"
status: accepted
date: 2026-05-24
---

# ADR-0126: Hs-MCP Python bridge for study-space reservations

## Context

The Hansung study-space UI must reuse the already validated Hs-MCP reservation logic instead of reimplementing school endpoints in Rust. Hs-MCP is a Python package that owns login form discovery, reservation endpoint details, keyring-backed facility sessions, availability checks, reservation creation, and my-reservation verification.

## Decision

HS-Hub invokes a bundled Python bridge script at `src-tauri/resources/study-space-hs-mcp-bridge.py` from the Tauri study-space command boundary. The bridge imports the locally installed `hs_mcp` package, reads a single JSON request from stdin, writes one sanitized JSON response to stdout, and delegates to Hs-MCP `FacilityTools`.

The renderer can collect a Hansung student id and password, but the password is sent only to the native command boundary for immediate login. Hs-MCP stores facility session cookies in the OS credential store; HS-Hub does not persist the password in settings, notes, logs, or calendar exports. If `hs_mcp` or keyring is unavailable, the adapter returns a Korean error and the UI remains non-destructive.

For live reservation creation, the bridge performs Hs-MCP's explicit `dry_run=false` + `confirm=true` path, then re-reads my reservations and selects the newest non-canceled matching reservation so stale canceled history cannot be mistaken for the newly created booking.

## Consequences

- HS-Hub reuses Hs-MCP's endpoint knowledge while keeping the app command API typed and Korean-error-normalized.
- Runtime environments need Python plus the `hs-mcp` package available to the app process until HS-Hub bundles a fully self-contained reservation runtime.
- The live booking command remains gated by the confirmation dialog and native request validation.
- Future work should replace the external Python dependency only if it preserves Hs-MCP parity tests and the same secret boundary.

## Verification

- Rust study-space tests cover validation, confirm gating, and redaction.
- Frontend tests cover secure login UI, confirmation-only reservation, and sanitized note artifacts.
- Live QA on 2026-05-24 KST confirmed 2026-05-27 13:00–15:00 KST 코딩라운지 103호 was available and created reservation `36726`, then verified it in masked my-reservation history as `승인대기`.
