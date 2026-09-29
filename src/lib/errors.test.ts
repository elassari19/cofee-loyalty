import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
  isAppError,
  toAppError,
} from "./errors";

describe("toAppError", () => {
  it("passes AppErrors through unchanged", () => {
    const error = new NotFoundError("Reward not found.");
    expect(toAppError(error)).toBe(error);
    expect(isAppError(error)).toBe(true);
  });

  it("converts ZodError into a field-level ValidationError", () => {
    const schema = z.object({ amount: z.number().positive() });
    const result = schema.safeParse({ amount: -5 });
    expect(result.success).toBe(false);
    if (result.success) return;

    const error = toAppError(result.error);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.status).toBe(400);
    expect(error.code).toBe("validation_error");
    expect(error.issues?.[0]?.path).toBe("amount");
    expect(error.issues?.[0]?.message).toBeTruthy();
  });

  it("hides the detail of unexpected errors", () => {
    const cause = new Error(
      'syntax error at or near "loyalty_balances" — select * from loyalty_balances',
    );
    const error = toAppError(cause);
    expect(error).toBeInstanceOf(InternalError);
    expect(error.status).toBe(500);
    expect(error.expose).toBe(false);
    expect(error.message).toBe("An unexpected error occurred.");
    expect(error.message).not.toContain("loyalty_balances");
    expect(error.cause).toBe(cause);
  });

  it("keeps safe client-facing messages for 4xx errors", () => {
    const error = new ForbiddenError();
    expect(error.expose).toBe(true);
    expect(error.message).toBe("You do not have permission to do this.");
  });
});
