import type { WorkspaceState } from "@/scenario/types";
import { Panel } from "../Panel";
import { Led } from "../Led";
import s from "../workspace.module.css";

export function InboxPanel({ st, pulse }: { st: WorkspaceState; pulse: boolean }) {
  const mail = st.messages.filter((m) => m.channel === "email");
  const refusedMail = st.refused.filter((r) => r.kind === "offlist_email");
  return (
    <Panel id="inbox" title="Supplier inbox" pulse={pulse}>
      {mail.length === 0 && <p className={s.empty}>No supplier mail yet</p>}
      <ul className={s.mail}>
        {mail.map((m) => (
          <li key={m.id} className={s.mailItem}>
            <div className={s.mailMain}>
              <div className={s.mailHead}><span className={s.mailFrom}>{m.direction === "out" ? `To ${m.to}` : m.from}</span><span className={s.mailSubj}>{m.subject}</span></div>
              <p className={s.mailText}>{m.text}</p>
            </div>
            {m.reading && (
              <aside className={s.reading}>
                <span className={s.micro}>AGENT READING</span>
                <p><Led tone={/over|unavailable/.test(m.reading) ? "attention" : "success"} />{m.reading}</p>
              </aside>
            )}
          </li>
        ))}
        {refusedMail.map((r) => (
          <li key={r.atMs} className={`${s.mailItem} ${s.refusedRow}`}><Led tone="alert" />Refused: {r.detail}</li>
        ))}
      </ul>
    </Panel>
  );
}
