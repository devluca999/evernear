// @vitest-environment jsdom
// Live on Tidepool testnet: while a money step runs, the Money card says what is happening, with the
// testnet amount (1:1,000), and the next press waits; the wallet says whether the key answered.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { runningText } from "../workspace/Workspace";
import { MoneyPanel } from "../workspace/panels/MoneyPanel";
import { ActionsContext, type WorkspaceActions } from "../workspace/actions";
import { stateAt } from "@/scenario/runner";
import { timeline, HOLD_UNIT } from "@/scenario/scenes";
import { PO } from "@/seed/astro";

afterEach(cleanup);
const base: WorkspaceActions = { openPhoto: () => {}, openProof: () => {}, waiting: null, answer: () => {} };
const money = (live: WorkspaceActions["live"], t: number) => render(
  <ActionsContext.Provider value={{ ...base, live }}><MoneyPanel st={stateAt(t)} pulse={false} /></ActionsContext.Provider>,
);

describe("live status", () => {
  it("says each money step plainly, with the testnet amount", () => {
    expect(runningText("commit", PO.revisedUnitCents)).toBe("Committing $63.00 on Tidepool testnet");
    expect(runningText("advance", PO.revisedUnitCents)).toBe("Releasing the $18.90 advance to Haoyun on Base Sepolia");
    expect(runningText("pay", PO.revisedUnitCents)).toBe("Paying Haoyun the $36.54 balance on Base Sepolia");
    expect(runningText("reclaim", PO.revisedUnitCents)).toBe("Returning $7.56 to Astro on Tidepool testnet");
    expect(runningText("commit", HOLD_UNIT)).toBe("Committing $66.00 on Tidepool testnet");
  });
  it("shows the running step on the Money card while it confirms", () => {
    const lock = timeline.find((b) => b.ev.type === "lock_funds")!;
    money({ on: true, connected: true, note: null, running: "Committing $63.00 on Tidepool testnet" }, lock.atMs - 1);
    const s = screen.getByText("Committing $63.00 on Tidepool testnet").closest("[role=status]")!;
    expect(s.textContent).toContain("Confirming");
  });
  it("shows the wallet from the first frame, connecting then connected in Live", () => {
    money(undefined, 0);
    expect(screen.getByText("Astro's wallet")).toBeTruthy();
    expect(screen.queryByText(/Connecting/)).toBeNull();
    cleanup();
    money({ on: true, connected: null, note: null, running: null }, 0);
    expect(screen.getByText("Connecting")).toBeTruthy();
    cleanup();
    money({ on: true, connected: true, note: "Tidepool testnet · treasury $107.73", running: null }, 0);
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByText(/Tidepool testnet · treasury \$107\.73/)).toBeTruthy();
  });
});
