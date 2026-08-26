import { describe, it, expect } from "vitest";
import { toApiResponse, ValidationError, ForbiddenError } from "@/lib/errors";

describe("toApiResponse", () => {
  it("maps a known AppError to its status code and code", async () => {
    const res = toApiResponse(new ForbiddenError("nope"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("forbidden");
    expect(body.error.message).toBe("nope");
  });

  it("includes validation issues on ValidationError", async () => {
    const res = toApiResponse(new ValidationError("bad input", { fieldErrors: { x: ["required"] } }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.issues).toEqual({ fieldErrors: { x: ["required"] } });
  });

  it("never leaks internal error details for unknown errors", async () => {
    const res = toApiResponse(new Error("db password is hunter2"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).not.toContain("hunter2");
    expect(body.error.code).toBe("internal_error");
  });
});
