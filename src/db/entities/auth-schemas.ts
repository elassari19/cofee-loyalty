import { EntitySchema } from "typeorm";
import { generateEntitySchemas } from "better-auth-typeorm-adapter";

import { authOptions } from "@/auth/options";
import { UserEntity } from "./user.entity";

/**
 * TypeORM `EntitySchema`s for Better Auth's own tables — `session`, `account`
 * and `verification` (ADR 0001: "Auth tables are generated as TypeORM
 * EntitySchemas from the Better Auth options ... and ship through the normal
 * migration workflow").
 *
 * - The generated `user` schema is deliberately dropped: `user.entity.ts` is
 *   the hand-written platform identity that carries `role` and `status` on top
 *   of Better Auth's fields, and it is registered through the same barrel.
 *   The adapter is told about that mapping explicitly in `src/auth/config.ts`.
 * - The generator only knows Better Auth's model, so everything that is a
 *   *schema convention* of this repository is applied on top of it:
 *     - snake_case column names, `timestamptz` instants and
 *       `CURRENT_TIMESTAMP` defaults, exactly like `user.entity.ts`;
 *     - named unique/index/foreign-key constraints (no auto-generated hashes);
 *     - `session`/`account` rows hang off the platform identity with
 *       `ON DELETE CASCADE` — a deleted account leaves no session behind.
 *
 * All of this lives in the entity rather than in a migration by hand, so a
 * future `pnpm db:migrate:generate` reports "no changes" instead of trying to
 * undo it. `index.test.ts` fails if these stop being registered.
 */

const GENERATED = generateEntitySchemas(authOptions).filter(
  (schema) => schema.options.name !== "user",
);

/** `emailVerified` → `email_verified`, `accessTokenExpiresAt` → `access_token_expires_at`. */
function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function isColumn(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && "type" in value;
}

function withRepositoryConventions(schema: EntitySchema): EntitySchema {
  const table =
    typeof schema.options.name === "string" ? schema.options.name : "";
  const sourceColumns = schema.options.columns ?? {};

  const uniqueColumns = Object.keys(sourceColumns).filter(
    (key) =>
      isColumn(sourceColumns[key]) && sourceColumns[key]?.unique === true,
  );

  const columns = Object.fromEntries(
    Object.keys(sourceColumns).map((key) => {
      const column = sourceColumns[key];
      if (!isColumn(column)) return [key, column];

      const next: Record<string, unknown> = {
        ...column,
        name: toSnakeCase(key),
      };
      // The generator hands TypeORM the `Date` constructor, which it renders as
      // `timestamp`; every table here is `timestamptz`.
      if (next.type === Date) next.type = "timestamptz";
      if (key === "createdAt" || key === "updatedAt") {
        delete next.default;
        next.default = () => "CURRENT_TIMESTAMP";
      }
      // Unique constraints are declared below with their own names.
      delete next.unique;
      return [key, next];
    }),
  );

  // Index and unique *columns* are property names: TypeORM resolves them to
  // the snake_case column itself. Only the constraint names are ours to style.
  const indices = (schema.options.indices ?? []).map((index) => {
    const propertyColumns = Array.isArray(index.columns)
      ? index.columns
      : undefined;
    if (!propertyColumns) return index;
    return {
      ...index,
      name: `${table}_${propertyColumns.map(toSnakeCase).join("_")}_idx`,
      columns: propertyColumns,
    };
  });

  // `verification` is keyed by identifier (an email address), not by user id —
  // it cannot reference `user` while an address is still unverified.
  const needsUserRelation = table === "session" || table === "account";
  const coversUserId = (index: { columns?: unknown }) =>
    Array.isArray(index.columns) && index.columns.includes("userId");
  const indicesWithLookup =
    needsUserRelation && !indices.some(coversUserId)
      ? [...indices, { name: `${table}_user_id_idx`, columns: ["userId"] }]
      : indices;

  return new EntitySchema({
    ...schema.options,
    columns,
    indices: indicesWithLookup,
    uniques: uniqueColumns.map((key) => ({
      name: `uq_${table}_${toSnakeCase(key)}`,
      columns: [key],
    })),
    ...(needsUserRelation
      ? {
          foreignKeys: [
            {
              name: `fk_${table}_user`,
              target: UserEntity,
              columnNames: ["user_id"],
              referencedColumnNames: ["id"],
              onDelete: "CASCADE",
            },
          ],
        }
      : {}),
  });
}

export const AUTH_ENTITY_SCHEMAS = GENERATED.map(withRepositoryConventions);

/** Schema names contributed by this file — asserted by `index.test.ts`. */
export const AUTH_SCHEMA_NAMES: string[] = AUTH_ENTITY_SCHEMAS.map(
  (schema) => schema.options.name,
).filter((name): name is string => typeof name === "string");
