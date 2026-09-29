/**
 * Server startup hook (checklist §2 — "environment validation at startup and
 * fail fast on missing or malformed required configuration").
 *
 * `register()` runs once per Next.js server instance before it accepts
 * requests. Invalid configuration aborts boot with a single, complete list of
 * problems instead of failing later inside a request.
 *
 * The Node.js-only work lives in `src/lib/startup.ts`; this file only decides
 * which runtime it is loaded in.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { bootstrap } = await import("./lib/startup");
  await bootstrap();
}
