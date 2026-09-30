import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH_SCHEMA_NAMES } from "./auth-schemas";
import { ENTITY_SCHEMAS } from "./index";

/**
 * Guards the entity registration list (checklist §4): every `*.entity.ts`
 * file must be exported from the barrel that `data-source.ts` hands to
 * TypeORM, otherwise the schema silently loses tables/constraints. Better
 * Auth's generated tables (`session`, `account`, `verification`) are not
 * files of their own, so they are listed explicitly instead.
 */

const entitiesDir = path.join(process.cwd(), "src/db/entities");

function schemaNameFromFile(file: string): string {
  return file.replace(/\.entity\.ts$/, "").replaceAll("-", "_");
}

describe("entity registration", () => {
  it("registers every entity file exactly once", () => {
    const fileNames = readdirSync(entitiesDir)
      .filter((file) => file.endsWith(".entity.ts"))
      .map(schemaNameFromFile)
      .sort();
    const schemaNames = ENTITY_SCHEMAS.map((schema) => schema.options.name)
      .filter((name): name is string => typeof name === "string")
      .sort();

    expect(fileNames.length).toBeGreaterThan(0);
    expect(AUTH_SCHEMA_NAMES.sort()).toEqual([
      "account",
      "session",
      "verification",
    ]);
    expect(schemaNames).toEqual([...fileNames, ...AUTH_SCHEMA_NAMES].sort());
  });
});
