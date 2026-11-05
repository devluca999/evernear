# Evernear build brief

This is the spec the repo is built from. It is public-safe: it describes what Evernear does, never how Everstock's private product works.

## 1. The story

Astro Robotics Inc. is a mid-market robot maker in Chicago. Customers keep ordering its flagship helper robot, the 10MA, but few suppliers make its actuator motor. The local supplier, Ultra Motion, is out for 6 weeks, and overseas sourcing has meant weeks of email, wires and guesswork. Demand is outrunning supply.

Evernear is an agent that sources the motor, checks it fits, negotiates, commits the money, checks what actually arrived and pays the supplier on its own chain. Astro's money stays in Astro's own wallet until the goods arrive; Evernear never holds funds.

## 2. Cast, products and parts

**Products** (switchable in the dashboard; only the 10MA is played out): 10MA (helper robot), Kip (floor-cleaning robot), Porter (factory delivery cart). All are original designs. No Astro Boy or Ultraman likeness, art or logos anywhere.

**The part.** 10MA actuator motor, BOM line spec:

| Spec | 10MA requires |
| --- | --- |
| Shaft diameter | 6 mm |
| Mounting flange | NEMA 17 |
| Voltage | 48 V |
| Encoder connector | Molex |

The 10MA BOM has 14 lines in total; seed the other 13 with plausible parts (frame, arm servo, battery pack 48 V, controller board, camera module, and so on).

**Suppliers**

| Supplier | Where | Offers | Outcome |
| --- | --- | --- | --- |
| Ultra Motion | Illinois, USA | Motor | Usual supplier; routine reorder passes, then out for 6 weeks |
| Haoyun Precision | Shenzhen, China | Motor | Fits and passes policy; wins the order |
| Kansai Servo Works | Osaka, Japan | Motor | Fails fitment: 8 mm shaft |
| Rheinwerk Antriebstechnik | Stuttgart, Germany | Motor | Fits, but not on the approved list and 2.4x the price cap |
| Huaxin Robotics Components | Dongguan, China | 11 of the 14 BOM lines | Fails 3 lines: motor flange NEMA 23, encoder connector JST-GH, battery pack 36 V |

**Numbers (use exactly these)**

- Order: 2,000 motors. Original quote $18.54 each.
- Haoyun's confirmation comes back at +8% ($20.02). Buyer's limit: +3%. Revised at +2.5%: $19.00 each, **$38,000 total**.
- Dock: 1,800 of 2,000 arrive. Release **$34,200**, hold **$3,800**.
- Testnet runs at 1:1,000 and the screen labels it: $38.00 committed, $34.20 paid, $3.80 back to Astro. The faucet drips 100 test USDC an hour, so full amounts cannot be funded (decided with Luca, Nov 5 2026).

**People.** Buyer (Luca) texts Stockbot, sets the 3% limit, photographs the packing slip. Second approver (Jordy) signs on his phone.

## 3. The workspace (the whole demo happens here)

A composable workspace: pinnable panels on one dashboard. A scenario runner snaps panels into a saved layout per scene; nothing is dragged live.

| Panel | Shows |
| --- | --- |
| Demand | Customer orders in, shipments out, motor stock line falling |
| Shipment map (mini) | Shipment moving Shenzhen to Chicago; document icons on the route (jade done, orange in progress, crimson problem) |
| Supplier inbox | Email threads with suppliers, with the agent's reading beside each |
| Order and BOM | 10MA exploded view (Anatomy figure) and per-supplier fitment, mismatches in crimson naming the exact spec |
| Rules and approvals | Live meters: auto-approve under $10K, new supplier needs 2 approvers, price change up to 3%; 2 approval slots |
| Developer drawer | Stripe-style pull-up: the call that just ran, its code path, response, hash and explorer link |
| Phone | Stockbot chat in a generic phone frame (no Apple device art), pull-up only, mirrors the real phone |

Layout rules: at most 3 panels at once; the presenter camera has a fixed bottom-right corner no layout covers; the drawer opens about 3 s per proof moment; a panel pulses when a Stockbot message refers to it; a journey rail across the top (Low, Sourcing, Approval, Confirmed, Funds locked, Shipped, Dock, Paid) shows progress as segmented steps.

