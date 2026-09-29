import { describe, expect, it } from "vitest";
import { EnvValidationError, validateEnv, type EnvSource } from "./env";

const validSource: EnvSource = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/loyalty_dev",
  REDIS_URL: "redis://localhost:6379",
  BETTER_AUTH_SECRET: "a".repeat(48),
};

function captureEnvError(source: EnvSource): EnvValidationError {
  try {
    validateEnv(source);
  } catch (error) {
    if (error instanceof EnvValidationError) return error;
    throw error;
  }
  throw new Error("expected validateEnv to throw EnvValidationError");
}

describe("validateEnv", () => {
  it("accepts a complete configuration and applies defaults", () => {
    const env = validateEnv(validSource);
    expect(env.NODE_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.RATE_LIMIT_LOGIN_MAX).toBe(5);
    expect(env.RATE_LIMIT_LOGIN_WINDOW_SECONDS).toBe(60);
  });

  it("coerces numeric values that arrive as strings", () => {
    const env = validateEnv({
      ...validSource,
      RATE_LIMIT_LOGIN_MAX: "10",
      RATE_LIMIT_LOGIN_WINDOW_SECONDS: "300",
    });
    expect(env.RATE_LIMIT_LOGIN_MAX).toBe(10);
    expect(env.RATE_LIMIT_LOGIN_WINDOW_SECONDS).toBe(300);
  });

  it("reports every missing variable at once", () => {
    const error = captureEnvError({});
    expect(error.issues.join("\n")).toContain("APP_URL");
    expect(error.issues.join("\n")).toContain("DATABASE_URL");
    expect(error.issues.join("\n")).toContain("REDIS_URL");
    expect(error.issues.join("\n")).toContain("BETTER_AUTH_SECRET");
    expect(error.message).toContain("Copy .env.example to .env");
  });

  it("rejects the placeholder auth secret from .env.example", () => {
    const error = captureEnvError({
      ...validSource,
      BETTER_AUTH_SECRET: "replace-with-generated-secret",
    });
    expect(error.issues.join("\n")).toContain("placeholder");
  });

  it("rejects a short auth secret", () => {
    const error = captureEnvError({
      ...validSource,
      BETTER_AUTH_SECRET: "too-short",
    });
    expect(error.issues.join("\n")).toContain("at least 32 characters");
  });

  it("rejects non-postgres and non-redis connection strings", () => {
    expect(
      captureEnvError({
        ...validSource,
        DATABASE_URL: "mysql://user:pass@localhost/db",
      }).issues.join("\n"),
    ).toContain("postgresql://");

    expect(
      captureEnvError({
        ...validSource,
        REDIS_URL: "http://localhost:6379",
      }).issues.join("\n"),
    ).toContain("redis://");
  });

  it("rejects malformed values", () => {
    const error = captureEnvError({
      ...validSource,
      APP_URL: "not-a-url",
      LOG_LEVEL: "verbose",
    });
    expect(error.issues.join("\n")).toContain("APP_URL");
    expect(error.issues.join("\n")).toContain("LOG_LEVEL");
  });
});
