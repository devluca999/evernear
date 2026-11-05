import type { Message } from "@/scenario/types";
import { PHOTO_CAPTION, type PhotoId } from "@/scenario/shipment";
import { useActions } from "./actions";
import { Photo } from "./photos/Photo";
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
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
