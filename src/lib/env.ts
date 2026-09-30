import { z } from "zod";

/**
 * Environment validation (checklist §2 — "Add environment validation at startup
 * and fail fast on missing or malformed required configuration").
 *
 * Every required variable is declared here once, with a type, a constraint and a
 * human readable message. `validateEnv()` is called from `src/instrumentation.ts`
 * when the Next.js server boots and from every CLI script that touches the
 * database, so a broken configuration fails immediately instead of surfacing as a
 * connection error halfway through a request.
 *
 * This module is server-side only: never import it from a component that is
 * rendered in the browser.
 */

const LOG_LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  // "silent" is used by the test suite to keep output readable.
  "silent",
] as const;

const PLACEHOLDER_PATTERN = /^replace|changeme|your[-_]/i;

function requiredString(message: string) {
  return z.string().trim().min(1, message);
}

function url(message: string) {
  return z.url({ error: message });
}

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  /** Canonical base URL of the app, no trailing slash. */
  APP_URL: url("APP_URL must be a valid URL, e.g. http://localhost:3000"),
  /** PostgreSQL connection string — the only system of record. */
  DATABASE_URL: requiredString(
    "DATABASE_URL is required, e.g. postgresql://postgres:postgres@localhost:5432/loyalty_dev",
  )
    .refine((value) => URL.canParse(value), {
      error: "DATABASE_URL must be a valid URL",
    })
    .refine((value) => /^postgres(ql)?:\/\//.test(value), {
      error: "DATABASE_URL must be a postgresql:// connection string",
    }),
  /** Redis — cache, rate limiting and async jobs only, never the system of record. */
  REDIS_URL: requiredString(
    "REDIS_URL is required, e.g. redis://localhost:6379",
  )
    .refine((value) => URL.canParse(value), {
      error: "REDIS_URL must be a valid URL",
    })
    .refine((value) => /^rediss?:\/\//.test(value), {
      error: "REDIS_URL must be a redis:// or rediss:// connection string",
    }),
  /** Better Auth signing secret (ADR 0001). Generate: pnpm dlx auth@latest secret */
  BETTER_AUTH_SECRET: requiredString(
    "BETTER_AUTH_SECRET is required. Generate one with `pnpm dlx auth@latest secret`.",
  )
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters")
    .refine((value) => !PLACEHOLDER_PATTERN.test(value), {
      error:
        "BETTER_AUTH_SECRET still contains the placeholder from .env.example. Generate a real secret with `pnpm dlx auth@latest secret`.",
    }),
  BETTER_AUTH_URL: url(
    "BETTER_AUTH_URL must be a valid URL, e.g. http://localhost:3000",
  ).optional(),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  RATE_LIMIT_LOGIN_MAX: z.coerce
    .number({ error: "RATE_LIMIT_LOGIN_MAX must be a number" })
    .int("RATE_LIMIT_LOGIN_MAX must be an integer")
    .positive("RATE_LIMIT_LOGIN_MAX must be greater than 0")
    .default(5),
  RATE_LIMIT_LOGIN_WINDOW_SECONDS: z.coerce
    .number({ error: "RATE_LIMIT_LOGIN_WINDOW_SECONDS must be a number" })
    .int("RATE_LIMIT_LOGIN_WINDOW_SECONDS must be an integer")
    .positive("RATE_LIMIT_LOGIN_WINDOW_SECONDS must be greater than 0")
    .default(60),
  RATE_LIMIT_REGISTER_MAX: z.coerce
    .number({ error: "RATE_LIMIT_REGISTER_MAX must be a number" })
    .int("RATE_LIMIT_REGISTER_MAX must be an integer")
    .positive("RATE_LIMIT_REGISTER_MAX must be greater than 0")
    .default(3),
  RATE_LIMIT_REGISTER_WINDOW_SECONDS: z.coerce
    .number({ error: "RATE_LIMIT_REGISTER_WINDOW_SECONDS must be a number" })
    .int("RATE_LIMIT_REGISTER_WINDOW_SECONDS must be an integer")
    .positive("RATE_LIMIT_REGISTER_WINDOW_SECONDS must be greater than 0")
    .default(3600),
  RATE_LIMIT_PASSWORD_RESET_MAX: z.coerce
    .number({ error: "RATE_LIMIT_PASSWORD_RESET_MAX must be a number" })
    .int("RATE_LIMIT_PASSWORD_RESET_MAX must be an integer")
    .positive("RATE_LIMIT_PASSWORD_RESET_MAX must be greater than 0")
    .default(3),
  RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS: z.coerce
    .number({
      error: "RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS must be a number",
    })
    .int("RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS must be an integer")
    .positive("RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS must be greater than 0")
    .default(3600),
  /** QR payload and verification/reset token resolution attempts. */
  RATE_LIMIT_TOKEN_RESOLVE_MAX: z.coerce
    .number({ error: "RATE_LIMIT_TOKEN_RESOLVE_MAX must be a number" })
    .int("RATE_LIMIT_TOKEN_RESOLVE_MAX must be an integer")
    .positive("RATE_LIMIT_TOKEN_RESOLVE_MAX must be greater than 0")
    .default(30),
  RATE_LIMIT_TOKEN_RESOLVE_WINDOW_SECONDS: z.coerce
    .number({
      error: "RATE_LIMIT_TOKEN_RESOLVE_WINDOW_SECONDS must be a number",
    })
    .int("RATE_LIMIT_TOKEN_RESOLVE_WINDOW_SECONDS must be an integer")
    .positive("RATE_LIMIT_TOKEN_RESOLVE_WINDOW_SECONDS must be greater than 0")
    .default(60),
  /** Redemption-code verification attempts (guessing resistance, §9). */
  RATE_LIMIT_REDEMPTION_MAX: z.coerce
    .number({ error: "RATE_LIMIT_REDEMPTION_MAX must be a number" })
    .int("RATE_LIMIT_REDEMPTION_MAX must be an integer")
    .positive("RATE_LIMIT_REDEMPTION_MAX must be greater than 0")
    .default(10),
  RATE_LIMIT_REDEMPTION_WINDOW_SECONDS: z.coerce
    .number({ error: "RATE_LIMIT_REDEMPTION_WINDOW_SECONDS must be a number" })
    .int("RATE_LIMIT_REDEMPTION_WINDOW_SECONDS must be an integer")
    .positive("RATE_LIMIT_REDEMPTION_WINDOW_SECONDS must be greater than 0")
    .default(60),
  /**
   * Block sign-in until the address is verified. Off by default so local
   * development works without a mail provider; turn on in production once a
   * provider is configured (checklist §5, PRD §7).
   */
  AUTH_REQUIRE_EMAIL_VERIFICATION: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type Env = z.infer<typeof envSchema>;

