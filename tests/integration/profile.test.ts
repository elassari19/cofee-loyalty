import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthContext } from "@/auth/context";
import { closeDb, getDb } from "@/db/connection";
import { CustomerProfileEntity } from "@/db/entities/customer-profile.entity";
import { UserEntity } from "@/db/entities/user.entity";
import { ForbiddenError } from "@/lib/errors";
import { updateCustomerProfile } from "@/features/customers/service";

import { isPostgresReachable } from "../helpers/services";

const postgresReachable = await isPostgresReachable();
if (!postgresReachable) {
  console.warn(
    "[test] PostgreSQL is not reachable — skipping the profile suite. Run `pnpm services:up` to start it.",
  );
}

const MEMBER_ID = "test_profile_member";
const NEWCOMER_ID = "test_profile_newcomer";

function auth(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: MEMBER_ID,
    role: "CUSTOMER",
    displayName: "Ada Lovelace",
    merchantId: null,
    preview: false,
    ...overrides,
  };
}

describe.skipIf(!postgresReachable)(
  "Customer profile editing (checklist §7 bullet 6)",
  () => {
    let db: DataSource;

    async function purge(): Promise<void> {
      const users = [MEMBER_ID, NEWCOMER_ID];
      await db.query(
        `DELETE FROM customer_profile WHERE user_id = ANY($1::text[])`,
        [users],
      );
      await db.query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [users]);
    }

    beforeAll(async () => {
      db = await getDb();
      await purge();
      for (const id of [MEMBER_ID, NEWCOMER_ID]) {
        await db.manager.insert(UserEntity, {
          id,
          name: id === MEMBER_ID ? "Ada Lovelace" : "Grace Hopper",
          email: `${id}@profile.test`,
          emailVerified: true,
          image: null,
          role: "CUSTOMER",
          status: "active",
        });
      }
      await db.manager.insert(CustomerProfileEntity, {
        userId: MEMBER_ID,
        name: "Ada Lovelace",
        phone: null,
      });
    });

    afterAll(async () => {
      if (db) await purge();
      await closeDb();
    });

    it("saves the contact details and keeps the account name in sync", async () => {
      const result = await updateCustomerProfile({
        auth: auth(),
        values: { name: "Ada L. Byron", phone: "+44 20 7946 0018" },
      });

      expect(result.created).toBe(false);
      expect(result.changedFields).toEqual(["name", "phone"]);
      expect(result.profile.name).toBe("Ada L. Byron");
      expect(result.profile.phone).toBe("+44 20 7946 0018");

      const stored = await db.manager.findOneBy(CustomerProfileEntity, {
        userId: MEMBER_ID,
      });
      expect(stored?.name).toBe("Ada L. Byron");
      expect(stored?.phone).toBe("+44 20 7946 0018");

      // The shell header reads `user`.name — it must not lag behind the
      // profile the member just edited.
      const user = await db.manager.findOneBy(UserEntity, { id: MEMBER_ID });
      expect(user?.name).toBe("Ada L. Byron");
    });

    it("clears a phone number when the field is emptied", async () => {
      const result = await updateCustomerProfile({
        auth: auth(),
        values: { name: "Ada L. Byron", phone: "" },
      });

      expect(result.changedFields).toEqual(["phone"]);
      expect(result.profile.phone).toBeNull();

      const stored = await db.manager.findOneBy(CustomerProfileEntity, {
        userId: MEMBER_ID,
      });
      expect(stored?.phone).toBeNull();
    });

    it("reports no work when nothing changed", async () => {
      const before = await db.manager.findOneBy(CustomerProfileEntity, {
        userId: MEMBER_ID,
      });

      const result = await updateCustomerProfile({
        auth: auth(),
        values: { name: "Ada L. Byron", phone: "" },
      });

      expect(result.changedFields).toEqual([]);
      expect(result.profile.updatedAt.getTime()).toBe(
        before!.updatedAt.getTime(),
      );
    });

    it("never rewrites the sign-in email from a profile save", async () => {
      // The schema has no email field, so anything sent alongside it is
      // stripped before the write — email stays an auth-flow concern.
      await updateCustomerProfile({
        auth: auth(),
        values: {
          name: "Ada L. Byron",
          phone: "",
          email: "attacker@elsewhere.test",
        } as { name: string; phone: string },
      });

      const user = await db.manager.findOneBy(UserEntity, { id: MEMBER_ID });
      expect(user?.email).toBe(`${MEMBER_ID}@profile.test`);
    });

    it("creates the profile for a member who has never joined a program", async () => {
      const result = await updateCustomerProfile({
        auth: auth({ userId: NEWCOMER_ID, displayName: "Grace Hopper" }),
        values: { name: "Grace Hopper", phone: "" },
      });

      expect(result.created).toBe(true);
      expect(result.changedFields).toEqual(["name", "phone"]);

      const stored = await db.manager.findOneBy(CustomerProfileEntity, {
        userId: NEWCOMER_ID,
      });
      expect(stored?.name).toBe("Grace Hopper");

      const user = await db.manager.findOneBy(UserEntity, {
        id: NEWCOMER_ID,
      });
      expect(user?.name).toBe("Grace Hopper");
    });

    it("refuses profile writes from a preview session", async () => {
      await expect(
        updateCustomerProfile({
          auth: auth({ preview: true }),
          values: { name: "Preview Member", phone: "" },
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  },
);
