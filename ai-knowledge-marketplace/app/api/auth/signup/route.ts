import { z, parseOrThrow } from "@/lib/validation";
import { createUserWithPassword, EmailAlreadyRegisteredError, PUBLIC_SIGNUP_ROLES } from "@/lib/auth/credentials";
import { toApiResponse, AppError } from "@/lib/errors";

const signupSchema = z.object({
  email: z.string().email(),
  // Deliberately not the full Role type — an admin account must never be
  // creatable through this endpoint. See lib/auth/credentials.ts.
  role: z.enum(PUBLIC_SIGNUP_ROLES),
  password: z.string().min(10, "Password must be at least 10 characters"),
});

class EmailAlreadyRegisteredApiError extends AppError {
  constructor() {
    super("An account with this email already exists", 409, "email_already_registered");
  }
}

export async function POST(request: Request) {
  try {
    const body = parseOrThrow(signupSchema, await request.json());
    const user = await createUserWithPassword(body.email, body.password, body.role);
    return Response.json({ user }, { status: 201 });
  } catch (err) {
    if (err instanceof EmailAlreadyRegisteredError) {
      return toApiResponse(new EmailAlreadyRegisteredApiError());
    }
    return toApiResponse(err);
  }
}
