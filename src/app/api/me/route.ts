import { withApiGuard } from "@/auth/guard";

/**
 * Who am I? (checklist §3 bullet 6.)
 *
 * The canonical proof that server routes are protected independently of the
 * UI: `GET /api/me` resolves the caller from the request alone and answers
 *   - 401 `unauthorized` when there is no session,
 *   - 200 with the safe context fields when there is one.
 * §5 extends the same handler with session-backed identity.
 */
export const GET = withApiGuard([], async (_request, _context, auth) => {
  return Response.json({
    userId: auth.userId,
    role: auth.role,
    displayName: auth.displayName,
    merchantId: auth.merchantId,
    preview: auth.preview,
  });
});
