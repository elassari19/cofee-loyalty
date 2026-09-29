import type { DestinationStream } from "pino";
import { describe, expect, it } from "vitest";
import { createLogger, getLogger, REDACTED, scrubSecrets } from "./logger";
import { runWithRequestId } from "./request-context";

class CaptureStream {
  readonly chunks: string[] = [];

  write(chunk: string): boolean {
    this.chunks.push(String(chunk));
    return true;
  }

  lines(): Record<string, unknown>[] {
    return this.chunks
      .join("")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }
}

function captureLogger(): {
  log: ReturnType<typeof createLogger>;
  stream: CaptureStream;
} {
  const stream = new CaptureStream();
  const log = createLogger(
    { level: "info", base: {} },
    stream as unknown as DestinationStream,
  );
  return { log, stream };
}

describe("logger redaction", () => {
  it("redacts passwords, tokens, redemption codes and personal data", () => {
    const { log, stream } = captureLogger();
    log.info(
      {
        password: "hunter2",
        token: "abc123",
        redemptionCode: "REDEEM-1",
        email: "customer@example.com",
        phone: "+15551234567",
        nested: { password: "hunter2", email: "other@example.com" },
        safe: "loyalty program updated",
      },
      "event",
    );

    const line = stream.lines()[0] ?? {};
    expect(line.password).toBe(REDACTED);
    expect(line.token).toBe(REDACTED);
    expect(line.redemptionCode).toBe(REDACTED);
    expect(line.email).toBe(REDACTED);
    expect(line.phone).toBe(REDACTED);
    expect((line.nested as Record<string, unknown>).password).toBe(REDACTED);
    expect((line.nested as Record<string, unknown>).email).toBe(REDACTED);
    expect(line.safe).toBe("loyalty program updated");
    expect(JSON.stringify(line)).not.toContain("hunter2");
    expect(JSON.stringify(line)).not.toContain("customer@example.com");
  });

  it("scrubs credentials embedded in free-form error text", () => {
    expect(
      scrubSecrets(
        "connect ECONNREFUSED postgresql://postgres:supersecret@localhost:5432/db",
      ),
    ).not.toContain("supersecret");
    expect(scrubSecrets("failed with password=hunter2")).not.toContain(
      "hunter2",
    );
    expect(
      scrubSecrets("postgresql://postgres:supersecret@localhost:5432/db"),
    ).toContain(`postgresql://${REDACTED}@localhost`);
  });

  it("does not leak credentials through serialized errors", () => {
    const { log, stream } = captureLogger();
    const error = new Error(
      "connection failed for postgresql://user:secret@db:5432/app",
    );
    log.error({ err: error }, "boom");

    const line = stream.lines()[0] ?? {};
    const serialized = JSON.stringify(line);
    expect(serialized).not.toContain("secret@db");
    expect(serialized).toContain(REDACTED);
  });
});

describe("getLogger", () => {
  it("returns the process logger outside a request", () => {
    expect(getLogger()).toBeDefined();
  });

  it("binds the correlation id inside a request", () => {
    runWithRequestId("req-abc-123", () => {
      expect(getLogger().bindings().requestId).toBe("req-abc-123");
    });
  });
});
