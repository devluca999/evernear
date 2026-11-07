// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { Explorer } from "../workspace/Drawer";
import { Workspace } from "../workspace/Workspace";
import { SCENARIOS } from "@/scenario/scenes";
import type { Proof } from "@/scenario/types";

afterEach(() => { cleanup(); localStorage.clear(); window.history.replaceState(null, "", "/"); });
const BASE = "0x5d8dab61c8c5cffd8339041ec581d8b23faffc3fc1f291a914e170511935973b";
const proof = (o: Partial<Proof>): Proof => ({ id: "x", scene: 6, kind: "payout", label: "Advance paid", call: "", codePath: "", network: "testnet", hash: BASE, explorerUrl: null, response: null, replay: false, synthetic: false, ...o });

describe("explorer button", () => {
  it("opens the transaction in a new tab, with the network and the short hash beside it", () => {
    render(<Explorer p={proof({})} />);
    const a = screen.getByRole("link", { name: "View on Basescan" });
    expect(a.getAttribute("href")).toBe(`https://sepolia.basescan.org/tx/${BASE}`);
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText(/Base Sepolia/).textContent).toContain("0x5d8dab…5973b".slice(0, 9));
  });
  it("is no link at all on a synthetic or refused entry, or while the hash is not known", () => {
    render(<><Explorer p={proof({ synthetic: true })} /><Explorer p={proof({ kind: "refusal" })} /><Explorer p={proof({ hash: "" })} /></>);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("Refused, nothing sent")).toBeTruthy();
    expect(screen.getByText("Confirming")).toBeTruthy();
  });
});

describe("the drawer's history in replay", () => {
  it("shows the recorded run's buttons under each entry, and keeps the whole run", async () => {
    window.history.replaceState(null, "", "/?drawer=1");
    render(<Workspace initialMs={SCENARIOS.happy.totalMs - 1} autoplay={false} />);
    const steps = await screen.findByRole("navigation", { name: "Steps so far" });
    const links = within(steps).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(expect.arrayContaining(["View on Basescan", "View on NearBlocks"]));
    for (const a of links) expect(a.getAttribute("href")).toMatch(/^https:\/\/(sepolia\.basescan\.org\/tx\/0x[0-9a-f]{64}|testnet\.nearblocks\.io\/txns\/[1-9A-HJ-NP-Za-km-z]{43,44})$/);
    expect(within(steps).getAllByText("Refused, nothing sent").length).toBe(2);
  });
});
