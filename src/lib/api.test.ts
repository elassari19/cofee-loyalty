import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { withApiHandler } from "./api";
import { NotFoundError } from "./errors";
import { REQUEST_ID_HEADER } from "./request-context";

function request(path = "/api/things"): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`);
}

describe("withApiHandler", () => {
  it("echoes a correlation id on successful responses", async () => {
    const handler = withApiHandler(async () => Response.json({ ok: true }));
    const response = await handler(request(), undefined);

    expect(response.status).toBe(200);
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(
      /^[A-Za-z0-9._-]{1,64}$/,
    );
    expect(await response.json()).toEqual({ ok: true });
  });

  it("reuses a valid incoming correlation id", async () => {
    const handler = withApiHandler(async () => Response.json({ ok: true }));
    const incoming = new NextRequest("http://localhost:3000/api/things", {
      headers: { [REQUEST_ID_HEADER]: "upstream-id-1" },
    });

    const response = await handler(incoming, undefined);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe("upstream-id-1");
  });

  it("turns AppError subclasses into the standard envelope", async () => {
    const handler = withApiHandler(async () => {
      throw new NotFoundError("Reward not found.");
    });
    const response = await handler(request(), undefined);

    expect(response.status).toBe(404);
    const body = (await response.json()) as {
      error: { code: string; message: string; requestId: string };
    };
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toBe("Reward not found.");
    expect(body.error.requestId).toBe(response.headers.get(REQUEST_ID_HEADER));
  });

  it("returns field issues for validation errors", async () => {
    const handler = withApiHandler(async () => {
      const parsed = z.object({ amount: z.number() }).parse({});
      return Response.json(parsed);
    });
    const response = await handler(request(), undefined);

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string; issues?: { path: string }[] };
    };
    expect(body.error.code).toBe("validation_error");
    expect(body.error.issues?.[0]?.path).toBe("amount");
  });

  it("never leaks stack traces, SQL or driver messages", async () => {
    const handler = withApiHandler(async () => {
      throw new Error(
        'duplicate key value violates unique constraint "uq_customer_email" — insert into customers (email) values ("a@b.com")',
      );
    });
    const response = await handler(request(), undefined);

    expect(response.status).toBe(500);
    const raw = await response.text();
    expect(raw).not.toContain("duplicate key");
    expect(raw).not.toContain("insert into customers");
    expect(raw).not.toContain("a@b.com");
    expect(raw).not.toContain("at Object");

    const body = JSON.parse(raw) as {
      error: { code: string; message: string; requestId: string };
    };
    expect(body.error.code).toBe("internal_error");
    expect(body.error.message).toBe(
      "An unexpected error occurred. Please try again.",
    );
    expect(body.error.requestId).toBeTruthy();
  });

  it("runs the handler inside the correlation context", async () => {
    const seen: (string | undefined)[] = [];
    const handler = withApiHandler(async () => {
      const { getRequestId } = await import("./request-context");
      seen.push(getRequestId());
      return Response.json({ ok: true });
    });
    const response = await handler(request(), undefined);

    expect(seen).toEqual([response.headers.get(REQUEST_ID_HEADER)]);
  });

  it("passes the route context through to the handler", async () => {
    const handler = withApiHandler<{ params: Promise<{ id: string }> }>(
      async (_request, context) => {
        const { id } = await context.params;
        return Response.json({ id });
      },
    );
    const response = await handler(request(), {
      params: Promise.resolve({ id: "abc" }),
    });

    expect(await response.json()).toEqual({ id: "abc" });
  });
});
