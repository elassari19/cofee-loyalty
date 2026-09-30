import { betterAuth } from "better-auth";
import { typeormAdapter } from "better-auth-typeorm-adapter";

import { AppDataSource } from "@/db/data-source";
import { UserEntity } from "@/db/entities/user.entity";
import { getEnv } from "@/lib/env";

import { authOptions, requireEmailVerification } from "./options";

/**
 * Better Auth runtime instance (ADR 0001).
 *
 * - The same TypeORM `DataSource` as the rest of the application backs the
 *   adapter; `user` maps onto the hand-written platform identity so `role` and
 *   `status` stay ours, `session`/`account`/`verification` come from the
 *   generated schemas registered in the entity barrel.
 * - Built lazily: importing this module never reads the environment or opens a
 *   connection, so migration CLI runs and unit tests stay unaffected.
 * - Password hashing, session tokens and cookie handling are the library's;
 *   this module only wires configuration.
 */

function createAuth() {
  return betterAuth({
    ...authOptions,
    // Sign-in gated on a verified address only when the deployment asks for it.
    emailAndPassword: {
      ...authOptions.emailAndPassword,
      requireEmailVerification: requireEmailVerification(),
    },
    baseURL: getEnv().BETTER_AUTH_URL ?? getEnv().APP_URL,
    secret: getEnv().BETTER_AUTH_SECRET,
    database: typeormAdapter({
      dataSource: AppDataSource,
      entities: { user: UserEntity },
    }),
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;

let instance: AuthInstance | undefined;

export function getAuth(): AuthInstance {
  if (!instance) {
    instance = createAuth();
  }
  return instance;
}

/** Test helper — drops the memoized instance (env/adapter changes). */
export function resetAuthInstance(): void {
  instance = undefined;
}
