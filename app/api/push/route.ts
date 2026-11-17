import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isDenied, requireSession } from "@/lib/auth";
import { getPool } from "@/lib/db";

const Sub = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function POST(req: NextRequest) {
  const session = requireSession(req);
  if (isDenied(session)) return session;
  const parsed = Sub.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad subscription" }, { status: 400 });
  const { endpoint, keys } = parsed.data;
  await getPool().query(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_email) VALUES ($1,$2,$3,$4)
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_email = EXCLUDED.user_email`,
    [endpoint, keys.p256dh, keys.auth, session.email],
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = requireSession(req);
  if (isDenied(session)) return session;
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (endpoint) await getPool().query(`DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_email=$2`, [endpoint, session.email]);
  return NextResponse.json({ ok: true });
}