/** Any `process.env`-like source of string configuration. */
export type EnvSource = Record<string, string | undefined>;

export class EnvValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(
      `Invalid environment configuration:\n${issues
        .map((issue) => `  - ${issue}`)
        .join("\n")}\nCopy .env.example to .env, fill it in, then restart.`,
    );
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

/**
 * Validate a configuration source (defaults to `process.env`) and return the
 * typed values. Throws `EnvValidationError` listing every problem at once so a
 * new developer fixes them in a single pass.
 */
export function validateEnv(source: EnvSource = process.env): Env {
  const candidate = {
    NODE_ENV: source.NODE_ENV,
    APP_URL: source.APP_URL,
    DATABASE_URL: source.DATABASE_URL,
    REDIS_URL: source.REDIS_URL,
    BETTER_AUTH_SECRET: source.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: source.BETTER_AUTH_URL,
    LOG_LEVEL: source.LOG_LEVEL,
    RATE_LIMIT_LOGIN_MAX: source.RATE_LIMIT_LOGIN_MAX,
    RATE_LIMIT_LOGIN_WINDOW_SECONDS: source.RATE_LIMIT_LOGIN_WINDOW_SECONDS,
    RATE_LIMIT_REGISTER_MAX: source.RATE_LIMIT_REGISTER_MAX,
    RATE_LIMIT_REGISTER_WINDOW_SECONDS:
      source.RATE_LIMIT_REGISTER_WINDOW_SECONDS,
    RATE_LIMIT_PASSWORD_RESET_MAX: source.RATE_LIMIT_PASSWORD_RESET_MAX,
    RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS:
      source.RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS,
    RATE_LIMIT_TOKEN_RESOLVE_MAX: source.RATE_LIMIT_TOKEN_RESOLVE_MAX,
    RATE_LIMIT_TOKEN_RESOLVE_WINDOW_SECONDS:
      source.RATE_LIMIT_TOKEN_RESOLVE_WINDOW_SECONDS,
    RATE_LIMIT_REDEMPTION_MAX: source.RATE_LIMIT_REDEMPTION_MAX,
    RATE_LIMIT_REDEMPTION_WINDOW_SECONDS:
      source.RATE_LIMIT_REDEMPTION_WINDOW_SECONDS,
    AUTH_REQUIRE_EMAIL_VERIFICATION: source.AUTH_REQUIRE_EMAIL_VERIFICATION,
  };

  const result = envSchema.safeParse(candidate);
  if (result.success) return result.data;

  const issues = result.error.issues.map((issue) => {
    const key = issue.path.join(".") || "(root)";
    return `${key}: ${issue.message}`;
  });
  throw new EnvValidationError(issues);
}

let cached: Env | undefined;

/** Memoized `validateEnv(process.env)`. */
export function getEnv(): Env {
  cached ??= validateEnv();
  return cached;
}

/** Test helper — drops the memoized configuration. */
export function resetEnvCache(): void {
  cached = undefined;
}
