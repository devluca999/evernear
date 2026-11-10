// Inbox: supplier email with Stockbot's reading of each one beside it. The model only reads and
// drafts; what it may agree to is checked against the rules in code. A decision the story waits
// for can be answered here (Start sourcing).
import { useEffect, useRef } from "react";
import type { Message, WorkspaceState } from "@/scenario/types";
import { demand, PO, quickshipOffer, routineReorder, suppliers } from "@/seed/astro";
import { formatInt, formatUsd, formatUsdShort } from "@/engine/money";
import { comparison } from "@/scenario/scenes";
import { useActions } from "../actions";
import { Dot, N, Panel, Stamp } from "../Panel";
import s from "../shell.module.css";

const SENDER: Record<string, string> = { "orders@ultra-motion.example": "Ultra Motion", "sales@haoyun-precision.example": "Haoyun Precision", "orders@quickship-motion.example": "QuickShip Motion" };
const who = (m: Message) => (m.direction === "out" ? m.from : SENDER[m.from] ?? m.from);

/** Figures in an email render in Geist Mono. */
function Figures({ text }: { text: string }) {
  const parts = text.split(/(\$[\d,]+(?:\.\d+)?|[+]?\d[\d,.]*%?(?: Nov| Dec)?)/g);
  return <>{parts.map((x, i) => (i % 2 ? <N key={i} className={x.startsWith("$") || x.startsWith("+") ? s.hi : undefined}>{x}</N> : x))}</>;
}

const THREAD_ORDER = ["haoyun", "quickship"];
/** How long a new email stays lit after it lands (story time). */
export const NEW_MAIL_MS = 4500;
const TONE = { success: "success", attention: "attention", alert: "alert" } as const;

/** Stockbot's recommendation, once both final offers are in: QuickShip's discount against the late robots. */
function Compare({ st }: { st: WorkspaceState }) {
  const h = st.offers.find((o) => o.supplierId === "haoyun"), q = st.offers.find((o) => o.supplierId === "quickship");
  if (!h || !q || h.tone !== "success" || q.tone !== "alert") return null;
  const c = comparison;
  return (
    <section className={s.compare} aria-label="Stockbot's comparison" data-focus="negotiation.compare">
      <div className={s.headRow}><Dot tone="active" /><span className="es-micro">Stockbot compares</span></div>
      <div className={s.compareBody}>
      <div className={s.compareGrid}>
        <span />
        <span className="es-micro">Haoyun</span>
        <span className="es-micro">QuickShip</span>
        <span className={s.note}>Price</span><N>{formatUsd(h.unitCents)}</N><N>{formatUsd(q.unitCents)}</N>
        <span className={s.note}>Within the 5% ceiling</span><span>Yes</span><span>No, needs an exception</span>
        <span className={s.note}>Robots on time</span><N>{formatInt(demand.robotsOrdered)} of {formatInt(demand.robotsOrdered)}</N><N>{formatInt(demand.robotsOrdered - c.lateRobots)} of {formatInt(demand.robotsOrdered)}</N>
        <span className={s.note}>Extra</span><span>No discount</span><span>{quickshipOffer.nextOrderDiscountPercent}% off next order, about <N>{formatUsdShort(c.discountCents)}</N></span>
      </div>
      <p className={s.botText} style={{ maxWidth: "none", fontSize: 15 }}>
        The discount is worth about <N>{formatUsdShort(c.discountCents)}</N>; <N>{c.lateRobots}</N> late robots put <N>{formatUsdShort(c.atRiskCents)}</N> of orders at risk. Haoyun ships everything on time within the rules.
      </p>
      </div>
    </section>
  );
}

