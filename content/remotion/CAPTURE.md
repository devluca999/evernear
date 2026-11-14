# Capture and regenerate workflow

How to rebuild every video in this package from the repo's own data, check it, and export it. Nothing on screen is typed into a scene: if a number or hash is wrong in a video, fix the source file, not the scene.

## 1. Data

`src/data.ts` (`buildStory()`) reads, at bundle time:

| Source | Gives |
|---|---|
| `seed/astro.ts` | PO 1042, 50 ordered, 44 received, $1,260 unit, people, supplier and its address |
| `policy/astro.json` | 2 approvers, 30% advance, which signals unlock advance and balance |
| `engine/money.ts` | testnet scale 1:1,000 |
| `docs/hackathon/payment-proofs.json` | every tx hash, explorer URL and recorded testnet amount, the reconciliation read from chain, the refusal records |
| `fixtures/recorded/approval-gated-run.json` | real testnet approval refusals (0 and 1 approvals, agent count 5 before and after) |
| `fixtures/recorded/gate-v2-frozen-probe.json` | release gate v2 signed `account_frozen` refusal, tx `4qXdn52Z…` |
| `fixtures/recorded/gate-v3-unsigned-dock-probe.json`, `gate-v4-exploit-probe.json` | gate v3 `dock_unsigned` and deployed gate v4 `terms_missing` signed refusals |
| `docs/hackathon/READINESS.md`, `TRUST-MODEL.md`, `ENFORCEMENT-MATRIX.md` | autonomy classes, trusted parties, what is still simulated (quoted; `test/facts.spec.mjs` fails if the docs stop saying it) |

Amounts are integer cents from `src/amounts.ts` (`computeSettlement`, `compareWithBinaryEscrow`).

When the repo data changes (a new recorded run, a new proof file):

1. The repo owner re-runs `npm run verify:proofs` **at the repo root**. It re-reads every recorded tx on public RPCs and rewrites `docs/hackathon/payment-proofs.json`. It writes outside `content/`, so it is an owner step, not part of rendering.
2. Run `npm test` here. A failure means the videos would now show something the docs or proofs no longer support.

## 2. Compositions

| Id | Size | Length | File |
|---|---|---|---|
| `PartialShipment` | 1080x1920 | ~41.6 s | `src/compositions/PartialShipment.tsx` |
| `JudgeDemo` | 1920x1080 | ~204.5 s, 8 acts | `src/compositions/JudgeDemo.tsx` |
| `PartialShipmentThumb`, `JudgeDemoThumb` | stills | | `src/compositions/Stills.tsx` |

Scene lengths live in `src/timing.ts` (`test/timing.spec.mjs` keeps PartialShipment within 35 to 45 s and JudgeDemo within 3 to 5 min). Preview in Studio with `npm run dev`; every composition takes `receivedQty` (`null` = seed).

## 3. Render

```bash
cd content/remotion
export REMOTION_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"  # if the headless shell never paints
npm run render:partial      # out/PartialShipment.mp4
npm run render:judgedemo    # out/JudgeDemo.mp4
npm run stills              # out/*.png (thumbnails, keep each < 500 KB)
```

The render scripts pass `--timeout=120000`. Render one video at a time on a busy machine.

Spot-check frames for overlap and cropping before exporting (scene ends, not mid-fade):

```bash
npx remotion still JudgeDemo /tmp/f.png --frame=4055 --scale=0.6
npx remotion ffmpeg -ss 120 -i out/JudgeDemo.mp4 -frames:v 1 /tmp/judge-120s.png
```

## 4. Fact-check against payment-proofs.json

Before posting, check every hash on screen against `docs/hackathon/payment-proofs.json` (or `PAYMENT-PROOFS.md`):

| On screen | Must equal |
|---|---|
| Commit `366nhBeJ…ynC1` (NEAR testnet), shown as "Recorded Nov 6, before the approval check existed" | `entries[stage=commit].txId` |
| Advance `0x5d8dab61…973b`, 18.90 (Base Sepolia) | `entries[stage=advance]` |
| Balance `0x0fcba050…6045`, 36.54 (Base Sepolia) | `entries[stage=balance]` |
| Returned `4rrfjsTZ…vdEM`, 7.56 (NEAR testnet) | `entries[stage=reclaim]` |
| 18.90 + 36.54 + 7.56 = 63.00 | `reconciliation` raw values, `reconciles: true` |
| Gate v2 `4qXdn52Z…2vH`, `account_frozen`, signature valid; gate v4 `DSpQkJxt…YibHRY`, `terms_missing` (deployed) | the two gate probe fixtures (not covered by `verify:proofs`) |
| Grant refusal `grant_invalid` (PO 1042 run) vs destination refusal `policy_destination_denied` (Nov 5, other account) | `ENFORCEMENT-MATRIX.md` rows 1 and 8: two separate events |

`npm test` checks all of these automatically; reading the frames is the last human pass. Labels that must stay visible: "testnet, 1:1,000", "simulated feed" on shipment signals, approvals refused by our backend before any call (run against real testnet, rehearsal keys), the Nov 6 commit had no signature check, the paying run went through gate v1 on an unsigned simulated count of 44, gates v2 to v4 have only refused on chain (v4 is deployed), and the buyer's owner key (held by our backend in this demo) can change the wallet's rules.

## 5. Export

`out/*.mp4` is h264, ready for X / LinkedIn / YouTube (PartialShipment is 9:16 for Reels/Shorts/TikTok). Videos are gitignored; thumbnails `out/*.png` are tracked.

## Adding a screen recording of the app

If someone records the app later (for example the demo in Short mode, `http://localhost:3000/?mode=short`, captured with the browser or macOS screen recorder), it can sit inside any scene:

1. Put the file in `content/remotion/public/`, e.g. `public/app-short.mp4` (create the folder; Remotion serves it through `staticFile`). Prefer h264 MP4 at the composition's frame rate (30 fps).
2. Use `<OffthreadVideo>` (frame-accurate in renders) inside a `<Sequence>`:

```tsx
import { OffthreadVideo, Sequence, staticFile } from "remotion";

<Sequence from={0} durationInFrames={300} name="App recording">
  <OffthreadVideo
    src={staticFile("app-short.mp4")}
    muted
    trimBefore={90}   // skip the first 3 s of the recording (source frames at 30 fps)
    trimAfter={390}   // stop at 13 s
    style={{ width: "100%", height: "100%", objectFit: "contain" }}
  />
</Sequence>
```

(`trimBefore` / `trimAfter` replace the deprecated `startFrom` / `endAt` in Remotion 4.0.543.) For a framed look, wrap it in the package's `Card` and keep a `SceneFrame` caption saying what is shown, e.g. "Recorded from the demo in replay mode". A recording of replay mode shows recorded responses, not live calls: label it that way. No recording is bundled yet, so no composition depends on one.
