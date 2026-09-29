import { describe, expect, it } from "vitest";

import type { AuthContext } from "./context";
import { evaluateActionAccess, runGuarded } from "./action-guard";
import { matchesAudience } from "./guard";

function context(role: AuthContext["role"]): AuthContext {
  return {
    userId: `u-${role}`,
    role,
    displayName: "Test user",
    merchantId: null,
    preview: true,
  };
}

describe("evaluateActionAccess", () => {
  it("treats a missing session as anonymous", () => {
    expect(evaluateActionAccess(null, "loyalty.write")).toBe("anonymous");
  });

  it("admits roles that hold the capability", () => {
    expect(
      evaluateActionAccess(context("MERCHANT_OWNER"), "loyalty.write"),
    ).toBe("allowed");
    expect(
      evaluateActionAccess(context("MERCHANT_MANAGER"), "loyalty.write"),
    ).toBe("allowed");
  });

  it("forbids roles that don't, even when they are authenticated", () => {
    expect(
      evaluateActionAccess(context("MERCHANT_STAFF"), "loyalty.write"),
    ).toBe("forbidden");
    expect(evaluateActionAccess(context("CUSTOMER"), "merchant.write")).toBe(
      "forbidden",
    );
    expect(
      evaluateActionAccess(context("MERCHANT_OWNER"), "platform.manage"),
    ).toBe("forbidden");
  });
});

describe("runGuarded", () => {
  it("returns an unauthorized failure without running the work", async () => {
    let ran = false;
    const result = await runGuarded(null, "transactions.create", () => {
      ran = true;
      return "done";
    });

    expect(result).toEqual({
      ok: false,
      code: "unauthorized",
      message: "Your session has ended. Sign in and try again.",
    });
    expect(ran).toBe(false);
  });

  it("returns a forbidden failure without running the work", async () => {
    let ran = false;
    const result = await runGuarded(
      context("CUSTOMER"),
      "transactions.create",
      () => {
        ran = true;
        return "done";
      },
    );

    expect(result).toEqual({
      ok: false,
      code: "forbidden",
      message: "Your role isn't allowed to make this change.",
    });
    expect(ran).toBe(false);
  });

  it("runs allowed work and returns its data", async () => {
    const result = await runGuarded(
      context("MERCHANT_STAFF"),
      "rewards.redeem",
      () => ({
        balance: 740,
      }),
    );

    expect(result).toEqual({ ok: true, data: { balance: 740 } });
  });

  it("passes the caller's message through on failure (clear result)", async () => {
    const result = await runGuarded(
      context("MERCHANT_STAFF"),
      "rewards.redeem",
      () => {
        throw new Error(
          "Maya Chen has 40 points — 500 needed. Nothing was redeemed.",
        );
      },
    );

    expect(result).toEqual({
      ok: false,
      code: "error",
      message: "Maya Chen has 40 points — 500 needed. Nothing was redeemed.",
    });
  });

  it("masks unexpected failures without a message", async () => {
    const result = await runGuarded(
      context("MERCHANT_OWNER"),
      "loyalty.write",
      () => {
        throw new Error();
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("error");
      expect(result.message).toBe("Something went wrong. Nothing was changed.");
    }
  });
});

describe("matchesAudience", () => {
  it("maps each role to its route-group audience", () => {
    expect(matchesAudience("SUPER_ADMIN", "platform")).toBe(true);
    expect(matchesAudience("MERCHANT_OWNER", "merchant")).toBe(true);
    expect(matchesAudience("MERCHANT_MANAGER", "merchant")).toBe(true);
    expect(matchesAudience("MERCHANT_STAFF", "staff")).toBe(true);
    expect(matchesAudience("CUSTOMER", "customer")).toBe(true);
  });

  it("rejects roles from a different group", () => {
    expect(matchesAudience("CUSTOMER", "merchant")).toBe(false);
    expect(matchesAudience("MERCHANT_STAFF", "merchant")).toBe(false);
    expect(matchesAudience("SUPER_ADMIN", ["merchant", "staff"])).toBe(false);
    expect(matchesAudience("MERCHANT_OWNER", ["platform", "staff"])).toBe(
      false,
    );
  });

  it("accepts any of several audiences", () => {
    expect(matchesAudience("MERCHANT_STAFF", ["platform", "staff"])).toBe(true);
    expect(matchesAudience("MERCHANT_OWNER", ["merchant", "customer"])).toBe(
      true,
    );
  });
});