## 4. Scenes

| # | Scene | What happens | Proof shown |
| --- | --- | --- | --- |
| 0 | Onboarding | Astro signs up; its wallet appears; owner keys stay with Astro; the agent gets a capped key | Wallet address, policy |
| 1 | Bottleneck | Orders arrive, stock falls: "14 robots ordered, motors for 6"; Ultra is out | — |
| 2 | Routine reorder (8 s) | A small Ultra reorder under the cap runs green end to end | Payment receipt |
| 3 | Sourcing and fitment | 4 alternatives scanned against the BOM; 3 fail with the exact spec; Haoyun passes | Private-inference attestation |
| 4 | Approval | $38K and a new supplier: over the cap, 2 approvals needed; both arrive | Approval records |
| 5 | Negotiation | +8% arrives; buyer says "up to 3%"; agent counters by email; +2.5% revision passes | Connector receipt; refused email to an off-list address |
| 6 | Funds committed | $38,000 (at 1:1,000) moves into this PO's own Agent API account, visible to Haoyun | PO account policy and the commit transfer |
| 7 | Dock | Packing-slip photo: 1,800 of 2,000; attested dock check computes $34,200 | Attestation over code, input, output |
| 8 | Paid | Release to Haoyun on Base Sepolia; $3,800 back to Astro; a withdraw to a wrong address is refused live by the account's policy | Base Sepolia tx and explorer link; the refusal |
| 9 | End card | "0 wires. 0 days waiting. 1 human decision." + repo link | — |

## 5. Architecture

Next.js app, Convex backend (live queries drive every panel and the phone), deployed on Vercel.

| Component | Built on | Network | File |
| --- | --- | --- | --- |
| Astro's wallet and owner policy (caps, whitelist, approval threshold) | OutLayer agent custody | Testnet | `convex/near/custody.ts` |
| Approvals over the cap | OutLayer approvals | Testnet | `convex/near/approval.ts` |
| Per-PO escrow | One NEAR Intents Agent API account per PO, owned by Astro's dedicated testnet owner; policy `destinations: only` [withdraw to the supplier's address on Base Sepolia, transfer to Astro's treasury], per transaction at most the PO amount, `frozen` as the kill switch; funded from Astro's treasury, which the faucet tops up. Accounts are pooled and reused | Testnet (Tidepool) | `convex/near/escrow.ts`, `convex/near/agentapi.ts` |
| Deadline refund | A scheduled Convex job at the deadline returns whatever is still held to Astro | Testnet (Tidepool) | `convex/near/deadline.ts` |
| Supplier email out | OutLayer Gmail connector, recipient allowlist; Reply-To on the demo domain | Testnet | `convex/near/gmail.ts` |
| Supplier email in | Inbound email webhook to a Convex HTTP action | n/a | `convex/channels/email.ts` |
| Document reads (offers, invoices, slips) | NEAR AI Cloud private inference, attestation kept per read | n/a | `convex/near/inference.ts` |
| Attested dock check | OutLayer WASI P2 module; the release secret is bound to its `--wasm-hash` | Testnet | `worker/dock-check/` |
| Payout | Agent API withdraw of the released amount to the supplier on Base Sepolia, then a transfer of the held part back to Astro | Testnet (Tidepool) | `convex/near/escrow.ts` |
| Stockbot | Telegram Bot API, DM only | n/a | `convex/channels/telegram.ts` |

**The reference engine** (`engine/`): one typed interface (`readDocument`, `scoreFitment`, `matchReceipt`, `classifyReply`) with a deliberately plain implementation: fitment is exact spec equality per BOM line; receipt matching is received qty x unit price, hold the rest; replies sort into quoted, confirmed, price change. Amounts and thresholds are computed in code only; models read documents and draft emails, nothing more.

**Honest limit (README must state it):** the owner can always change the policy or withdraw, so the escrow is a visible, rule-bound commitment to the supplier, not a lock the supplier can enforce. On Tidepool the rules are enforced by Tidepool's server, not by the chain, and Astro's owner key can sign a policy change or unfreeze at any time. The screen stamps it "Committed" and the video script says so.

