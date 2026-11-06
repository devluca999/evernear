// Inbox: supplier email with Stockbot's reading of each one beside it. The model only reads and
// drafts; what it may agree to is checked against the rules in code. A decision the story waits
// for can be answered here (Start sourcing).
import type { Message, WorkspaceState } from "@/scenario/types";
import { PO, routineReorder, suppliers } from "@/seed/astro";
import { formatUsd, formatUsdShort } from "@/engine/money";
import { useActions } from "../actions";
import { Dot, N, Panel, Stamp } from "../Panel";
import s from "../shell.module.css";

const SENDER: Record<string, string> = { "orders@ultra-motion.example": "Ultra Motion", "sales@haoyun-precision.example": "Haoyun Precision" };
const who = (m: Message) => (m.direction === "out" ? m.from : SENDER[m.from] ?? m.from);

/** Figures in an email render in Geist Mono. */
function Figures({ text }: { text: string }) {
  const parts = text.split(/(\$[\d,]+(?:\.\d+)?|[+]?\d[\d,.]*%?(?: Nov| Dec)?)/g);
  return <>{parts.map((x, i) => (i % 2 ? <N key={i} className={x.startsWith("$") || x.startsWith("+") ? s.hi : undefined}>{x}</N> : x))}</>;
}

const THREAD_ORDER = ["haoyun", "rheinwerk", "huaxin"];
const TONE = { success: "success", attention: "attention", alert: "alert" } as const;

/** Negotiation: one column per supplier with an offer, Haoyun's thread in full beside the others. */
function Threads({ st, thread }: { st: WorkspaceState; thread: Message[] }) {
  const cols = THREAD_ORDER.map((id) => st.offers.find((o) => o.supplierId === id)).filter((o) => o !== undefined);
  return (
    <div className={s.threads} data-focus="negotiation.threads">
      {cols.map((o) => {
        const sup = suppliers.find((x) => x.id === o.supplierId)!;
        const mine = o.supplierId === "haoyun";
        return (
          <section key={o.supplierId} className={s.thread} data-main={mine} aria-label={`${sup.name} offer`} data-focus={mine ? "negotiation.haoyun" : undefined}>
            <div className={s.headRow} style={{ alignItems: "baseline" }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{sup.name}</span>
              <span className={`${s.note} ${s.push}`} style={{ fontSize: 12 }}>{sup.city}</span>
            </div>
            <div className={s.headRow} style={{ gap: 8 }}>
              <N><span style={{ fontSize: 22, fontWeight: 500 }}>{formatUsd(o.unitCents)}</span></N>
              <span className={s.note} style={{ fontSize: 12 }}>a unit</span>
            </div>
            <span className={s.line} style={{ fontSize: 12.5 }}><Dot tone={TONE[o.tone]} />{o.note}</span>
            {mine && thread.map((m) => (
              <div key={m.id} className={s.threadMail}>
                <div className={s.headRow} style={{ alignItems: "baseline" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{who(m)}</span>
                  {m.kind && <span className={s.note} style={{ fontSize: 12 }}>{m.kind}</span>}
                  {m.time && <N className={`${s.push} ${s.faint}`}><span style={{ fontSize: 11 }}>{m.time}</span></N>}
                </div>
                <p className={s.sub} style={{ fontSize: 12.5 }}><Figures text={m.text} /></p>
                {m.reading && <p className={s.botText} style={{ fontSize: 12, maxWidth: "none" }}><span className="es-micro">Stockbot read </span><Figures text={m.reading} /></p>}
              </div>
            ))}
          </section>
        );
      })}
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
      {st.offers.length >= 2 ? <Threads st={st} thread={thread} /> : (
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
                      <button type="button" className="es-btn es-btn-primary es-btn-sm" onClick={answer}>Start sourcing</button>
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
