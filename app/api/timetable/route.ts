import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { isDenied, requireSession } from "@/lib/auth";
import { activeTerm, addSlot, allSlots, listTerms } from "@/lib/timetable";

export async function GET(req: NextRequest) {
  const session = requireSession(req);
  if (isDenied(session)) return session;
  const [terms, slots, active] = await Promise.all([listTerms(), allSlots(), activeTerm()]);
  return NextResponse.json({ terms, slots, activeTermId: active?.id ?? null });
}

export async function POST(req: NextRequest) {
  const session = requireSession(req);
  if (isDenied(session)) return session;
  try {
    return NextResponse.json({ slot: await addSlot(await req.json(), session.email) }, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: "Invalid input", issues: e.issues }, { status: 400 });
    throw e;
  }
}
