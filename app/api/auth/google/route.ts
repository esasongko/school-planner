import { NextResponse } from "next/server";
import { buildAuthUrl, newOAuthState } from "@/lib/google";

export async function GET() {
  const { state, verifier, challenge } = newOAuthState();
  const res = NextResponse.redirect(buildAuthUrl(state, challenge));
  res.cookies.set("st_oauth", JSON.stringify({ s: state, v: verifier }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth",
    maxAge: 600,
  });
  return res;
}
