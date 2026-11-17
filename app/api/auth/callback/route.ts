import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { SESSION_COOKIE, createSessionToken, roleFor, sessionCookieOptions } from "@/lib/auth";
import { appUrl, exchangeCode } from "@/lib/google";

function back(error?: string): NextResponse {
  const res = NextResponse.redirect(`${appUrl()}/${error ? `?error=${error}` : ""}`);
  res.cookies.set("st_oauth", "", { path: "/api/auth", maxAge: 0 });
  return res;
}

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back("cancelled");

  let saved: { s?: string; v?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get("st_oauth")?.value ?? "{}");
  } catch {}
  const code = p.get("code");
  const state = p.get("state");
  if (!code || !state || !saved.s || !saved.v || !sameState(state, saved.s)) return back("state");

  let identity;
  try {
    identity = await exchangeCode(code, saved.v);
  } catch (e) {
    console.error("google sign-in failed:", e);
    return back("google");
  }
  if (!identity.emailVerified || !roleFor(identity.email)) return back("not_allowed");

  const res = back();
  res.cookies.set(SESSION_COOKIE, createSessionToken(identity.email, identity.name), sessionCookieOptions());
  return res;
}
