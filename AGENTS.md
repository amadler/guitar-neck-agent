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
- **Interfaces over types** for domain models (see `DomainState`, `DomainCommand`, `DomainQuery`)
