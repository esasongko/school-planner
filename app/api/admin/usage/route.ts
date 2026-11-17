import { NextRequest, NextResponse } from "next/server";
import { isDenied, requireSession } from "@/lib/auth";
import { usageStats } from "@/lib/usage";

export async function GET(req: NextRequest) {
  const session = requireSession(req);
  if (isDenied(session)) return session;
  if (session.role !== "superadmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await usageStats());
}
