import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { PREVIEW_COOKIE } from "./context";
import { can, requireCapability, withApiGuard } from "./guard";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import type { AuthContext } from "./context";

const originalNodeEnv = process.env.NODE_ENV;
// `NODE_ENV` is typed readonly; tests need to simulate the production build.
const mutableEnv = process.env as Record<string, string | undefined>;

afterEach(() => {
  mutableEnv.NODE_ENV = originalNodeEnv;
});

function requestWithRole(role: string | null): NextRequest {
  const headers = new Headers();
  if (role) headers.set("cookie", `${PREVIEW_COOKIE}=${role}`);
  return new NextRequest("http://localhost:3000/api/private", { headers });
}

function context(role: AuthContext["role"]): AuthContext {
  return {
    userId: `u-${role}`,
    role,
    displayName: "Test user",
    merchantId: null,
    preview: false,
  };
}

describe("withApiGuard", () => {
  const handler = withApiGuard("platform.manage", async () =>
    Response.json({ secret: true }),
  );

  it("rejects anonymous callers with 401 before the handler runs", async () => {
    const response = await handler(requestWithRole(null), undefined);

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("rejects a signed-in caller without the capability with 403", async () => {
    const response = await handler(
      requestWithRole("MERCHANT_STAFF"),
      undefined,
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe("forbidden");
    expect(body.error.message).toBe("You do not have permission to do this.");
  });

  it("admits a caller that holds the capability", async () => {
    const response = await handler(requestWithRole("SUPER_ADMIN"), undefined);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ secret: true });
  });

  it("ignores the dev preview cookie in production", async () => {
    mutableEnv.NODE_ENV = "production";

    const response = await handler(requestWithRole("SUPER_ADMIN"), undefined);

    expect(response.status).toBe(401);
  });

  it("never executes the handler for a denied caller", async () => {
    let ran = false;
    const guarded = withApiGuard("platform.manage", async () => {
      ran = true;
      return Response.json({ ok: true });
    });

    await guarded(requestWithRole("CUSTOMER"), undefined);

    expect(ran).toBe(false);
  });
});

describe("capability checks", () => {
  it("accepts a single capability or a list", () => {
    const owner = context("MERCHANT_OWNER");
    expect(can(owner, "loyalty.write")).toBe(true);
    expect(can(owner, ["loyalty.write", "staff.manage"])).toBe(true);
    expect(can(owner, ["loyalty.write", "platform.manage"])).toBe(false);
  });

  it("throws a generic forbidden error when a capability is missing", () => {
    const staff = context("MERCHANT_STAFF");

    expect(() => requireCapability(staff, "transactions.create")).not.toThrow();
    expect(() => requireCapability(staff, "transactions.adjust")).toThrow(
      ForbiddenError,
    );
    try {
      requireCapability(staff, "staff.manage");
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).message).toBe(
        "You do not have permission to do this.",
      );
      expect((error as ForbiddenError).status).toBe(403);
    }
  });

  it("is reachable without a request context (server-safe)", () => {
    const anonymousCheck = () => {
      const auth = context("CUSTOMER");
      return can(auth, "customers.read");
    };
    expect(anonymousCheck()).toBe(false);
  });
});

describe("unauthenticated errors", () => {
  it("uses the shared unauthorized error shape", () => {
    const error = new UnauthorizedError();
    expect(error.status).toBe(401);
    expect(error.code).toBe("unauthorized");
  });
});
