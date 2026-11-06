// The phone beside the cards: the Stockbot chat on Telegram for this scene, to whoever it is
// talking to. Cards in the chat carry the decision (approve, release, commit); YES answers it.
import { Bot, ChevronUp } from "lucide-react";
import type { Gate, Message } from "@/scenario/types";
import { PHOTO_CAPTION, type PhotoId } from "@/scenario/shipment";
import { PO } from "@/seed/astro";
import { formatInt, formatUsdShort } from "@/engine/money";
import { useActions } from "./actions";
import { Photo } from "./photos/Photo";
import { Dot, N } from "./Panel";
import s from "./shell.module.css";

export interface PhoneFacts { totalCents: number; releaseCents: number; holdCents: number; receivedQty: number; deadline: string }

/** Figures in a chat line render in Geist Mono. */
function Figures({ text }: { text: string }) {
  const parts = text.split(/(\$[\d,]+(?:\.\d+)?|\d[\d,.]*%?)/g);
  return <>{parts.map((x, i) => (i % 2 ? <N key={i}>{x}</N> : x))}</>;
}

function Field({ k, v }: { k: string; v: string }) {
  return <><span className="es-micro">{k}</span><span className="es-num">{v}</span></>;
}

function YesNo({ live, onYes, label }: { live: boolean; onYes?: () => void; label: string }) {
  return (
    <div className={s.yesNo}>
      <button type="button" className="es-btn es-btn-primary es-btn-sm" disabled={!live} onClick={onYes} aria-label={label}>YES</button>
      <button type="button" className="es-btn es-btn-secondary es-btn-sm" disabled>NO</button>
    </div>
  );
}

