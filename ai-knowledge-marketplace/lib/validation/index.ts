import { z, type ZodSchema } from "zod";
import { ValidationError } from "@/lib/errors";

export { z };

/**
 * Parse-or-throw helper so every API route validates input the same way:
 * zod schema in, typed data out, ValidationError (422) on failure. This is
 * the only sanctioned way request bodies/query params should be trusted.
 */
export function parseOrThrow<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError("Invalid input", result.error.flatten());
  }
  return result.data;
}
