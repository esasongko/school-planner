import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE = "st_session";
export type Role = "admin" | "child";
export interface Session {
  email: string;
  role: Role;
  name?: string;
}

const SESSION_DAYS = 90;

/**
 * AUTH_ALLOWLIST="parent@gmail.com:admin,kid@gmail.com:child"
 * Only these Google accounts can sign in. Roles are read from here on every request,
 * so removing someone (or changing a role) takes effect immediately.
 */
export function parseAllowlist(raw: string = process.env.AUTH_ALLOWLIST ?? ""): Map<string, Role> {
  const map = new Map<string, Role>();
  for (const part of raw.split(",")) {
    const [email, role] = part.split(":").map((s) => s.trim());
    if (!email) continue;
    if (role !== "admin" && role !== "child") throw new Error(`AUTH_ALLOWLIST: role for "${email}" must be admin or child`);
    map.set(email.toLowerCase(), role);
  }
  return map;
}

export function roleFor(email: string): Role | null {
  return parseAllowlist().get(email.trim().toLowerCase()) ?? null;
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET must be set (16+ characters)");
  return s;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function createSessionToken(email: string, name?: string, nowMs = Date.now()): string {
  const body = Buffer.from(
    JSON.stringify({ e: email.trim().toLowerCase(), n: name, x: Math.floor(nowMs / 1000) + SESSION_DAYS * 86_400 }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readSessionToken(token: string | undefined, nowMs = Date.now()): Session | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  if (!safeEqual(token.slice(dot + 1), sign(body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { e?: string; n?: string; x?: number };
    if (!p.e || typeof p.x !== "number" || p.x * 1000 < nowMs) return null;
    const role = roleFor(p.e);
    return role ? { email: p.e, role, name: p.n } : null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  };
}

/**
 * TEMPORARY: when AUTH_BYPASS_EMAIL is set (and is on the allowlist), every request is treated as that user
 * and Google sign-in is skipped. Remove the variable to turn real login back on.
 */
export function bypassSession(): Session | null {
  const email = process.env.AUTH_BYPASS_EMAIL?.trim().toLowerCase();
  if (!email) return null;
  const role = roleFor(email);
  return role ? { email, role } : null;
}

export function getSession(req: NextRequest): Session | null {
  const bypass = bypassSession();
  if (bypass) return bypass;
  try {
    return readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}

/** Returns the session, or a 401 response to send back. */
export function requireSession(req: NextRequest): Session | NextResponse {
  return getSession(req) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function isDenied(x: Session | NextResponse): x is NextResponse {
  return x instanceof NextResponse;
}
