# ADR 0002 — TypeORM entities use `EntitySchema`, not decorators

- **Status:** Accepted
- **Date:** 2026-09-29
- **Checklist:** §1 (TypeORM for persistence and migrations, single documented stack),
  §4 (entities, constraints, migrations).

## Context

The same entity modules must load correctly in three different toolchains:

1. **Next.js 16 (SWC)** — reads `experimentalDecorators` _and_ `emitDecoratorMetadata`
   from `tsconfig.json` (verified in `node_modules/next/dist/docs`).
2. **CLI scripts via tsx (esbuild)** — supports legacy decorators but **cannot emit
   decorator metadata** (`emitDecoratorMetadata` is a TypeScript-compiler feature).
3. **Vitest (esbuild)** — same limitation as tsx.

Decorator-based TypeORM entities silently lose `design:type` reflection in (2) and (3),
producing runtime errors such as undefined column/relation types only when the CLI or
tests run — not when the app renders. `better-auth-typeorm-adapter` already generates
`EntitySchema`s for its own tables.

## Decision

Define all TypeORM entities with `EntitySchema<Interface>` and explicit column/relation
definitions. `synchronize` stays `false`; schema changes ship as reviewed migrations.

## Consequences

- Entities load identically under Next.js, tsx and Vitest with no compiler flags,
  no `reflect-metadata`-dependent reflection, and no per-toolchain configuration.
- Column types and relation targets are always explicit (verbose but compiler-checked
  via the `EntitySchema<Entity>` generic).
- New contributors must follow the `EntitySchema` pattern; decorator entities are not
  allowed because they would break the migration and test CLIs.
