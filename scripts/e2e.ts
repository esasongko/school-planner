/**
 * End-to-end check of Google sign-in + roles against a running server, using a fake Google token endpoint.
 * Run the app with GOOGLE_TOKEN_ENDPOINT=http://localhost:4010/token, then: BASE=http://localhost:3055 npm run e2e
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";

const BASE = process.env.BASE ?? "http://localhost:3055";
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const ACCOUNTS: Record<string, { email: string; verified: boolean }> = {
  "code-parent": { email: "parent@example.com", verified: true },
  "code-kid": { email: "kid@example.com", verified: true },
  "code-stranger": { email: "stranger@example.com", verified: true },
  "code-unverified": { email: "kid@example.com", verified: false },
};

const seen: { verifier?: string; redirect?: string }[] = [];
const fake = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const p = new URLSearchParams(body);
    seen.push({ verifier: p.get("code_verifier") ?? undefined, redirect: p.get("redirect_uri") ?? undefined });
    const acct = ACCOUNTS[p.get("code") ?? ""];
    if (!acct || p.get("client_secret") !== process.env.GOOGLE_CLIENT_SECRET) {
      res.writeHead(400).end("{}");
      return;
    }
    const claims = { iss: "https://accounts.google.com", aud: CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 600, email: acct.email, email_verified: acct.verified, name: acct.email.split("@")[0] };
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id_token: `${enc({ alg: "none" })}.${enc(claims)}.sig` }));
  });
});

let passed = 0;
async function t(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log("  ok  ", name);
  } catch (e) {
    console.error("  FAIL", name, "\n      ", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}

class Jar {
  c = new Map<string, string>();
  absorb(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [kv] = line.split(";");
      const i = kv.indexOf("=");
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (v === "" || /max-age=0/i.test(line)) this.c.delete(k);
      else this.c.set(k, v);
    }
  }
  header() { return [...this.c].map(([k, v]) => `${k}=${v}`).join("; "); }
}
async function call(jar: Jar, path: string, init: RequestInit = {}) {
  const res = await fetch(BASE + path, { redirect: "manual", ...init, headers: { ...(init.headers as object), Cookie: jar.header(), "Content-Type": "application/json" } });
  jar.absorb(res);
  return res;
}
/** Full browser-like login: start -> (fake Google) -> callback. */
async function login(code: string, jar = new Jar()) {
  const start = await call(jar, "/api/auth/google");
  const loc = new URL(start.headers.get("location")!);
  const cb = await call(jar, `/api/auth/callback?code=${code}&state=${loc.searchParams.get("state")}`);
  return { jar, start, loc, cb };
}

