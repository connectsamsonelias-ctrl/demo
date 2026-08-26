import { describe, it, expect } from "vitest";
import { z, parseOrThrow } from "@/lib/validation";
import { ValidationError } from "@/lib/errors";

const schema = z.object({ email: z.string().email() });

describe("parseOrThrow", () => {
  it("returns typed data on success", () => {
    expect(parseOrThrow(schema, { email: "a@b.com" })).toEqual({ email: "a@b.com" });
  });

  it("throws ValidationError on invalid input", () => {
    expect(() => parseOrThrow(schema, { email: "not-an-email" })).toThrow(ValidationError);
  });
});
