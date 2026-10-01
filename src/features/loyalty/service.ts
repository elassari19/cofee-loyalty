import type { EntityManager } from "typeorm";

import type { LoyaltyProgram } from "@/db/entities/loyalty-program.entity";
import { LoyaltyProgramEntity } from "@/db/entities/loyalty-program.entity";
import { RewardEntity } from "@/db/entities/reward.entity";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { parseInput } from "@/lib/schemas";

import {
  isConfigurationValid,
  isSameConfiguration,
  parseStoredConfiguration,
  programFormSchema,
  toConfiguration,
  type ProgramFormValues,
} from "./schemas";

/**
 * Loyalty program service (checklist §6 bullets 2–5).
 *
 * All writes take the caller's `EntityManager` so the action can compose a
 * multi-feature change in one transaction; every function touches only the
 * `loyalty_program` row (the reward table is *read* once, to keep a model
 * switch from orphaning rewards priced in the old unit).
 *
 * The two rules this module exists to enforce server-side:
 *
 *   1. **Exactly one model.** `toConfiguration()` stores only the selected
 *      model's keys, so `configuration` can never hold a mix; the type of an
 *      *active* program (or a program that already has rewards) is locked.
 *   2. **Versioned rules.** `rule_version` is bumped whenever the model or
 *      the rule set actually changes — compared structurally, because `jsonb`
 *      does not preserve key order — so ledger entries keep pointing at the
 *      rules they were computed with after an edit.
 */

/** The merchant's program: the active one, else the newest row. */
export async function findProgram(
  em: EntityManager,
  merchantId: string,
): Promise<LoyaltyProgram | null> {
  const active = await em.findOneBy(LoyaltyProgramEntity, {
    merchantId,
    status: "active",
  });
  if (active) return active;
  const rows = await em.find(LoyaltyProgramEntity, {
    where: { merchantId },
    order: { createdAt: "DESC" },
    take: 1,
  });
  return rows[0] ?? null;
}

/** Non-throwing readiness check used by onboarding progress. */
export function programIsConfigured(program: LoyaltyProgram | null): boolean {
  return Boolean(
    program && isConfigurationValid(program.type, program.configuration),
  );
}

export interface SaveProgramInput {
  merchantId: string;
  values: ProgramFormValues;
}

/**
 * Creates or updates the merchant's single program as a **draft** — saving
 * rules never activates them (activation is `activateLoyaltyProgram`).
 *
 * `rule_version` starts at 1 and only advances when the model or the rule
 * set changes, so a no-op save leaves history intact.
 */
export async function saveProgramForMerchant(
  em: EntityManager,
  input: SaveProgramInput,
): Promise<LoyaltyProgram> {
  // Re-validate here: the action already parsed the payload, but services are
  // public API — a direct call must not weaken the server-side check.
  const values = parseInput(programFormSchema, input.values);
  const configuration = toConfiguration(values);
  const existing = await findProgram(em, input.merchantId);

  if (existing) {
    const typeLocked =
      existing.status === "active" || (await hasRewards(em, input.merchantId));
    if (typeLocked && existing.type !== values.type) {
      throw new ConflictError(
        existing.status === "active"
          ? "The loyalty model can't change while the program is active — only the rules can be updated."
          : "Rewards are already priced in this program's unit, so the loyalty model can't change anymore.",
      );
    }

    const rulesChanged =
      existing.type !== values.type ||
      !isSameConfiguration(existing.configuration, configuration);
    existing.type = values.type;
    existing.name = values.name;
    existing.description = values.description.trim() || null;
    existing.unitName = values.unitName.trim() || null;
    existing.configuration = configuration;
    existing.ruleVersion = rulesChanged
      ? existing.ruleVersion + 1
      : existing.ruleVersion;
    return em.save(LoyaltyProgramEntity, existing);
  }

  const created = em.create(LoyaltyProgramEntity, {
    merchantId: input.merchantId,
    type: values.type,
    name: values.name,
    description: values.description.trim() || null,
    unitName: values.unitName.trim() || null,
    configuration: configuration as Record<string, unknown>,
    ruleVersion: 1,
    status: "draft",
  });
  return em.save(LoyaltyProgramEntity, created);
}

/**
 * Marks the merchant's program active after re-validating its stored rule
 * set — activation is the last line of defence against an unreadable
 * configuration reaching the earning engine (checklist §6 bullet 5).
 *
 * The merchant row itself is owned by the merchants feature; the composing
 * action runs both writes in one transaction.
 */
export async function activateLoyaltyProgram(
  em: EntityManager,
  merchantId: string,
): Promise<LoyaltyProgram> {
  const program = await findProgram(em, merchantId);
  if (!program) {
    throw new NotFoundError(
      "There is no loyalty program to activate yet — save the program rules first.",
    );
  }
  if (!isConfigurationValid(program.type, program.configuration)) {
    throw new ConflictError(
      "The program rules are incomplete. Review them and save again before activating.",
    );
  }
  // Re-parse for the record: same schema, now guaranteed readable downstream.
  parseStoredConfiguration(program.type, program.configuration);

  if (program.status !== "active") {
    program.status = "active";
    await em.save(LoyaltyProgramEntity, program);
  }
  return program;
}

async function hasRewards(
  em: EntityManager,
  merchantId: string,
): Promise<boolean> {
  const count = await em.count(RewardEntity, { where: { merchantId } });
  return count > 0;
}