**Tidepool** (https://www.usetidepool.tech) is a community-run testnet of the NEAR Intents Agent API and 1Click, not affiliated with NEAR; it runs NEAR's Intents verifier on testnet. The official SDK points at it by `baseUrl` (`AGENT_API_BASE_URL`), so mainnet is a base URL switch, and only with Luca's explicit yes.

## 6. Data model (Convex tables)

`companies`, `products`, `bomLines` (product, part, qty, specs), `suppliers` (name, city, country, approved, receive chain and address), `offers` (supplier, part, price, specs, fitment per spec), `restocks` (product, part, stage, unit price, quantity, total, held), `messages` (channel, direction, text, photo, restock), `approvals`, `proofs` (restock, scene, kind, hash, explorer url, code path, network, replay flag).

Stages: `low`, `sourcing`, `approval`, `confirmed`, `funds_locked`, `shipped`, `dock`, `paid`, `closed`.

## 7. Modes

| Mode | Needs | Use |
| --- | --- | --- |
| `DEMO_MODE=1` | Nothing | AI screeners on a machine with no keys; replays recorded responses, labelled "replay" on screen |
| Testnet | OutLayer testnet key, NEAR AI key, a Tidepool key with Astro's testnet owner and treasury, Convex | Development, rehearsal and the recorded demo |
| Mainnet (optional, later) | `AGENT_API_BASE_URL` switched to the mainnet Agent API, with Luca's explicit yes | Not used; no real assets are sent anywhere |

Simulated, and named so in the README: Astro, its customers (`scenarios/demand.ts`), and the suppliers (`scenarios/suppliers.ts` replies from each supplier mailbox with fixture text and PDFs). The negotiation is not canned: the simulator sends the +2.5% revision only if the agent's counter stayed within the 3% limit.

## 8. Acceptance checks (each is a test)

- Routine reorder under the cap pays with no human step.
- Fitment: Kansai fails on shaft, Rheinwerk on policy, Huaxin on exactly 3 lines, Haoyun passes.
- No leak: no plain-text BOM or supplier list in any outbound call except to private inference.
- Approval: the $38K order cannot commit funds before 2 approvals.
- Price limit: +8% stops; +2.5% passes; +4% would not.
- Off-list email is refused by the connector policy.
- Short shipment: 1,800 of 2,000 releases exactly $34,200 and holds $3,800.
- Three exits only: a release to any address but Haoyun's or Astro's is refused, in code and live by the PO account's policy (shown in the drawer).
- Deadline: no release by the deadline refunds Astro; after a partial release, the unreclaimed held part goes back to Astro.
- Attested release: a release request not from the approved dock-check build is refused.
- Phone sync: a Telegram message shows on the virtual phone within 1 s.
- Clean clone: `DEMO_MODE=1 npm run demo` runs with no keys.

## 9. README contract

Two-sentence summary; how to run each mode; a table mapping each scene to its NEAR call, file and test; what is simulated; that Everstock's production engine is private and Evernear ships a reference engine; the honest escrow limit; that every NEAR call runs on testnet, the escrow and payout on Tidepool (community-run, not affiliated with NEAR) at 1:1,000, and that mainnet is a base URL switch; credit to Anatomy (MIT). Every claim links to the file that does it and the test that proves it; a claim with no test is removed.

## 10. Visual design

Follow Everstock's V2 design system (Luca adds the token file). Until then, use these values as CSS variables:

- Dark: warm graphite `#16171B` (never navy). Light: warm eggshell `#FAF7F1` (never pure white). Render both.
- Colour is state, never category: blue = working, orange `#D97A2B` = needs you, jade = done, crimson = failed or human required.
- Inter for UI; every figure in Geist Mono with tabular figures.
- Flat opaque surfaces, a hairline border, one soft two-stop shadow. No glass, glow, grain or gradients.
- Uppercase only in micro-labels. No spinners or percentage progress: segmented steps only.
- Voice: no exclamation marks, no emoji, no em or en dashes.