async function main() {
  await new Promise<void>((r) => fake.listen(4010, r));

  console.log("sign-in flow");
  await t("start redirects to Google with state + PKCE + right params", async () => {
    const { start, loc } = await login("code-parent");
    assert.equal(start.status, 307);
    assert.equal(loc.origin + loc.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(loc.searchParams.get("client_id"), CLIENT_ID);
    assert.equal(loc.searchParams.get("code_challenge_method"), "S256");
    assert.ok(loc.searchParams.get("code_challenge"));
    assert.equal(loc.searchParams.get("redirect_uri"), process.env.APP_URL + "/api/auth/callback");
    assert.match(loc.searchParams.get("scope")!, /email/);
  });
  await t("unauthenticated API calls are 401", async () => {
    for (const p of ["/api/items", "/api/chat", "/api/push"]) assert.equal((await call(new Jar(), p, p === "/api/items" ? {} : { method: "POST", body: "{}" })).status, 401, p);
    assert.deepEqual(await (await call(new Jar(), "/api/me")).json(), { authed: false });
  });
  await t("allowed parent signs in -> admin", async () => {
    const { jar, cb } = await login("code-parent");
    assert.match(cb.headers.get("location")!, /\/$/);
    const me = await (await call(jar, "/api/me")).json();
    assert.equal(me.role, "admin");
    assert.equal(me.email, "parent@example.com");
  });
  await t("allowed child signs in -> child; PKCE verifier + redirect_uri reached Google", async () => {
    const { jar } = await login("code-kid");
    assert.equal((await (await call(jar, "/api/me")).json()).role, "child");
    const last = seen.at(-1)!;
    assert.ok(last.verifier && last.verifier.length >= 32);
    assert.equal(last.redirect, process.env.APP_URL + "/api/auth/callback");
  });
  await t("a Google account not on the allowlist is refused, no session", async () => {
    const { jar, cb } = await login("code-stranger");
    assert.match(cb.headers.get("location")!, /error=not_allowed/);
    assert.equal(jar.c.has("st_session"), false);
    assert.equal((await call(jar, "/api/items")).status, 401);
  });
  await t("unverified email is refused", async () => {
    const { jar, cb } = await login("code-unverified");
    assert.match(cb.headers.get("location")!, /error=not_allowed/);
    assert.equal(jar.c.has("st_session"), false);
  });
  await t("callback rejects wrong state, missing cookie, bad code, and user-cancel", async () => {
    const jar = new Jar();
    const start = await call(jar, "/api/auth/google");
    assert.ok(start.headers.get("location"));
    assert.match((await call(jar, "/api/auth/callback?code=code-parent&state=WRONG")).headers.get("location")!, /error=state/);
    assert.match((await call(new Jar(), "/api/auth/callback?code=code-parent&state=x")).headers.get("location")!, /error=state/);
    const j2 = new Jar();
    const s2 = new URL((await call(j2, "/api/auth/google")).headers.get("location")!);
    assert.match((await call(j2, `/api/auth/callback?code=bogus&state=${s2.searchParams.get("state")}`)).headers.get("location")!, /error=google/);
    assert.match((await call(new Jar(), "/api/auth/callback?error=access_denied")).headers.get("location")!, /error=cancelled/);
  });
  await t("OAuth state cookie is cleared after use (replaying the callback elsewhere fails)", async () => {
    const jar = new Jar();
    const loc = new URL((await call(jar, "/api/auth/google")).headers.get("location")!);
    const url = `/api/auth/callback?code=code-kid&state=${loc.searchParams.get("state")}`;
    assert.ok(!/error=/.test((await call(jar, url)).headers.get("location")!));
    const replay = new Jar();
    assert.match((await call(replay, url)).headers.get("location")!, /error=state/);
  });
  await t("forged session cookie is rejected", async () => {
    const jar = new Jar();
    jar.c.set("st_session", Buffer.from(JSON.stringify({ e: "parent@example.com", x: 9999999999 })).toString("base64url") + ".AAAA");
    assert.equal((await call(jar, "/api/items")).status, 401);
  });
  await t("logout clears the session", async () => {
    const { jar } = await login("code-kid");
    assert.equal((await call(jar, "/api/items")).status, 200);
    assert.equal((await call(jar, "/api/auth/logout", { method: "POST" })).status, 200);
    assert.equal((await call(jar, "/api/items")).status, 401);
  });

  console.log("roles over HTTP");
  const parent = (await login("code-parent")).jar;
  const kid = (await login("code-kid")).jar;
  const mk = async (jar: Jar, kind: string, title: string) =>
    (await (await call(jar, "/api/items", { method: "POST", body: JSON.stringify({ kind, title, due_date: "2026-12-10" }) })).json()).item as { id: number; created_by: string };
  await t("new kinds accepted, legacy kinds rejected, creator recorded", async () => {
    for (const k of ["homework", "ulangan_harian", "uts", "uas"]) assert.ok((await mk(kid, k, k)).id);
    const bad = await call(kid, "/api/items", { method: "POST", body: JSON.stringify({ kind: "exam", title: "x", due_date: "2026-12-10" }) });
    assert.equal(bad.status, 400);
    assert.equal((await mk(kid, "uts", "mine")).created_by, "kid@example.com");
  });
  await t("child can edit anyone's item and mark done", async () => {
    const theirs = await mk(parent, "uas", "Parent-made UAS");
    const r = await call(kid, `/api/items/${theirs.id}`, { method: "PATCH", body: JSON.stringify({ notes: "bab 1-4" }) });
    assert.equal(r.status, 200);
  });
  await t("child cannot delete parent's item (403) but can delete their own", async () => {
    const theirs = await mk(parent, "uts", "Parent-made UTS");
    const mine = await mk(kid, "homework", "Kid-made HW");
    assert.equal((await call(kid, `/api/items/${theirs.id}`, { method: "DELETE" })).status, 403);
    assert.equal((await call(kid, `/api/items/${mine.id}`, { method: "DELETE" })).status, 200);
    assert.equal((await call(parent, `/api/items/${theirs.id}`, { method: "DELETE" })).status, 200);
  });
  await t("parent can delete a child's item", async () => {
    const mine = await mk(kid, "uas", "Kid-made UAS");
    assert.equal((await call(parent, `/api/items/${mine.id}`, { method: "DELETE" })).status, 200);
  });
  await t("push subscription is stored per user; another user can't remove it", async () => {
    const { getPool } = await import("../lib/db");
    const pool = getPool();
    const sub = { endpoint: "https://example.com/push/e2e", keys: { p256dh: "k", auth: "a" } };
    assert.equal((await call(kid, "/api/push", { method: "POST", body: JSON.stringify(sub) })).status, 200);
    const owner = async () => (await pool.query("SELECT user_email FROM push_subscriptions WHERE endpoint=$1", [sub.endpoint])).rows[0]?.user_email;
    assert.equal(await owner(), "kid@example.com");
    await call(parent, "/api/push", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) });
    assert.equal(await owner(), "kid@example.com", "parent's DELETE must not remove the child's device");
    await call(kid, "/api/push", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) });
    assert.equal(await owner(), undefined);
    await pool.end();
  });

  fake.close();
  console.log(`\n${passed} passed${process.exitCode ? ", with failures" : ""}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
