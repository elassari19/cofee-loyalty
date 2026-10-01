import { describe, expect, it } from "vitest";

import { PASSWORD_MIN_LENGTH } from "@/lib/schemas";

import {
  changePasswordSchema,
  joinFormSchema,
  joinRequestSchema,
  profileFormSchema,
} from "./schemas";

const validJoin = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "",
  password: "correct horse battery",
};

describe("joinFormSchema", () => {
  it("accepts a complete registration", () => {
    expect(joinFormSchema.safeParse(validJoin).success).toBe(true);
  });

  it("trims the name and phone but not the password", () => {
    const parsed = joinFormSchema.parse({
      ...validJoin,
      name: "  Ada Lovelace  ",
      phone: "  +44 20 7946 0018  ",
      password: "  not-trimmed  ",
    });
    expect(parsed.name).toBe("Ada Lovelace");
    expect(parsed.phone).toBe("+44 20 7946 0018");
    expect(parsed.password).toBe("  not-trimmed  ");
  });

  it("rejects a missing name, bad email and short password", () => {
    expect(joinFormSchema.safeParse({ ...validJoin, name: "A" }).success).toBe(
      false,
    );
    expect(
      joinFormSchema.safeParse({ ...validJoin, email: "ada@" }).success,
    ).toBe(false);
    expect(
      joinFormSchema.safeParse({ ...validJoin, password: "short" }).success,
    ).toBe(false);
    expect(
      joinFormSchema.safeParse({
        ...validJoin,
        password: "a".repeat(PASSWORD_MIN_LENGTH - 1),
      }).success,
    ).toBe(false);
  });

  it("keeps a phone number under the storage limit", () => {
    expect(
      joinFormSchema.safeParse({ ...validJoin, phone: "1".repeat(21) }).success,
    ).toBe(false);
  });
});

describe("profileFormSchema", () => {
  it("accepts a name with an optional phone", () => {
    expect(
      profileFormSchema.safeParse({ name: "Ada Lovelace", phone: "" }).success,
    ).toBe(true);
    expect(
      profileFormSchema.safeParse({ name: "Ada", phone: "+44 20 7946 0018" })
        .success,
    ).toBe(true);
  });

  it("has no email field — the sign-in address is not editable here", () => {
    const parsed = profileFormSchema.safeParse({
      name: "Ada",
      phone: "",
      email: "changed@example.com",
    });
    // Zod objects strip unknown keys rather than rejecting the payload, so
    // the assertion is that email never comes back out of validation.
    expect(parsed.success).toBe(true);
    expect(parsed.success && "email" in parsed.data).toBe(false);
  });

  it("rejects an over-long name or phone", () => {
    expect(
      profileFormSchema.safeParse({ name: "A".repeat(201), phone: "" }).success,
    ).toBe(false);
    expect(
      profileFormSchema.safeParse({ name: "Ada", phone: "1".repeat(21) })
        .success,
    ).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("requires the current password and a strong-enough new one", () => {
    const blank = changePasswordSchema.safeParse({
      currentPassword: "",
      newPassword: "a".repeat(PASSWORD_MIN_LENGTH),
    });
    expect(blank.success).toBe(false);
    expect(blank.success === false && blank.error.issues[0]?.message).toBe(
      "Enter your current password.",
    );
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "hunter2",
        newPassword: "short",
      }).success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "hunter2",
        newPassword: "a".repeat(PASSWORD_MIN_LENGTH),
      }).success,
    ).toBe(true);
  });
});

describe("joinRequestSchema", () => {
  it("takes only the merchant slug the join URL carried", () => {
    expect(joinRequestSchema.parse({ slug: "  cafe-luna  " }).slug).toBe(
      "cafe-luna",
    );
    expect(joinRequestSchema.safeParse({ slug: "   " }).success).toBe(false);
    expect(joinRequestSchema.safeParse({ slug: "x".repeat(201) }).success).toBe(
      false,
    );
    expect(joinRequestSchema.safeParse({}).success).toBe(false);
  });
});
