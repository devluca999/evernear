import type { Message } from "@/scenario/types";
import { PHOTO_CAPTION, type PhotoId } from "@/scenario/shipment";
import { useActions } from "./actions";
import { Photo } from "./photos/Photo";
import { Led } from "./Led";
import s from "./workspace.module.css";

/** Generic phone frame mirroring the Stockbot chat on Telegram. Pull up only. */
export function Phone({ messages, open, onToggle }: { messages: Message[]; open: boolean; onToggle: () => void }) {
  const chat = messages.filter((m) => m.channel === "telegram");
  const { openPhoto } = useActions();
  return (
    <section className={`${s.phone} ${open ? s.phoneOpen : ""}`} aria-label="Phone">
      <button className={s.phoneTab} onClick={onToggle} aria-expanded={open}>Phone</button>
      <div className={s.phoneScreen}>
        <header className={s.phoneHead}><span className={s.phoneName}>Stockbot</span><span className={s.faint}>Telegram</span></header>
        <ol className={s.chat}>
          {chat.map((m) => (
            <li key={m.id} className={m.direction === "out" ? s.botMsg : s.userMsg}>
              {m.photo && m.photo in PHOTO_CAPTION && (
                <button className={s.chatPhoto} onClick={() => openPhoto("dock", 0)} aria-label={`Open photo: ${PHOTO_CAPTION[m.photo as PhotoId]}`}>
                  <Photo id={m.photo as PhotoId} label={PHOTO_CAPTION[m.photo as PhotoId]} />
                </button>
              )}
              {m.text}
              {m.card === "approval" && (
                <span className={s.chatCard} role="group" aria-label="Approval card">
                  <span className={s.chatCardHead}><Led tone="attention" />Approval 1 of 2</span>
                  <span className={s.chatFields}>
                    <span><span className={s.micro}>PO</span><span className={s.fig}>1042</span></span>
                    <span><span className={s.micro}>QTY</span><span className={s.fig}>2,000</span></span>
                    <span><span className={s.micro}>TOTAL</span><span className={s.fig}>$38,000</span></span>
                  </span>
                  <span className={s.chatYes}>YES approves PO 1042: 2,000 actuator motors from Haoyun Precision for $38,000, committed to its own PO account.</span>
                  <span className={s.chips}><span className={s.chipYes}>YES</span><span className={s.chipNo}>NO</span></span>
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
