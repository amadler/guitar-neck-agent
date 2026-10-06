# AGENTS.md

This file provides guidance to agents when working with code in this repository.


## Skills

This repository includes local skills in [`.roo/skills/`](.roo/skills) that agents should follow when applicable:

- [**`working-with-GIT-repositories`**](.roo/skills/working-with-GIT-repositories/SKILL.md) — Git workflow: status checks, staged review, commit approval, no destructive operations without consent.
- [**`fix-broken-tests`**](.roo/skills/fix-broken-tests/SKILL.md) — Diagnose and fix failing tests without hiding bugs or adjusting tests to match buggy implementations.
- [**`updating-backlog`**](.roo/skills/updating-backlog/SKILL.md) — Create, update, complete, and archive backlog items in `BACKLOG.md`; move completed work to `CHANGELOG.md`.
- 

## Code Style

- **Single quotes** for TypeScript (`.editorconfig`), double quotes for HTML templates
- **2-space indentation**, UTF-8, final newline
- **Strict TypeScript** (`strict: true`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`)

## Environment

- **Platform:** Windows 10 (win32)
- **Shell:** `cmd.exe` (default). Use `cmd` for all shell commands — do NOT use PowerShell or Python.
- **Package manager:** npm (comes with Node.js)
- **Node.js:** 20+ (required by project)
- **Docker:** Available via `docker compose` (for PostgreSQL)
- **No sandbox** — this is a local Windows machine, not a sandbox or container.
