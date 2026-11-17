import { NextRequest, NextResponse } from "next/server";
import { bypassSession, getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const s = getSession(req);
  return NextResponse.json(
    s ? { authed: true, email: s.email, role: s.role, name: s.name ?? null, bypass: bypassSession() !== null } : { authed: false },
  );
}
