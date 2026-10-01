import { describe, expect, it } from "vitest";

import { joinUrlFor } from "./join";

describe("joinUrlFor", () => {
  it("builds the public join link from the slug alone", () => {
    expect(joinUrlFor("cafe-luna")).toBe(
      "http://localhost:3000/join/cafe-luna",
    );
  });

  it("encodes the slug and trims trailing slashes from the base URL", () => {
    expect(joinUrlFor("café zero")).toBe(
      "http://localhost:3000/join/caf%C3%A9%20zero",
    );
  });
});
