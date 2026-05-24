# Hansung Study-Space Reservation QA

## Live QA evidence — 2026-05-24 KST

Target requested by the product owner:

- Date/time: 2026-05-27 13:00–15:00 KST
- Area/room: 코딩라운지 103호 (`coding_lounge`, Hs-MCP space `세미나실 103호`)
- Path: Hs-MCP `HansungFacilityClient` + `FacilityTools`

Sanitized result:

- Login: succeeded with a transient in-memory Hs-MCP client for live QA. No password was written to repo files, notes, logs, or calendar artifacts.
- Availability: available; requested slots `13:00`, `14:00`; no busy slots.
- Reservation: created and then verified from my-reservation history.
- Verified reservation id: `36726`
- Verified status: `승인대기`
- History output contained only masked personal fields (`21***68`, masked Korean name).

Note: the local keyring-backed Hs-MCP session store returned a platform keychain write error in this headless QA environment, so live QA used a transient client session. The app path still surfaces keyring failures as Korean non-destructive errors and does not persist passwords.

## Regression checklist

Run after changes to the study-space feature:

```bash
npx tsc --noEmit
pnpm exec vitest run src/components/StudySpaceReservationPage.test.tsx src/lib/studySpaceReservationArtifacts.test.ts
cargo test --manifest-path src-tauri/Cargo.toml study_space --lib
cargo test --manifest-path src-tauri/Cargo.toml --test study_space_security_contract
pnpm l10n:validate
node scripts/study-space-secret-scan.mjs
```

For live QA, confirm the target slot with Hs-MCP first. Only run `dry_run=false` with `confirm=true` when the product owner explicitly asked for a real booking.
