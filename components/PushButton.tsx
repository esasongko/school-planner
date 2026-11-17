"use client";
import { useEffect, useState } from "react";

function b64ToUint8(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushButton() {
  const [state, setState] = useState<"unsupported" | "off" | "on" | "denied">("off");
  const [hint, setHint] = useState("");
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !key) {
      setState("unsupported");
      return;
    }
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      if (Notification.permission === "denied") return setState("denied");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    });
  }, [key]);

  async function enable() {
    setHint("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key!) }));
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error();
      setState("on");
    } catch {
      setHint("Couldn't turn on reminders. On iPhone, add the app to the Home Screen first.");
    }
  }

  if (state === "unsupported") return null;
  if (state === "denied") return <span className="bell" title="Allow notifications in browser settings">🔕 Blocked</span>;
  return (
    <>
      <button className="bell" data-on={state === "on"} onClick={state === "on" ? undefined : enable} title={hint}>
        {state === "on" ? "🔔 Reminders on" : "🔔 Turn on reminders"}
      </button>
      {hint && <span style={{ fontSize: ".75rem", color: "#c92a2a" }}>{hint}</span>}
    </>
  );
}
