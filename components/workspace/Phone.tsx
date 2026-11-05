import type { Message } from "@/scenario/types";
import s from "./workspace.module.css";

/** Generic phone frame mirroring the Stockbot chat on Telegram. Pull up only. */
export function Phone({ messages, open, onToggle }: { messages: Message[]; open: boolean; onToggle: () => void }) {
  const chat = messages.filter((m) => m.channel === "telegram");
  return (
    <section className={`${s.phone} ${open ? s.phoneOpen : ""}`} aria-label="Phone">
      <button className={s.phoneTab} onClick={onToggle} aria-expanded={open}>Phone</button>
      <div className={s.phoneScreen}>
        <header className={s.phoneHead}><span className={s.phoneName}>Stockbot</span><span className={s.faint}>Telegram</span></header>
        <ol className={s.chat}>
          {chat.map((m) => (
            <li key={m.id} className={m.direction === "out" ? s.botMsg : s.userMsg}>
              {m.photo && <span className={s.photo} aria-label="Packing slip photo">
                <span className={s.photoBox}>QTY 1,800</span><span className={s.faint}>of 2,000</span>
              </span>}
              {m.text}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
