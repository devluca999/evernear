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
| Haoyun Precision | Shenzhen, China | Motor | Precision motor maker. Fits; opens at +10%, final offer all 50 by Dec 14 at +5%; wins the order |
| QuickShip Motion | Busan, South Korea | Motor | Fast shipping. Fits; opens at +10%, final offer 38 now at +10%, 12 after Dec 14, 5% off the next order |
| Kansai Servo Works | Osaka, Japan | Motor | Fits every spec, but delivers 22 Dec, after Dec 14 (orange on the map) |
| Rheinwerk Antriebstechnik | Stuttgart, Germany | Motor | Fits, but not on the approved list and 2.4x the price cap |
| Huaxin Robotics Components | Dongguan, China | 11 of the 14 BOM lines | Fails 3 lines: motor flange NEMA 23, encoder connector JST-GH, battery pack 36 V |

**Numbers (use exactly these)**

These numbers supersede the earlier ones (Luca, Nov 6 2026). Rules live in `policy/astro.json`.

| Item | Value |
| --- | --- |
| 10MA customer orders | 500, all due to ship by Dec 14 |
| Buildable from parts on hand | 450 |
| Short | 50 AM-17 actuator motors (1 per robot) |
| 10MA selling price | $9,500 |
| AM-17 base price | $1,200 a motor ($60,000 for 50) |
| Urgent ceiling | up to 5% over base to ship on time |
| Rules | auto-approve under $10,000; over that or a new supplier needs 2 approvers |

- Both contenders open at a +10% urgent fee ($1,320). Haoyun's final offer: all 50 by Dec 14 at +5%, $1,260 a motor, **$63,000**. QuickShip's: 38 now at +10% ($1,320, $50,160), the other 12 after Dec 14, 5% off the next order: over the ceiling, and 12 robots late. Stockbot's comparison: the discount is worth about $3,000 on a $60,000 order, but 12 late robots put $114,000 of orders at risk. Luca picks Haoyun.
- Two-stage escrow, same order wallet, same two allowed destinations: commit $63,000 after two approvals; release 1, the advance (30%), **$18,900** once the bill of lading AND export clearance are in; release 2, the balance, once import customs cleared AND the attested dock count: 44 of 50 arrived, 44 x $1,260 = $55,440, minus the advance = **$36,540**; **$7,560** held for 6 missing or damaged motors, paid when replacements arrive or refunded to Astro at the deadline; then the wallet closes (frozen, grant revoked). Check: $18,900 + $36,540 = $55,440; $55,440 + $7,560 = $63,000.
- Bad path: Haoyun also holds at +10%; both over the ceiling; nothing moves. Adjusted: Luca raises the ceiling to 10% with two approvals; Haoyun's all-50 offer goes through at $1,320 ($66,000) with the same two-stage release ($19,800 advance, $38,280 balance, $7,920 held).
- Testnet runs at 1:1,000 and the screen labels it: $63.00 committed, $18.90 advance, $36.54 balance, $7.56 back to Astro. The faucet drips 100 test USDC an hour, so full amounts cannot be funded (decided with Luca, Nov 5 2026).

**People.** Buyer (Luca) texts Stockbot, picks the supplier, photographs the packing slip. Second approver (Jordy) signs on his phone.

## 3. The workspace (the whole demo happens here)

A composable workspace: pinnable panels on one dashboard. A scenario runner snaps panels into a saved layout per scene; nothing is dragged live.

| Panel | Shows |
| --- | --- |
| Demand | Customer orders in, shipments out, motor stock line falling |
| Shipment map (mini) | Shipment moving Shenzhen to Chicago; document icons on the route (jade done, orange in progress, crimson problem) |
| Supplier inbox | Email threads with suppliers, with the agent's reading beside each |
| Order and BOM | 10MA exploded view (Anatomy figure) and per-supplier fitment, mismatches in crimson naming the exact spec |
| Rules and approvals | Live meters: auto-approve under $10K, new supplier needs 2 approvers, price change up to 5%; 2 approval slots |
| Developer drawer | Stripe-style pull-up: the call that just ran, its code path, response, hash and explorer link |
| Phone | Stockbot chat in a generic phone frame (no Apple device art), pull-up only, mirrors the real phone |

Layout rules: at most 3 panels at once; the presenter camera is overlaid top right when recording (no placeholder on screen); the phone docks bottom left and the developer drawer runs from it to the right edge, with a chevron to expand or collapse; the drawer opens about 3 s per proof moment; a panel pulses when a Stockbot message refers to it; a journey rail across the top (Low, Sourcing, Approval, Confirmed, Funds locked, Shipped, Dock, Paid) shows progress as segmented steps.

## 4. Chapters

| # | Chapter | What happens | Proof shown |
| --- | --- | --- | --- |
| 1 | The 10MA | Astro's wallet and rules; the product and its AM-17 actuator motor | Wallet address, policy |
| 2 | The gap | 500 robots ordered for Dec 14, motors for 450; a routine reorder under the cap pays itself | Payment receipt |
| 3 | Ultra's reply | Out for 6 weeks; Luca starts sourcing | — |
| 4 | Search | Five suppliers against the BOM and Dec 14: Haoyun and QuickShip fit, Kansai is late, Rheinwerk and Huaxin fail | Private-inference attestation |
| 5 | Negotiation | Two email threads side by side; both ask +10%; Stockbot counters within 5%; Haoyun +5% all 50, QuickShip 38 now at +10%; Luca picks Haoyun | Connector receipt; refused email to an off-list address |
| 6 | Approve and commit | $63,000 and a new supplier: 2 approvals, then the commit into this PO's own Agent API account (1:1,000) | Approval records; PO account policy and the commit |
| 7 | Shenzhen to the Chicago dock | Bill of lading and export clearance release the $18,900 advance; import customs and the attested count (44 of 50) release the $36,540 balance; $7,560 held | Signals; attestation over code, input, output; both payouts |
| 8 | Paid | A withdraw to a wrong address refused live; what the escrow protected; the held $7,560 back to Astro at the deadline; the wallet closes | The refusal; Base Sepolia txs; wallet closed |
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

Simulated, and named so in the README: Astro, its customers (`scenarios/demand.ts`), and the suppliers (`scenarios/suppliers.ts` replies from each supplier mailbox with fixture text and PDFs). The negotiation is not canned: the simulator sends Haoyun's +5% all-50 offer only if the agent's counter stayed within the 5% ceiling; QuickShip answers with 38 now at +10% and the rest late. Shipment signals come from a simulated tracking feed (`scenarios/tracking.ts`).

## 8. Acceptance checks (each is a test)

- Routine reorder under the cap pays with no human step.
- Fitment: Haoyun and QuickShip pass, Kansai is too late, Rheinwerk fails on policy, Huaxin on exactly 3 lines.
- No leak: no plain-text BOM or supplier list in any outbound call except to private inference.
- Approval: the $63K order cannot commit funds before 2 approvals.
- Ceiling: +10% stops; +5% passes; QuickShip's final offer is flagged as over the ceiling.
- Off-list email is refused by the connector policy.
- Two-stage release: the advance is refused without the bill of lading; the balance is refused without import customs or without the attested count; 44 of 50 releases exactly $18,900 + $36,540 and holds $7,560; the wallet never pays out more than $63,000.
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
