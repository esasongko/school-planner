"use client";
import { useEffect, useRef, useState } from "react";
import type { AgentAction, SlotAction } from "@/lib/agent";
import { ItemCard } from "./ItemCard";
import { SlotRow } from "./Timetable";
import { Spinner } from "./Spinner";

interface Msg {
  role: "user" | "assistant";
  content: string;
  actions?: AgentAction[];
  slotActions?: SlotAction[];
  error?: boolean;
}

const GREETING: Msg = {
  role: "assistant",
  content: "Hi! Tell me about homework, a ULHA (Ulangan Harian), UTS (Ujian Tengah Semester) or UAS (Ujian Akhir Semester) and I'll save it. You can also add your class timetable. Try: \"Science homework due Thursday, page 40-42\".",
};

const SUGGESTIONS = ["What's due this week?", "ULHA Matematika next Friday, bab 5 dan 6", "Any UTS or UAS coming up?", "What classes do I have tomorrow?"];

export function Chat({ onChanged }: { onChanged: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/chat/history")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.messages?.length) setMsgs([GREETING, ...d.messages]);
      })
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  async function clearChat() {
    if (!confirm("Clear your chat history? Saved homework and exams are not affected.")) return;
    await fetch("/api/chat/history", { method: "DELETE" });
    setMsgs([GREETING]);
  }

  async function send(content: string) {
    const trimmed = content.trim();
    if (!trimmed || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: trimmed }];
    setMsgs(next);
    setText("");
    setBusy(true);
    try {
      // Only role/content go to the server; skip the canned greeting.
      const history = next.slice(1).filter((m) => !m.error).slice(-20).map(({ role, content }) => ({ role, content }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setMsgs((m) => [...m, { role: "assistant", content: data.reply, actions: data.actions, slotActions: data.slotActions }]);
      if (data.actions?.length || data.slotActions?.length) onChanged();
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: e instanceof Error ? e.message : "Network error", error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat">
      {msgs.length > 1 && (
        <button type="button" className="link" style={{ alignSelf: "flex-end", margin: "6px 12px 0", fontSize: ".78rem" }} onClick={clearChat}>
          Clear chat
        </button>
      )}
      <div className="msgs">
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "contents" }}>
            <div className={`bubble ${m.role === "user" ? "user" : "bot"}${m.error ? " err" : ""}`}>{m.content}</div>
            {m.actions?.map((a, j) => (
              <div className="saved" key={j}>
                <ItemCard item={a.item} compact deleted={a.type === "deleted"} />
              </div>
            ))}
            {m.slotActions && m.slotActions.length > 0 && (
              <div className="saved slots">
                {m.slotActions.map((a, j) => (
                  <SlotRow key={j} slot={a.slot} />
                ))}
              </div>
            )}
          </div>
        ))}
        {loadingHistory && (
          <div className="chat-loading">
            <Spinner label="Loading chat history" />
          </div>
        )}
        {busy && (
          <div className="bubble bot loading">
            <Spinner size={14} label="Assistant is thinking" /> Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>
      {msgs.length <= 1 && (
        <div className="chips">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <textarea
          rows={1}
          value={text}
          placeholder="Add homework, ULHA, UTS, UAS…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
        />
        <button className="send" disabled={busy || !text.trim()}>
          {busy ? <Spinner light label="Sending" /> : "Send"}
        </button>
      </form>
    </div>
  );
}