/** One contender's column: its offer on top, then every email in full, the newest scrolled into view. */
function Thread({ o, mail, newest }: { o: WorkspaceState["offers"][number]; mail: Message[]; newest: string | null }) {
  const sup = suppliers.find((x) => x.id === o.supplierId)!;
  const thread = mail.filter((m) => m.from.includes(o.supplierId) || m.to?.includes(o.supplierId));
  const box = useRef<HTMLElement>(null);
  const last = thread.at(-1)?.id;
  // A new email, or a new offer on top (which can grow the header), scrolls its own thread to the
  // newest email (only the thread: the page and the camera stay put).
  useEffect(() => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; }, [last, o.note, o.unitCents]);
  return (
    <section ref={box} className={s.thread} data-main={o.supplierId === "haoyun"} aria-label={`${sup.name} offer`} data-focus={o.supplierId === "haoyun" ? "negotiation.haoyun" : undefined}>
      <div className={s.threadHead}>
        <div className={s.headRow} style={{ alignItems: "baseline" }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{sup.name}</span>
          <span className={`${s.note} ${s.push}`} style={{ fontSize: 13 }}>{sup.city}</span>
        </div>
        <div className={s.headRow} style={{ gap: 8 }}>
          <N><span style={{ fontSize: 24, fontWeight: 500 }}>{formatUsd(o.unitCents)}</span></N>
          <span className={s.note} style={{ fontSize: 13 }}>a unit</span>
        </div>
        <span className={s.line} style={{ fontSize: 14 }}><Dot tone={TONE[o.tone]} />{o.note}</span>
      </div>
      {thread.map((m) => (
        <div key={m.id} className={s.threadMail} data-new={m.id === newest}>
          <div className={s.headRow} style={{ alignItems: "baseline" }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{who(m)}</span>
            {m.kind && <span className={s.note} style={{ fontSize: 13 }}>{m.kind}</span>}
            {m.time && <N className={`${s.push} ${s.faint}`}><span style={{ fontSize: 12 }}>{m.time}</span></N>}
          </div>
          <p className={s.sub} style={{ fontSize: 14.5 }}><Figures text={m.text} /></p>
          {m.reading && <p className={s.botText} style={{ fontSize: 13.5, maxWidth: "none" }}><span className="es-micro">Stockbot read </span><Figures text={m.reading} /></p>}
        </div>
      ))}
    </section>
  );
}

/** Negotiation: one column per contender, each with its own email thread; Stockbot's comparison spans both underneath. */
function Threads({ st, mail }: { st: WorkspaceState; mail: Message[] }) {
  const cols = THREAD_ORDER.map((id) => st.offers.find((o) => o.supplierId === id)).filter((o) => o !== undefined);
  // The newest email is lit for a moment after it lands.
  const latest = mail.at(-1);
  const newest = latest && latest.atMs !== undefined && st.t - latest.atMs < NEW_MAIL_MS ? latest.id : null;
  return (
    <div className={s.threadsWrap}>
      <div className={s.threads} data-focus="negotiation.threads">
        {cols.map((o) => <Thread key={o.supplierId} o={o} mail={mail} newest={newest} />)}
      </div>
      <Compare st={st} />
    </div>
  );
}

export function InboxPanel({ st, pulse }: { st: WorkspaceState; pulse: boolean }) {
  const { waiting, answer } = useActions();
  const mail = st.messages.filter((m) => m.channel === "email");
  const thread = mail.filter((m) => m.from.includes("haoyun") || m.to?.includes("haoyun"));
  const asking = waiting?.id === "start_sourcing";
  const routinePaid = st.routine.stage === "paid" || st.routine.stage === "closed";
  const shown = thread.length ? thread : mail;
  const unread = asking || waiting?.id === "price_limit" ? 1 : 0;
  const confirmed = thread.length > 0 && st.price.history.at(-1)?.pass;

  return (
    <Panel id="inbox" title="Inbox" pulse={pulse}
      meta={<>{unread > 0 && <span className="es-count es-count-attention" aria-label={`${unread} needs you`}>{unread}</span>}{thread.length > 0 && <span>PO <N>{PO.number}</N> · Haoyun Precision</span>}</>}>
      {shown.length === 0 && !routinePaid && st.offers.length < 2 && <p className={`${s.pad} ${s.note}`}>No new mail.</p>}
      {st.offers.length >= 2 ? <Threads st={st} mail={mail} /> : (
      <div className={s.inbox}>
        {shown.map((m, i) => {
          const last = i === shown.length - 1;
          const tone = m.reading?.includes("over") || m.reading?.includes("miss") || m.reading?.includes("Holds") ? "attention" : "success";
          return (
            <article key={m.id} className={s.mail} aria-label={`${who(m)}: ${m.kind ?? m.subject ?? "email"}`} data-focus={m.from.includes("ultra") ? "inbox.reply" : undefined}>
              <div className={s.mailBody}>
                <div className={s.headRow} style={{ alignItems: "baseline" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{who(m)}</span>
                  {m.kind && <span className={s.note} style={{ fontSize: 12 }}>{m.kind}</span>}
                  {m.time && <N className={`${s.push} ${s.faint}`}><span style={{ fontSize: 11 }}>{m.time}</span></N>}
                </div>
                <p className={s.sub} style={{ fontSize: 13 }}><Figures text={m.text} /></p>
                {m.attachment && <span className="es-tag es-tag-mono" style={{ alignSelf: "flex-start" }}>{m.attachment}</span>}
              </div>
              {(m.reading || (m.direction === "out")) && (
                <div className={s.mailRead}>
                  <div className={s.headRow}><Dot tone={tone} /><span className="es-micro">Stockbot read</span></div>
                  <p className={s.botText} style={{ maxWidth: "none" }}><Figures text={m.reading ?? ""} /></p>
                  {asking && last && m.from.includes("ultra") && (
                    <div className={s.btnRow}>
                      <button type="button" className="es-btn es-btn-primary es-btn-sm" onClick={answer} data-focus="inbox.start">Start sourcing</button>
                      <button type="button" className="es-btn es-btn-secondary es-btn-sm" disabled title="The story only plays the path where you start sourcing">Wait</button>
                    </div>
                  )}
                  {confirmed && last && m.direction === "in" && <Stamp word="Confirmed" time={m.time ?? ""} />}
                </div>
              )}
            </article>
          );
        })}
      </div>
      )}
      {!thread.length && st.offers.length < 2 && (
        <div className={s.rows} style={{ padding: "0 14px 14px" }}>
          <div className={s.row}><Dot tone="success" /><span>Lakeview Schools <span className={s.muted}>Delivery received</span></span><span /></div>
          {routinePaid && <div className={s.row}><Dot tone="success" /><span>{routineReorder.supplier} <span className={s.muted}>Invoice paid, <N>{formatUsdShort(st.routine.totalCents)}</N></span></span><span /></div>}
        </div>
      )}
    </Panel>
  );
}