export function Phone({ messages, to, clock, waiting, onAnswer, onNext, onChoice, facts, trailing }: {
  messages: Message[]; to: "Luca" | "Jordy"; clock: string; waiting: Gate | null;
  onAnswer: () => void; onNext: () => void; onChoice: (chip: string) => void;
  facts: PhoneFacts; trailing?: { tone: "active" | "attention"; text: string; note?: string } | null;
}) {
  const { openPhoto } = useActions();
  const chat = messages.filter((m) => m.channel === "telegram" && (m.direction === "in" ? to === "Luca" : (m.to ?? "Luca") === to));
  const card = (m: Message) => {
    const head = (text: string) => <span className={s.chatCardHead}><Dot tone="attention" />{text} <N>{PO.number}</N></span>;
    switch (m.card) {
      case "approval": return (
        <div className={s.chatCard} role="group" aria-label="Approval card">
          {head("Approve PO")}
          <div className={s.chatFields}><Field k="PO" v={`${PO.number} · Haoyun Precision`} /><Field k="Qty" v={`${formatInt(PO.quantity)} AM17`} /><Field k="Total" v={formatUsdShort(facts.totalCents)} /></div>
          <p className={s.note}>YES signs approval 1 of 2. No money moves until both have signed.</p>
          <YesNo live={waiting?.id === "approve_luca"} onYes={onAnswer} label={waiting?.id === "approve_luca" ? waiting.action : "YES"} />
        </div>
      );
      case "sign": return (
        <div className={s.chatCard} role="group" aria-label="Approval card">
          {head("Sign PO")}
          <div className={s.chatFields}><Field k="PO" v={`${PO.number} · Haoyun Precision`} /><Field k="Qty" v={`${formatInt(PO.quantity)} AM17`} /><Field k="Total" v={formatUsdShort(facts.totalCents)} /></div>
          <p className={s.note}>YES signs approval 2 of 2. Then the agreed total is committed to the PO.</p>
          <YesNo live={waiting?.id === "approve_jordy"} onYes={onAnswer} label={waiting?.id === "approve_jordy" ? waiting.action : "YES"} />
        </div>
      );
      case "release": return (
        <div className={s.chatCard} role="group" aria-label="Release card">
          {head("Release for PO")}
          <div className={s.chatFields}><Field k="Qty" v={`${formatInt(facts.receivedQty)} of ${formatInt(PO.quantity)}`} /><Field k="Release" v={formatUsdShort(facts.releaseCents)} /><Field k="Hold" v={formatUsdShort(facts.holdCents)} /></div>
          <p className={s.note}>YES pays Haoyun <N>{formatUsdShort(facts.releaseCents)}</N> now. <N>{formatUsdShort(facts.holdCents)}</N> stays held until <N>{facts.deadline}</N>.</p>
          <YesNo live={waiting?.id === "approve_release"} onYes={onAnswer} label={waiting?.id === "approve_release" ? waiting.action : "YES"} />
        </div>
      );
      case "commit": return (
        <div className={s.chatCard} role="group" aria-label="Commit card">
          {head("Commit PO")}
          <div className={s.chatFields}><Field k="PO" v={`${PO.number} · Haoyun Precision`} /><Field k="Qty" v={`${formatInt(PO.quantity)} AM17`} /><Field k="Total" v={formatUsdShort(facts.totalCents)} /></div>
          <p className={s.note}>YES commits <N>{formatUsdShort(facts.totalCents)}</N> to PO <N>{PO.number}</N>&apos;s own account. It can pay Haoyun or go back to Astro.</p>
          <YesNo live={!waiting} onYes={onNext} label={`YES, commit ${formatUsdShort(facts.totalCents)}`} />
        </div>
      );
      default: return null;
    }
  };
  // A gate answered in the chat itself (a card or a chip) needs no button at the bottom.
  const inChat = !!waiting && (["approve_luca", "approve_jordy", "approve_release"].includes(waiting.id) || chat.some((m) => m.chips?.includes(waiting.action)));

  return (
    <div className={s.phoneCol}>
      <span className={`es-micro ${s.phoneLabel}`}>Stockbot · Telegram</span>
      <section className={s.device} aria-label="Phone">
        <div className={s.screen}>
          <div className={s.status}><N>{clock}</N><span className={s.camera} aria-hidden="true" /><N className={s.muted}>5G</N></div>
          <header className={s.chatHead}>
            <span className={s.avatar}><Bot size={15} strokeWidth={2} aria-hidden="true" /></span>
            <span className={s.chatName}><b>Stockbot</b><span>bot · to {to}</span></span>
          </header>
          <ol className={s.chat} aria-label="Chat">
            {chat.map((m) => (
              <li key={m.id} style={{ display: "contents" }}>
                {m.direction === "in" ? (
                  m.photo && m.photo in PHOTO_CAPTION ? (
                    <button type="button" className={s.slipPhoto} onClick={() => openPhoto("dock", 0)} aria-label={`Open photo: ${PHOTO_CAPTION[m.photo as PhotoId]}`}>
                      <Photo id={m.photo as PhotoId} label={PHOTO_CAPTION[m.photo as PhotoId]} />
                    </button>
                  ) : <span className={s.userText}><Figures text={m.text} /></span>
                ) : (
                  <>
                    <p className={s.botText}><Figures text={m.text} /></p>
                    {m.chips && (
                      <span className={s.chips}>
                        {m.chips.map((c) => {
                          const live = waiting && (c === waiting.action || (waiting.id === "on_hold" && c !== "Keep waiting"));
                          return live
                            ? <button key={c} type="button" className={s.chip} onClick={() => (c === waiting!.action ? onAnswer() : onChoice(c))}>{c}</button>
                            : <span key={c} className={s.chip}>{c}</span>;
                        })}
                      </span>
                    )}
                    {card(m)}
                  </>
                )}
              </li>
            ))}
            {trailing && (
              <li className={s.chatStatus} role="status">
                <Dot tone={trailing.tone} pulse={trailing.tone === "active"} />
                <span className={trailing.tone === "attention" ? s.attnInk : undefined}>{trailing.text}</span>
                {trailing.note && <span>{trailing.note}</span>}
              </li>
            )}
          </ol>
          <div className={s.phoneFoot}>
            {waiting && !inChat && (
              <button type="button" className="es-btn es-btn-primary es-btn-sm" style={{ width: "100%" }} onClick={onAnswer}>{waiting.action}</button>
            )}
            <div className={s.compose} aria-hidden="true">Message<span className={s.send}><ChevronUp size={13} strokeWidth={2} /></span></div>
          </div>
        </div>
      </section>
    </div>
  );
}
