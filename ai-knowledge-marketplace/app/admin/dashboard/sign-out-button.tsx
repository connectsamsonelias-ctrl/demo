"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded border border-slate-300 px-3 py-1.5 text-sm"
    >
      Sign out
    </button>
  );
}
