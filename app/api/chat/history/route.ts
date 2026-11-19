import { NextRequest, NextResponse } from "next/server";
import { isDenied, requireSession } from "@/lib/auth";
import { clearHistory, loadHistory } from "@/lib/chathistory";

export async function GET(req: NextRequest) {
  const session = requireSession(req);
  if (isDenied(session)) return session;
  return NextResponse.json({ messages: await loadHistory(session.email) });
}

export async function DELETE(req: NextRequest) {
  const session = requireSession(req);
  if (isDenied(session)) return session;
  await clearHistory(session.email);
  return NextResponse.json({ ok: true });
}
