# ADR 0001 — Authentication: Better Auth with the TypeORM adapter

- **Status:** Accepted
- **Date:** 2026-09-29
- **Checklist:** §1 "Select and document a maintained authentication solution that
  works with the chosen TypeORM/PostgreSQL design before implementing login. Do not
  invent password or session cryptography."

## Context

The platform needs email/password registration, login, logout, password reset, email
verification and session expiration for five roles (`SUPER_ADMIN`, merchant
owner/manager/staff, `CUSTOMER`), on top of PostgreSQL + TypeORM. Session and password
cryptography must not be hand-rolled, and the solution must be actively maintained.

Candidates reviewed:

| Option                                      | Verdict                                                                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Better Auth + `better-auth-typeorm-adapter` | Maintained, has a maintained TypeORM adapter validated by the official adapter test suite, batteries-included (reset, verification, sessions, rate-limit hooks). |
| Auth.js (NextAuth) v5                       | No official TypeORM adapter (Prisma/Drizzle only) → would force an ORM change or a bespoke adapter.                                                              |
| Hand-rolled auth (argon2 + own sessions)    | Rejected: explicitly forbidden by the checklist ("do not invent password or session cryptography").                                                              |

## Decision

Use **Better Auth** (`better-auth`) with the maintained **`better-auth-typeorm-adapter`**,
backed by the same TypeORM `DataSource`/PostgreSQL as the rest of the application.

- Auth tables are generated as TypeORM `EntitySchema`s from the Better Auth options
  (consistent with ADR 0002) and ship through the normal migration workflow.
- Password hashing, session tokens, cookie handling, reset and verification flows come
  from the library; application code only adds roles, permissions and tenant context.
- The auth HTTP handler is mounted under `/api/auth/[...all]` in a Node.js runtime route.

## Consequences

- Login/reset/verification flows must be configured and tested through Better Auth's
  primitives instead of custom controllers.
- Role/permission and tenant models are ours to add on top of the auth `user` entity
  (checklist §5); they must not be baked into password/session logic.
- Upgrades are tracked by pinning `better-auth` and its adapter in `pnpm-lock.yaml`.
