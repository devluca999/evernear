# NEAR HACKATHON: rules, field and positioning for Evernear

> **Superseded in part (Nov 14, later):** [COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md) audits the entries' code and contracts. Corrections to this file: Accord has a repo (`Pelz01/accord`) and a mainnet partial settlement, not "no NEAR mechanism or proof"; Fulfil's linked repo now returns 404 and was audited from its contracts on chain; and pro-rata payment for a partial delivery is not unique to Evernear (Accord and Day One do it).

Researched 2026-11-14 around 03:00 UTC, about 21 hours before development ends. Sources: [nearhackathon.com](https://nearhackathon.com/), [HACKATHON.md](https://nearhackathon.com/HACKATHON.md) (live copy read today), [near-hackathon-prompt-examples](https://github.com/nearai/near-hackathon-prompt-examples), the site's public project directory (`GET https://nearhackathon.com/api/projects?page=N`, the feed behind the "Explore the builds" section), each entry's demo post on X (read through the public fxtwitter mirror), and the public READMEs of the repos those posts link. Nobody watched any demo video. "Not found" means the item was searched for and not located.

## 1. Rules and deadline

### The important finding first: Evernear is already submitted

The public directory lists an entry **everNEAR**. Its tracks are `privacy`, `business`, `agents`, `realworld` and `open`. Its demo post is [x.com/Saasquatch_/status/2120201211718553774](https://x.com/Saasquatch_/status/2120201211718553774), posted Nov 10 17:05 UTC with a video attached (7 likes, 135 views at read time). The post links `https://github.com/devluca999/evernear`.

- **Do not submit again.** HACKATHON.md allows one submission per project. A second POST with the same repository returns 409. Any fix goes through [request-changes](https://nearhackathon.com/request-changes), where the organizers review it by hand.
- **`security` is not among the submitted tracks.** `docs/NOTES.md` planned `privacy`, `business`, `security` and `realworld`. Adding `security` through request-changes is the human's decision. It is a track change, which request-changes allows ("a wrong repository or demo link, wallet, email, track or anything else").
- **Remote repo state.** The repo is public, the default branch is `main`, the licence is MIT, and the last push was **2026-11-10T20:34Z** (`gh api repos/devluca999/evernear`). Judges and the AI screen will read that pushed state, not local work. The README status line is still dated Nov 6.

### Dates (all UTC) — [HACKATHON.md, "Facts"](https://nearhackathon.com/HACKATHON.md)

| Event | Time |
| --- | --- |
| Hackathon announced (code from here counts, Q-001) | 2026-10-19 |
| Hackathon starts, submissions open | 2026-11-01T00:00:00Z |
| **Development ends and submissions close** | **2026-11-14T23:59:00Z** |
| Judging starts | 2026-11-16T00:00:00Z |
| Results announced by | 2026-11-18T23:59:00Z |
| Hosted demo should stay up until (Q-012) | at least 2026-11-18, ideally 2026-11-25 |
| Prize payout (Q-016) | single payment in NEAR within 30 days of results |

Outside the submission window the API answers 403. The repository must be public by the deadline, and it must stay public through judging (Q-014).

### Rules that matter to Evernear ([HACKATHON.md, "Rules"](https://nearhackathon.com/HACKATHON.md))

- **Q-007:** NEAR Intents has no testnet, and none is planned. The organizers say to use mainnet with separate dev accounts, tiny amounts and `dry: true` quotes. Tidepool is a community testnet that is not affiliated with NEAR, and it is also an entry in this hackathon ([Tidepool, `open` track](https://x.com/priva_cie/status/2116726168930168843)).
- **Q-010:** projects that run only on testnet are eligible in every track. Mainnet is required only where an integration exists only on mainnet.
- **Q-011:** no integration is mandatory. The track hints are hints.
- **Q-012:** a demo that runs only locally is fine if the repo is public, the README is reproducible and the X post has a video. Screenshots alone are not enough when judges cannot open the demo. A hosted demo is a plus.
- **Q-014:** any licence is allowed. Add a LICENSE file (Evernear has MIT).
- **Q-015:** one person may enter at most 2 independent projects, and each README must name the other.
- **Q-017:** Claude Code and Codex screen every project. They run a reproducibility check and a feature check, write a structured report and give a preliminary score. Humans decide, and a low AI score alone cannot reject a project.
- **Q-002 to Q-005:** only work built in the window is judged. Disclose libraries, templates and AI-written code in the README.
- **Q-006:** a 1Click JWT is optional. Without one there is a 0.2% fee.

### Prizes ([HACKATHON.md, "Prizes"](https://nearhackathon.com/HACKATHON.md))

The pool is $250,000, paid in NEAR at fixed USD amounts.

| Prize | Amount | Count |
| --- | --- | --- |
| Grand prize | $55,000 | 1 |
| 1st place per track | $10,000 | 13 |
| 2nd place per track | $3,000 | 13 |
| 3rd place per track | $2,000 | 13 |

Each track is judged separately, so entering several tracks gives several chances.

### Eligibility

Developers, designers and "people with ideas for the NEAR ecosystem" can enter ([site FAQ](https://nearhackathon.com/)). There is no sign-up and no wallet connection; the final submission is the registration. Team size options are `1`, `2 - 4`, `4 - 6`, `6 - 8` and `8+`. One submission per project. Each repository can be submitted once, and each email has at most 2 submissions. No rules on country or age were found.

### Tracks relevant to Evernear ([HACKATHON.md, "Tracks"](https://nearhackathon.com/HACKATHON.md), prompts in [near-hackathon-prompt-examples/tracks](https://github.com/nearai/near-hackathon-prompt-examples/tree/main/tracks))

| id | Track | Official definition | Hints | What the example prompt asks for |
| --- | --- | --- | --- | --- |
| `business` | Autonomous Business | "AI-native businesses with treasury, sales, procurement, cross-chain payments via NEAR Intents and revenue sharing. Humans only set the constraints." | AI agents, NEAR Intents, Chain Signatures | Rules in one config file. A kill switch. The agent has its own NEAR account through OutLayer custody or a scoped function-call key, never a plaintext full-access key. A public ledger of every sale, cost and payout. A demo mode that runs a full loop on testnet in under 2 minutes. Links to the Agent API and OutLayer ([04-business.md](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/04-business.md)) |
| `security` | AI Security & Defense | "Spending limits, policy engines, sandboxed wallets, reputation and scam detection. Give AI money without giving it the keys to everything." | Agent security, function-call keys, TEE attestation | A wrapper that refuses to sign on block. A function-call key scoped to one contract, with its limits explained in the README. An attack demo script in which a prompt-injected agent tries to pay a bad address, is stopped, and the log is shown ([06-security.md](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/06-security.md)) |
| `agents` | Agent Economy | "Agents that earn, spend, negotiate, hire other agents and pay for APIs, compute or data." | Agent commerce, NEAR Intents, Chain Signatures | Negotiation: counter once with reasoning, then accept or walk away. Payments in USDC or NEAR. A receipt per task saying what was bought, from whom, at what price and whether it passed the check. Explain key custody first. The Agent API gives a policy-bound wallet, with demo keys at `api.demo.agentsonintents.com` ([07-agents.md](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/07-agents.md)) |
| `realworld` | Real-World Money | "Payroll, invoicing, remittances, merchant payments and stablecoin rails for real businesses. Something a normal company could use tomorrow." | Stablecoins, NEAR Intents, meta transactions | Payment through 1Click, gasless for the payee, status links to transactions, a CSV an accountant can open, and a README written for a bookkeeper ([08-realworld.md](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/08-realworld.md)) |
| `privacy` | Privacy & Private AI | "Confidential computation, private finance and AI that protects sensitive data." | Private AI, TEE, NEAR AI Cloud | Fetch the NEAR AI Cloud attestation with a fresh nonce, verify it, and show a "Verified" panel. Keep nothing server-side. Ship fictional sample docs ([03-privacy.md](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/03-privacy.md)) |

## 2. Judging criteria

**No official criteria or weights are published.** The weights were not found on the site, in HACKATHON.md or in the prompt-examples repo. The only statements are:

- **Site FAQ, "How will projects be judged?"** "Claude Code & Codex screen every project first: they check that it runs and does what the README says. The human judges above make the decisions. Previous NEAR hackathons evaluated **technical implementation, design, impact, originality and sustainability** — a good guide to prepare by." ([nearhackathon.com](https://nearhackathon.com/))
- **Q-017.** The AI screening covers "reproducibility check, feature verification, structured report, preliminary score". Humans decide, and a low AI score alone cannot reject a project.
- **Procedure step 1.** Write the README "for a machine reader as well as a human one", with "do X - see Y" steps and no marketing.
- **Track text.** Some tracks state their own lens: Thesis is "judged on the evidence", Games and Memecoins are "judged on the game loop / mechanic". None of the tracks Evernear entered has one.
- **Judges** ([site](https://nearhackathon.com/#judges)): Illia Polosukhin (NEAR), Eddy Lazzarin (a16z crypto), Mert Mumtaz (Helius), Avichal Garg (Electric Capital), Kain Warwick (Synthetix & Infinex), Haseeb Qureshi (Dragonfly), Stepan Gershuni (cyber•Fund), plus Claude Code & Codex.

In practice, the first gate is a machine check that each claim in the README actually runs. After that, humans judge on the five criteria from previous hackathons.

## 3. Submission checklist (official requirements)

Sources: [HACKATHON.md](https://nearhackathon.com/HACKATHON.md) "Start here", "What the human decides" and "Submission API"; [SUBMITTING.md](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/SUBMITTING.md).

| Requirement | Evernear status |
| --- | --- |
| Public repository by 2026-11-14T23:59Z, public through judging | Public; last push Nov 10. Push current work before the deadline (human's call) |
| README with "do X, see Y" steps a machine can follow | Present ("Run it" table). Check it against the pushed code |
| LICENSE file | MIT present |
| No keys or secrets anywhere in repo history | Not checked here. Run a secret scan before the final push |
| Disclose libraries, templates, AI code and pre-hackathon baseline (Q-002 to Q-005) | Check the README |
| Demo post on X: says "built at NEAR HACKATHON", tags @NEARProtocol and #NEARHackathon, attaches a video or screenshots (a video if judges cannot open the demo) | Done Nov 10 ([post](https://x.com/Saasquatch_/status/2120201211718553774)), video attached, both tags present. It predates the Nov 10 to 14 work. A follow-up reply with a newer video is optional |
| Submission (form or API) with project name, lead, email, team size, tracks, mainnet NEAR payout account, repo URL, demo URL, idea (20-2000 characters), consent | **Already submitted.** Fix anything only through [request-changes](https://nearhackathon.com/request-changes) |
| Hosted demo (optional plus) up to Nov 18, ideally Nov 25 | No hosted demo was found in the post or the README; Vercel was blocked in LEDGER row H |
| If a team member entered a second project, each README names the other (Q-015) | Nothing found that links the Evernear post (@Saasquatch_) to any other entry. The human should confirm this |

## 4. Competitor field

The directory holds **1,200 confirmed submissions** (`total: 1200`, read 2026-11-14 about 03:00 UTC, 150 pages of 8). Entries by track: security 538, agents 506, open 280, realworld 280, privacy 245, business 218, defi 202, swarms 139, social 124, games 120, nfts 120, memecoins 94, thesis 80. Entries can carry several tracks.

The directory exposes only the name, tracks and demo URL. The judge-facing repo link is not public, so every repo below is the one the team's own demo post links.

The search covered:
- project names matched against about 40 keywords: procurement, supplier, invoice, escrow, treasury, spend, guard, policy, TEE, attest, settle, deliver and similar;
- the directory's own search for procurement, supplier, delivery, escrow, outlayer, tidepool, invoice and shipment;
- the X demo-post text of every `business` and `realworld` entry (402 names), matched against procurement, delivery, escrow and TEE terms.

### What the field looks like

- **Agent spending firewalls are crowded.** About 100 entries are named some variant of Guard, Leash, Allowance, Veto or SpendGuard. The common pattern is a NEAR contract, a function-call key that can call only `pay` or `spend`, caps and an allowlist, owner approval, and a prompt-injection demo. This pattern alone will not stand out.
- **The strong entries add a verifier.** Veto adds a TEE-signed AI screen checked on-chain. Clear to Pay adds a PO match plus delivery signatures. Proven adds an executable check in OutLayer. Fulfil adds OutLayer TEE proof of a real-world purchase. Several also run on **mainnet**.

### Confirmed submissions (listed in the official directory), closest to Evernear first

Evidence column: **post** means the team's X post claims it; **README** means their repo README says it; **tx** means the post or README links an explorer transaction (not opened here). Demo quality is what the post shows: whether a video is attached, plus likes and views at read time. No video was watched.

| Entry (handle) | Tracks | What it does | What actually runs (evidence) | NEAR depth | Policy enforcement | On-chain proof | Demo |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Clear to Pay** ([@joezzyweb3](https://x.com/joezzyweb3/status/2119220897345122339), [repo](https://github.com/joezzy-web3/clear-to-pay)) | privacy, business, agents, realworld | **The closest story to Evernear.** An invoice is paid only if it matches the PO at PO prices, two people in two roles signed the delivery, the supplier signed the invoice, the payee was registered at least 72 hours earlier, and it has not been paid before. The AI reads the PDF inside an OutLayer TEE | Rust contract on NEAR testnet; the reader runs in OutLayer TEE ("experimental"); cross-chain payout via NEAR Intents **on testnet via Tidepool**; 11 attacks, 0 paid versus 9 for an allowlist; 392 tests; MCP server (post, README, tx) | Own contract, OutLayer, Tidepool Intents, MCP | On-chain contract rules | Testnet tx links in README | Video, 106 likes, 2,020 views; hosted console, no wallet needed |
| **Veto** ([@sentinel_dapper](https://x.com/sentinel_dapper/status/2119799385798185178), [repo](https://github.com/0xdopewilly/veto)) | privacy, business, security, agents, realworld, open | A second signer that can only say no. A Qwen3-VL model in the NEAR AI Cloud TEE reads the invoice and evidence and signs PASS or VETO, and the vault verifies the signature on-chain with ecrecover. A public 100-payment bench: cap plus allowlist catches 33/50 attacks, Veto 50/50 | Testnet vault; Base payouts via Chain Signatures; **NEAR Intents Agent API on mainnet with real USDC** (9 cents); OutLayer approver; browser-side proof pages; `check-deployed.ts` byte-matches contracts (post, README) | NEAR AI Cloud TEE, own contract, Chain Signatures, Agent API mainnet, OutLayer | On-chain caps plus signed verdict; time-locked overrides | Per-decision proof pages, reproducible bench | Video, 97 likes, 3,350 views; hosted "Try it" |
| **Fulfil: NEAR Intents for real-life orders** ([@cuongdc_real](https://x.com/cuongdc_real/status/2121286811813298337)) | defi, business, security, agents, realworld, open | Buy a physical item (pho) with crypto. A local pays the shop, the OutLayer TEE checks the proof, and the escrow pays | "**Live on mainnet** – real USDC + 100+ assets via NEAR Intents" (post only) | Intents mainnet, OutLayer TEE | Escrow released on TEE-checked proof | Not seen | Video, 25 likes, 813 views. Repo **not found** (not in the post; GitHub and web search found nothing) |
| **Proven: pay for what passes** ([@Stephenololade](https://x.com/Stephenololade/status/2121350647454847046), [repo](https://github.com/Ololadestephen/Proven)) | swarms, security, agents | Escrowed agent and PR bounty jobs. The buyer's executable check must catch planted fakes before the job opens. Payout or refund follows from the attested OutLayer run | **Mainnet**: PR bounty paid (OutLayer runs 3000 and 3001), job 6 paid after attested run 3005, a refund. "One command reads every result back from mainnet" (post) | Own contracts, OutLayer attested runs, custody wallets, 27 MCP tools | Contract pays only on the attested verdict | Mainnet results with run IDs | Video, 8 likes, 429 views; hosted app |
| **Day One: AI Purchasing for Acquired Manufacturing Plants** ([@CoderofVibes](https://x.com/CoderofVibes/status/2121303854788857875), [repo](https://github.com/CoderofVibes/day-one)) | business, security, agents, realworld, open | Plant purchasing: agents read the paperwork and buy within limits enforced by a NEAR contract; sealed-bid round; reconcile against a mock ERP | Testnet spend-policy contract with tx links for refusal, approval, funded retry, and QC release and payment; NEAR AI attestation check; the README labels the plant, supplier replies, staff keys and test token as fictional or simulated (README, tx) | Own contract, NEAR AI Cloud | Contract caps and approvals; release on QC | Testnet tx chain | Video, 0 likes, 13 views (posted Nov 13). The same handle also entered Everstreet |
| **Accord** ([@pelz0x](https://x.com/pelz0x/status/2121333372161261909)) | business, security, realworld | **Same opening line as Evernear's pitch:** "A supplier delivers half your order. How do you pay only for what arrived?" Suppliers accept terms before the buyer funds the order; payment needs a supplier-confirmed invoice and a confirmed delivery | Post only (thread; repo not found in first post) | Not stated in first post | Contract (claimed) | Not seen | 16 likes, 521 views |
| **Lot Passport** ([@navzuhdy](https://x.com/navzuhdy/status/2120244076327157910), [repo](https://github.com/nauvalzuhdy/lot-passport)) | realworld, nfts | USDC locked in a NEAR NFT until an inspector checks random cartons; pass pays the supplier, fail refunds | Post | NFT-held escrow | Inspector gate | Not seen | 2 likes, 27 views |
| **Mesh** ([@Godspowerojini](https://x.com/Godspowerojini/status/2120794113922695463)) | business, swarms, agents, realworld | Agents find suppliers, draft RFQs and settle payments under rules; a human approves every move | "Escrow live on NEAR testnet" (post) | Own contract | Human approval | Not seen | 2 likes, 101 views |
| **Warden** ([@simze_dev](https://x.com/simze_dev/status/2121295290409922632)) | security, realworld | Agent pays supplier invoices in USDC and blocks fake ones; NEAR AI Cloud only reads, code decides, contract limits, NEAR Intents pays | "Live on testnet" plus hosted app (post) | NEAR AI Cloud, contract, Intents | Contract | Not seen | 8 likes, 282 views |
| **RunOva** ([@milodot56](https://x.com/milodot56/status/2119672447116972147)) | business | Six agents (finance, support, **procurement**, growth, ops, analytics) under spending ceilings via scoped function-call keys; approvals queue; called a "prototype" | Post | Function-call keys | Ceiling plus approvals | Not seen | 99 likes, 2,670 views |
| **Keel** ([@kidvemon](https://x.com/kidvemon/status/2120792463191289856)) | business, security, realworld, social | AI treasury agent pays bills and suppliers from a contract vault, cross-chain via Chain Signatures | Hosted app (post) | Contract, Chain Signatures | Caps, payees, buffer | Not seen | 20 likes, 417 views |
| **WITNESS** ([@Joy_Web3X](https://x.com/Joy_Web3X/status/2121252854627459100)) | business, security, agents, realworld | Owner signs a mandate (one supplier, exact account, cap, invoice fingerprint); a poisoned invoice is denied on-chain | Post | Contract | Mandate | Refusal on-chain (claimed) | 5 likes, 71 views |
| **Supply** ([@moltycarlo](https://x.com/moltycarlo/status/2119059565153325080), [repo](https://github.com/chipsforbeer/near-supply-mcp)) | privacy, realworld | An AI runs purchasing (low stock, RFQs, quotes, POs) but pays only human-approved orders | Payment is "privately on mainnet through NEAR Confidential Intents (1Click API), or publicly on testnet (NEP-141 ft_transfer)" (README); MCP server | 1Click, Confidential Intents | Human approval per PO | Not checked | 2 videos, 0 likes, 16 views |
| **VeilProcure** ([@OlabanjiOlalek2](https://x.com/OlabanjiOlalek2/status/2121345911481680023), [repo](https://github.com/Olalekan2345/veilprocure)) | privacy, realworld | Confidential procurement: sealed bids committed on-chain, rule-based ranking, an attested AI note, and a testnet escrow that releases only to the selected supplier | Testnet contract `veilprocure-106725.testnet` with 37 tests; NEAR AI attestation "verified live"; README says **NEAR Intents not used** (README) | Own contract, NEAR AI Cloud | Escrow to the selected supplier only | Testnet contract | Video, 2 likes, 65 views; hosted at netlify |
| **Proof-of-Delivery** ([@YourNotaRealAI](https://x.com/YourNotaRealAI/status/2121373525554672114), [repo](https://github.com/sudo-ai-git/proof-of-delivery)) | business, swarms, agents, realworld | Escrow pays on machine-verified delivery: the buyer commits a sha256, the seller delivers bytes, the contract releases on a match | Testnet account named in post (post) | Own contract | Hash match | Testnet account | No media, 1 like, 38 views |
| **Delivered** ([@Story91_](https://x.com/Story91_/status/2119547336649269753)) | security, agents, open | A TEE model turns a task into a signed checklist; the contract verifies the signature, holds the reward and runs the checks | "Real testnet task: posted → paid in 52 s" (post) | NEAR AI Cloud TEE, own contract | Contract checks | Not seen | Video, 13 likes, 445 views; jobdelivered.xyz |
| **Milestone Vault** ([@t7pkaaa](https://x.com/t7pkaaa/status/2118777298921136597)) | privacy, security, agents, realworld | Freelancer escrow pays only when 2 sandboxed AI auditors prove the site works; "7/7 testnet attacks blocked" | Testnet (post) | Not stated | Escrow | Not seen | Video, 1 like, 68 views; hosted |
| **AgentEscrow** ([@dele_dave](https://x.com/dele_dave/status/2117911300516823327)) | security, agents | 3 AI judges inside a TEE score agent work and the contract pays; built on OutLayer | Post only | OutLayer | Contract | Not seen | Video, 2 likes, 148 views |
| **Payables** ([@danndedev](https://x.com/danndedev/status/2120680749448003952)) | security, realworld, social | An agent pays a DAO's invoices in USDC; a NEAR contract decides what gets paid | Post only | Own contract | Contract | Not seen | Video, 4 likes, 184 views; hosted |
| **GetLeash** ([@usegetleash](https://x.com/usegetleash/status/2118637512897831054)) | privacy, business, security, agents, realworld, open | Pays small supplier invoices from Telegram; large ones wait for a tap; rules live on NEAR | Post only | Not stated | On NEAR | Not seen | Video, 2 likes, 77 views; getleash.xyz |
| **Paygate** ([@drained99](https://x.com/drained99/status/2120683021720306089)) | business, security, agents | A keyless vault plus an agent key that can call only `request_payment`; allowlist, caps, one payment per job; 12 hijack attempts | Post only | Own contract, function-call key | On-chain | Not seen | Video, 46 likes, 1,123 views |
| **Policy Signer** ([@BETAxNFT](https://x.com/BETAxNFT/status/2120795628061999416)) | security, agents | The contract builds the EVM tx, checks policy, then asks MPC (Chain Signatures) to sign; the contract has no access keys | Testnet refusal tx linked (post, tx) | Chain Signatures, function-call key | On-chain | Testnet tx | Video, 41 likes, 430 views |
| **Saku** ([@Gliana_agent](https://x.com/Gliana_agent/status/2118984586587975724), [repo](https://github.com/Gliana-Labs/gliana-near-x402)) | security, agents | A NEAR contract owns a Base wallet and signs only to approved sellers within a daily limit; x402 | "On mainnet, a prompt-injected $5 payment was refused" (post) | Chain Signatures, x402 | On-chain | Mainnet claim | Video, 5 likes, 170 views |
| **Invoice Link** ([@brookxbt](https://x.com/brookxbt/status/2118283214322106444), [repo](https://github.com/ayinmodeolarewaju-bot/invoice-link)) | business, realworld | Pay link: the client pays any token on any chain via 1Click and the freelancer gets exact USDC, a signed receipt and a PDF | Post | 1Click / Intents | n/a | Not seen | Video, **180 likes, 3,674 views** (most visible in realworld); hosted |
| **That Invoice** ([@0xKiter](https://x.com/0xKiter/status/2121008907233689979), [repo](https://github.com/PhiBao/that-invoice)) | defi, realworld, nfts, social | Each invoice is its own NEAR account and can be sold once | Post | Account model | Contract | Not seen | Video, 8 likes, 309 views; hosted |
| **Standing Order** ([@sammharrison001](https://x.com/sammharrison001/status/2119755327788707860)) | privacy, business, security, realworld, social | Recurring payroll from a Sputnik DAO; a keeper key that can call only `run_due` | "400+ payouts so far" on testnet (post) | Sputnik DAO, function-call key | On-chain | Testnet ledger | Video, 3 likes, 119 views |
| **ClawMaven Spend Desk (NEAR rail)** ([@paulrodturner](https://x.com/paulrodturner/status/2120944781186744710), [repo branch](https://github.com/foodyogi/clawmaven-spend-desk/tree/near)) | business, security, agents | An agent pays contractors from a NEAR treasury contract and its key can only call payout | **Mismatch:** the post says a NEAR testnet treasury, but the repo description says "PayPal Payouts (sandbox)". The `near` branch may differ (post, repo metadata) | Function-call key (claimed) | On-chain (claimed) | Not seen | Video, 1 like, 57 views |
| **Tidepool** ([@priva_cie](https://x.com/priva_cie/status/2116726168930168843)) | open | **The infrastructure Evernear runs on**: a free testnet sandbox for the 1Click and Agent APIs | Hosted service | n/a | n/a | n/a | Video, 19 likes, 861 views |
| Large "agent spending firewall" cluster: e.g. Allowance ([@soldanoandrea](https://x.com/soldanoandrea/status/2116497975195378080)), Allowance ([@SasinduNim_01](https://x.com/SasinduNim_01/status/2119480878841639066), 26 likes), Allowance ([@Ritesh5969](https://x.com/Ritesh5969/status/2118542200615457097), passkey approval via `p256_verify`), Veto firewall ([@tarantinbv](https://x.com/tarantinbv/status/2116528585829720403)), NEAR Agent Spend Guard ([@mubu_dot](https://x.com/mubu_dot/status/2116372906745991631)), Mandate ([@GeiserJoe2](https://x.com/GeiserJoe2/status/2120245091210047847)), Recall Wallet Agent ([@arc5ive_](https://x.com/arc5ive_/status/2120288527258628330), 17 likes), Bound Wallet ([@boundwallet](https://x.com/boundwallet/status/2120088007449747638), claims mainnet) | mostly security, agents | Contract vault, a key limited to one method, caps and allowlist, owner approval, injection demo | Mostly testnet (posts) | Own contract, function-call keys | On-chain | Some tx links | Mostly 0–30 likes |

Other confirmed entries whose posts touch on escrow, delivery or settlement (not studied further):
- AgentEscrow ([@cachetronaut_](https://x.com/cachetronaut_/status/2121303634579169400))
- Escrow Gate for Agent Work ([repo](https://github.com/nnyycc77-ship-it/trust-toll-near))
- Payproof Global ([repo](https://github.com/0xdavid01/Payproof-Global))
- MilestonePay ([repo](https://github.com/kickenad/milestonepay-near))
- SETTLENEAR ([@folarihn](https://x.com/folarihn/status/2119153070051295422), 21 likes)
- ProofPay ([@the_annon_one](https://x.com/the_annon_one/status/2118508938178220451))
- BOSS ([@0xDfinity](https://x.com/0xDfinity))
- MaintPay ([@David63694631](https://x.com/David63694631/status/2121179700538028155))
- Sealgate ([@Stacked_Ghost](https://x.com/Stacked_Ghost/status/2121433732662136977))
- Settled ([@ashgoyal1990](https://x.com/ashgoyal1990/status/2116929689617088724))
- Paysure AI ([@PierceCipher](https://x.com/PierceCipher/status/2121259462308605969))
- NEAR PayMandate ([repo](https://github.com/garyquader-sketch/near-paymandate))
- Agent Treasury ([repo](https://github.com/iskander-kudashev-13/agent-treasury))
- Black box ([repo](https://github.com/tenxagent/blackbox))
- TEE Receipts ([repo](https://github.com/tmdry4530/tee-receipts))

See also the appendix at the end.

### Unconfirmed (related, but not found in the official directory under this name)

| Project | Link | Note |
| --- | --- | --- |
| Checkpoint V2 | [Phantomcall/Checkpoint__V2](https://github.com/Phantomcall/Checkpoint__V2) | Repo description: procurement agents propose one basket, paid only when Guard rules, the owner's on-chain approval and a Vault contract agree; "NEAR Hackathon 2026". No directory entry named Checkpoint was found; it may be listed under another name |
| suwappubot | [0xSoftBoi/suwappubot](https://github.com/0xSoftBoi/suwappubot) | Only a hackathon plan doc referencing nearhackathon.com; not related to procurement |

X hashtag search for #NEARHackathon was not run directly (X needs login). Only the demo posts linked from the directory were read.

## 5. Positioning

### Where Evernear likely leads

1. **The most complete real-world procurement story.** It covers the shortage, search against the BOM, two negotiations inside a price ceiling, two approvals, commitment, staged release on shipping documents, and partial payment for a short shipment (44 of 50). No other entry found combines negotiation, staged trade-finance release and partial-delivery pro-rating. Clear to Pay and Day One come closest, and both pay a whole invoice on match. **Accord** (@pelz0x) opens with the same line ("pay only for what arrived"), but its first post shows no NEAR mechanism or proof. Lot Passport (carton inspection) and Mesh (supplier RFQs plus testnet escrow) are smaller versions of the same idea.
2. **Per-order Agent API account with a `destinations: only` policy.** Each PO gets its own policy-bound wallet that can pay only the supplier or refund the buyer. This uses exactly the Agent API "policies and limits" feature the `security` and `agents` prompts point at. Among the entries read, only Veto also uses the Agent API, and as an approver rather than as a per-order escrow.
3. **The release gate runs in an OutLayer enclave and holds the only grant.** The server cannot pay, so the wrong-address refusal comes from both the gate code and the account policy. Recorded Base Sepolia txs exist for the advance ($18.90) and the balance ($36.54) (LEDGER row 18).
4. **Covers five official hint areas at once:** AI agents, NEAR Intents (Agent API), TEE (OutLayer plus NEAR AI Cloud private inference with attestation), policy wallets, and stablecoin settlement cross-chain to Base. Few entries span business, agents, realworld and privacy with real code in each.
5. **Presentation polish.** It has a presenter camera, a recorded short mode, a drawer of explorer links and frame checks. The human design judging should reward this.

### Where Evernear loses or is exposed

1. **Testnet through a community operator, while the strongest rivals show mainnet.**
   - The organizers say Intents has no testnet and suggest tiny mainnet amounts (Q-007).
   - Veto pays real USDC on the mainnet Agent API, Fulfil claims mainnet USDC, Proven has mainnet payouts, and Saku claims a mainnet refusal.
   - Evernear's money runs at 1:1,000 on Tidepool, which the README itself calls "a commitment, not a lock" (the operator enforces the policy, not the chain).
   - Testnet is eligible (Q-010), but judges who compare will notice.
2. **"Pays only for what arrived" is the claim the AI screen will test, and it is the most synthetic part.**
   - Per the README and LEDGER, the shipping signals come from a simulated tracking feed even in live runs, and the attested dock-check worker is "not deployed".
   - Clear to Pay (signed delivery plus PO match, live console) and Proven (attested check on mainnet) make the same verification step real.
   - Q-017 screening checks "does what the README says", so this gap carries the most risk.
3. **The pushed repo is 4 days stale (last push Nov 10)**, and the README status still reads Nov 6. If work since then is local only, judges will not see it.
4. **No hosted demo.** Veto, Clear to Pay, Proven, Invoice Link and others have "try it, no wallet" pages. Q-012 calls a hosted demo a plus.
5. **No adversarial evidence.** The two leaders publish attack benches (Veto 50/50, Clear to Pay 11 attacks, 0 paid). Evernear shows one wrong-address refusal.
6. **Low reach.** The demo post has 7 likes and 135 views, against 2,000 to 3,350 views for Veto and Clear to Pay. Reach is not a stated criterion, but judges see the timeline.
7. **Agents that look much the same.** In `business` and `agents`, the "contract vault plus scoped key plus caps" pattern appears about 100 times. Evernear has to lead with what is different: staged release on documents, partial-delivery pay, and the enclave-held grant.

## 6. Recommended changes (about 20 hours left; ordered by expected effect on the judged score)

Each item says whether it needs the human. Pushing, posting, spending on mainnet and request-changes are all the human's call (HACKATHON.md "Never without the human's explicit confirmation").

1. **Make the pushed repo match reality, and make every README claim reproducible. (Human: push.)**
   - Update the status line from Nov 6 to today.
   - Add a "What is real / what is simulated" table at the top: live Tidepool commit, release-gate runs and Base Sepolia txs real; tracking feed and dock count simulated.
   - Add a 3-command "verify without keys" path that reads the recorded txs from public explorers or RPC, as Veto and Proven do.
   - The AI screen will grade "runs and does what the README says", so an honest, checkable README protects against the biggest risk.
2. **Make the delivery evidence real, even in a minimal form.** Deploy the attested dock-check worker on OutLayer testnet; its Rust source already exists (LEDGER row 6). Or have the release gate verify a signed packing-slip or count message from a second key. Then one live run can show the balance stage refusing until a real signed count arrives.
   - This turns "pays only for what arrived" from narration into a verifiable step, which is the step Clear to Pay and Proven already show.
   - If the deploy does not fit in the time, state the limit plainly in the README instead.
3. **Add one mainnet proof on the official Agent API (`api.agentsonintents.com`). (Human: mainnet spend, signing.)**
   - Use cents-scale USDC, as Q-007 suggests: create a PO account with a `destinations: only` policy, then run one withdraw that is refused and one that pays.
   - Link both in the README and the drawer. Per NOTES section 14 it is the same SDK with a different base URL.
   - This answers the "community testnet" objection and matches Veto's strongest proof point.
4. **Ship a small attack script and log for the `security` lens, and ask to add the `security` track. (Human: request-changes.)**
   - `npm run attack` should try these against the order wallet and the gate, and print each refusal code (for example `policy_destination_denied`):
     - lookalike supplier address;
     - payout above the stage amount;
     - balance before the customs and count signals;
     - a second payout of the same stage;
     - a server-side payout without the enclave grant.
   - The `security` prompt asks for exactly this ("an attack demo... show the log"), and the leaders publish such numbers.
   - The current submission does not list `security`, though `docs/NOTES.md` planned it.
5. **Host the demo in replay mode, and post a short follow-up on X. (Human: deploy and post.)**
   - Deploy `DEMO_MODE=1` to a public URL, kept up until Nov 25 (Q-012 plus), and link it from the README.
   - Reply to the Nov 10 demo post with the 124 s short-mode video and one concrete line, for example "the agent cannot pay anyone but the supplier, and 6 missing motors = $7,560 never left the buyer". Tag @NEARProtocol, #NEARHackathon, @NearBuilders and @NearLegion.
   - The submission's demo URL stays the same, so request-changes is not needed.

If time allows only one item, do item 1, plus the honest-limits table from item 2.

## Appendix: how the business and realworld scan was done

The demo post of each of the 402 entries tagged `business` or `realworld` was fetched. Each post was matched against these terms: procure, supplier, purchase order, vendor, delivery, arrived, goods, escrow, milestone, bill of lading, customs, attest, TEE, enclave, OutLayer, Agent API, Tidepool and mainnet.

- **Matches:** 142 posts. The procurement and delivery matches that were worth reading are in the confirmed table: Accord, Lot Passport, Mesh, Warden, RunOva, Keel and WITNESS.
- **Tidepool:** apart from Tidepool's own entry, no post in this scan mentions it. Clear to Pay's README does (on testnet, via Tidepool).
- **Agent API:** only Veto's post mentions it.
- **Most-viewed posts in these tracks:** Aureus (11,713 views), Contri (8,472), Inkwell, Incorpr, Penstock, Veto, Hermit, Chaperone and Clear to Pay. None of these was studied except Veto and Clear to Pay.
- **Q-015 note:** @sentinel_dapper (Veto) also entered **Emporium**, and @CoderofVibes entered both **Day One** and **Everstreet**.
