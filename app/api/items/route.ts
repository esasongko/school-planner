import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { isDenied, requireSession } from "@/lib/auth";
import { addItem, listItems, KINDS, type Kind } from "@/lib/items";

export async function GET(req: NextRequest) {
  const session = requireSession(req);
  if (isDenied(session)) return session;
  const p = req.nextUrl.searchParams;
  const status = p.get("status");
  const kind = p.get("kind");
  const items = await listItems({
    status: status === "done" || status === "all" ? status : "open",
    kind: KINDS.includes(kind as Kind) ? (kind as Kind) : undefined,
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = requireSession(req);
  if (isDenied(session)) return session;
  try {
    return NextResponse.json({ item: await addItem(await req.json(), session.email) }, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: "Invalid input", issues: e.issues }, { status: 400 });
    throw e;
  }
}
