---
title: "Hansung study-space reservation artifacts"
status: accepted
date: 2026-05-24
---

# ADR-0125: Hansung study-space reservation artifacts

## Context

HS-Hub now includes a Hansung University learning-space reservation surface. Reservations are performed through the native study-space adapter, but users still need durable, vault-owned evidence of a completed booking and a way to add the booking to their calendar without exposing account secrets, school-session tokens, cookies, or raw adapter payloads.

## Decision

Successful reservations create user-controlled artifacts only after the adapter reports success:

- A Markdown reservation note is written under `reservations/` in the active vault through the existing Tauri note-write boundary.
- The note uses `type: Reservation` and stores only booking metadata: reservation id, room, date/time, verification state, and team member names/student numbers.
- Calendar export is a local `.ics` download generated in the renderer from the same sanitized booking summary.
- The renderer never stores Hansung account passwords, transient auth tokens, cookies, or raw MCP request/response bodies in notes, localStorage, settings, or calendar files.

## Consequences

- Reservation records follow the vault like other Markdown notes and remain searchable/editable in HS-Hub.
- Calendar export is explicit and file-based; HS-Hub does not request calendar-account permissions or sync to an external calendar service.
- Duplicate note filenames are rejected by the native create path instead of overwriting an existing reservation note.
- Future reservation backends must keep this artifact boundary and add tests proving credentials and raw adapter payloads are excluded.

## Verification

- `src/lib/studySpaceReservationArtifacts.test.ts` covers sanitized Markdown note generation, ICS output, and stable filenames.
- `src/components/StudySpaceReservationPage.test.tsx` covers the post-success save-note flow.
- `scripts/study-space-secret-scan.mjs` must continue to pass without finding seeded credential values in source artifacts.
