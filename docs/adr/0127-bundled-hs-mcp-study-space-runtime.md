---
title: "Bundled Hs-MCP study-space runtime"
date: 2026-05-24
status: active
supersedes: 0126
---

# ADR-0127: Bundled Hs-MCP study-space runtime

## Context

ADR-0126 introduced a Python bridge that delegates Hansung study-space reservations to the verified Hs-MCP package. The bridge script was included as a Tauri resource, but the `hs_mcp` package and its Python dependencies still had to be installed in the user's Python environment. That made packaged app behavior differ from the product expectation that the reservation MCP logic ships with HS-Hub.

## Decision

HS-Hub now generates a bundled Python package directory at `src-tauri/resources/study-space-python/` during Tauri build via `pnpm bundle-study-space-mcp`. The build script installs the pinned Hs-MCP package from `https://github.com/kjhh2605/Hs-MCP.git` at commit `db74f2ba5230a4ca7a1b892bbacf6632b67e19df` into that resource directory and prunes bytecode/cache noise.

The study-space bridge adds its sibling `study-space-python/` directory to `sys.path`, and the Rust command boundary also prepends the same directory to `PYTHONPATH` when spawning the bridge. Resource resolution covers development paths, executable-adjacent resources, and macOS `.app/Contents/Resources` layout.

## Consequences

- Packaged HS-Hub builds include the Hs-MCP reservation logic instead of requiring users to install the `hs-mcp` package manually.
- The app still needs an executable Python 3.11+ runtime available as `python3` or through `HS_HUB_STUDY_SPACE_PYTHON`; fully embedding Python remains future work.
- The generated runtime is gitignored, matching the existing generated MCP server bundle pattern.
- Hs-MCP upgrades must intentionally change the pinned package spec and re-run reservation verification.

## Verification

- `pnpm bundle-study-space-mcp`
- `printf '{"op":"status"}' | python3 src-tauri/resources/study-space-hs-mcp-bridge.py`
- `cargo test --manifest-path src-tauri/Cargo.toml study_space --lib`
