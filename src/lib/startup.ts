import { validateEnv } from "./env";

/**
 * Node.js-only startup work for `src/instrumentation.ts`.
 *
 * Kept in its own module so the instrumentation hook itself — which Next.js
 * also compiles for the Edge runtime — stays free of Node-only APIs, while the
 * real work still runs, and fails fast, on the Node.js runtime.
 */
export async function bootstrap(): Promise<void> {
  try {
    const env = validateEnv();

    const { logger } = await import("./logger");
    logger.info(
      { nodeEnv: env.NODE_ENV, logLevel: env.LOG_LEVEL },
      "environment validated, server starting",
    );
  } catch (error) {
    // Fail fast: print every configuration problem, then abort startup so the
    // process cannot serve requests with a broken configuration.
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
