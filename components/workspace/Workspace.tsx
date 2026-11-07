"use client";
// The workspace, laid out as the V2 storyboard: sidebar, summary strip, the scene's cards (with the
// phone beside them when a conversation is on), the developer drawer, and the demo rail.
import { useEffect, useMemo, useRef, useState } from "react";
import { stateAt, sceneStartMs } from "@/scenario/runner";
import { ADJUSTMENT_SCENE, amounts, HOLD_UNIT, SCENARIOS, type ScenarioId } from "@/scenario/scenes";
import { PO, story, suppliers } from "@/seed/astro";
import { formatUsd, scaleTestnet } from "@/engine/money";
import type { LiveStep } from "@/scenario/gates";
import type { Beat, PanelId, WorkspaceState } from "@/scenario/types";
import { Drawer } from "./Drawer";
import { Phone } from "./Phone";
import { DemoRail, RailShow } from "./DemoRail";
import { OrdersPanel } from "./panels/OrdersPanel";
import { StockPanel } from "./panels/StockPanel";
import { MoneyPanel } from "./panels/MoneyPanel";
import { MapPanel } from "./panels/MapPanel";
import { InboxPanel } from "./panels/InboxPanel";
import { RulesPanel } from "./panels/RulesPanel";
import { ProductsPanel } from "./panels/ProductsPanel";
import { ActionsContext, type WorkspaceActions } from "./actions";
import { PhotoViewer } from "./PhotoViewer";
import { CHECKPOINTS } from "@/scenario/shipment";
import { PANEL_ORDER } from "@/scenario/layout";
import { arrange, closeCard, COLS, emptyBoard, loadBoard, lockCard, openCard, placeCard, rowsUsed, SPOTS, type Board } from "@/scenario/board";
import { describeStop, heldAt, isStop, liveStepOf, nextBlock, stepClockWith } from "@/scenario/gates";
import { useLive } from "./useLive";
import { loadPolicy, PolicyContext, POLICY_KEY, sameRules } from "./rules";
import { policy as defaultPolicy } from "@/seed/astro";
import type { Policy } from "@/engine/types";
import { BoardContext, N } from "./Panel";
import { Sidebar, type StatusTone } from "./Sidebar";
import { StatsBar } from "./StatsBar";
import { Camera, useReducedMotion, type CameraApi, type CameraState } from "./Camera";
import { GhostCursor, useGhost } from "./Cursor";
import { clickTargetOf, LOOKAHEAD_MS } from "@/scenario/cursor";
import { openChannel, type RemoteCommand, type RemoteState } from "./presentChannel";
import type { Focus } from "@/scenario/types";
import { EXPLAINERS } from "@/scenario/explain";
import { liveEntries, mergeHistory, pendingEntry, type LiveRow } from "@/scenario/liveLog";
import recordedRun from "@/fixtures/recorded/live-run.json";
import s from "./shell.module.css";

const PANELS: Record<PanelId, (p: { st: WorkspaceState; pulse: boolean }) => React.ReactNode> = {
  products: ProductsPanel, stock: StockPanel, orders: OrdersPanel, inbox: InboxPanel, map: MapPanel, rules: RulesPanel, money: MoneyPanel,
};

const BOARD_KEY = "evernear.board.v2";
const LOCK_KEY = "evernear.locked.v2";
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage may be blocked */ } };
const HAOYUN = suppliers.find((x) => x.id === "haoyun")!.receiveAddress;
const AFTER: Record<ScenarioId, { label: string; to: ScenarioId | null }> = {
  happy: { label: "Try the bad path", to: "standoff" },
  standoff: { label: "Try the bad path, adjusted", to: "adjusted" },
  adjusted: { label: "Back to the happy path", to: "happy" },
};

/** What a live money step is doing, said plainly, with the testnet amount (1:1,000). */
export function runningText(step: LiveStep, unitCents: number): string {
  const x = amounts(unitCents), usd = (c: number) => formatUsd(scaleTestnet(c));
  switch (step) {
    case "commit": return `Committing ${usd(x.lockedCents)} on Tidepool testnet`;
    case "advance": return `Releasing the ${usd(x.advanceCents)} advance to Haoyun on Base Sepolia`;
    case "pay": return `Paying Haoyun the ${usd(x.balanceCents)} balance on Base Sepolia`;
    case "refuse": return "Trying a payment to a lookalike address on Tidepool testnet";
    case "reclaim": return `Returning ${usd(x.holdCents)} to Astro on Tidepool testnet`;
  }
}

export function Workspace({ initialMs = 0, autoplay = true }: { initialMs?: number; autoplay?: boolean }) {
  const [t, setT] = useState(initialMs);
  const [playing, setPlaying] = useState(autoplay);
  // Present: nothing moves until you act, one narratable step at a time. Autoplay: the scenario plays itself.
  const [playMode, setPlayMode] = useState<"present" | "autoplay">("present");
  const present = playMode === "present";
  const [scenarioId, setScenarioId] = useState<ScenarioId>("happy");
  const SC = SCENARIOS[scenarioId];
  const TL = SC.timeline, TOTAL = SC.totalMs, LIST = SC.scenes;
  const live = useLive();
  const [policy, setPolicyState] = useState<Policy>(defaultPolicy);
  const policyCtx = useMemo(() => ({
    policy,
    setPolicy: (p: Policy) => { setPolicyState(p); try { localStorage.setItem(POLICY_KEY, JSON.stringify(p)); } catch { /* storage may be blocked */ } },
    reset: () => { setPolicyState(defaultPolicy); try { localStorage.removeItem(POLICY_KEY); } catch { /* ignore */ } },
    changed: !sameRules(policy, defaultPolicy),
  }), [policy]);
  const [mode, setMode] = useState<"dark" | "light">("dark");
  const [drawerOpenState, setDrawerOpen] = useState(false);
  const last = useRef<number | null>(null);
  const [viewer, setViewer] = useState<{ checkpointId: string; index: number } | null>(null);
  const [pinnedProof, setPinnedProof] = useState<string | null>(null);
  const [board, setBoardState] = useState<Board>(emptyBoard);
  const [locked, setLockedState] = useState<PanelId[]>([]);
  const setBoard = (b: Board) => { setBoardState(b); save(BOARD_KEY, b); };
  const setLocked = (l: PanelId[]) => { setLockedState(l); save(LOCK_KEY, l); };
  const [drag, setDrag] = useState<{ id: PanelId; dx: number; dy: number; over: number | null } | null>(null);
  // null: the sidebar follows the story (open on onboarding, icons after); true or false: your choice.
  const [navChoice, setNavChoice] = useState<boolean | null>(null);
  const [railHidden, setRailHidden] = useState(false);
  // The presenter camera: F turns it on or off, Z follows clicks, 0 returns to the full view.
  const [cameraOn, setCameraOn] = useState(true);
  const [follow, setFollow] = useState(false);
  const [camRequest, setCamRequest] = useState<{ seq: number; focus: Focus } | null>(null);
  const [fullSeq, setFullSeq] = useState(0);
  const [camState, setCamState] = useState<CameraState>({ mode: "full", focusId: null, zoom: 1 });
  const [skipped, setSkipped] = useState<string[]>([]);
  // The presenter cursor: C turns it on or off; on by default in Present, off in Autoplay.
  const [cursorPref, setCursorPref] = useState<boolean | null>(null);
  const cursorOn = cursorPref ?? present;
  const camApi = useRef<CameraApi | null>(null);
  const reduced = useReducedMotion();
  const locate = useMemo(() => (id: string) => camApi.current?.locate(id) ?? null, []);
  const ghost = useGhost({ on: cursorOn, locate, reduced });
  const jumped = useRef(true);
  const prevT = useRef(initialMs);

  // ?scene=7 jumps to a scene (1-based, as on screen); ?paused=1 holds it there; ?mode=light picks the theme; ?photo=dock:0 opens a photo.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("scene");
    const off = Number(q.get("at") ?? 0);
    queueMicrotask(() => {
      const sc = q.get("scenario");
      const scList = sc && sc in SCENARIOS ? SCENARIOS[sc as ScenarioId].scenes : SCENARIOS.happy.scenes;
      if (sc && sc in SCENARIOS) setScenarioId(sc as ScenarioId);
      if (id !== null) setT(sceneStartMs(Math.max(0, Number(id) - 1), scList) + off);
      if (q.get("paused") === "1") setPlaying(false);
      if (q.get("autoplay") === "1" || q.get("play") === "autoplay") setPlayMode("autoplay");
      if (q.get("mode") === "light") setMode("light");
      if (q.get("drawer") === "1") setDrawerOpen(true);
      if (q.get("rail") === "0") setRailHidden(true);
      if (q.get("camera") === "0") setCameraOn(false);
      if (q.get("follow") === "1") setFollow(true);
      jumped.current = true;
      const photo = q.get("photo");
      if (photo && photo.split(":")[0] in CHECKPOINTS) setViewer({ checkpointId: photo.split(":")[0], index: Number(photo.split(":")[1] ?? 0) });
      try { setPolicyState(loadPolicy(localStorage.getItem(POLICY_KEY))); } catch { /* no saved rules */ }
      try {
        setBoardState(loadBoard(localStorage.getItem(BOARD_KEY), PANEL_ORDER));
        const l = JSON.parse(localStorage.getItem(LOCK_KEY) ?? "[]");
        if (Array.isArray(l)) setLockedState(l.filter((x): x is PanelId => PANEL_ORDER.includes(x)));
      } catch { /* nothing saved */ }
    });
  }, []);

  // Where the viewer's rules stop the PO, if they do (a full replay; cheap).
  const haltedAt = useMemo(() => stateAt(TOTAL, TL, policy).halted?.atMs ?? null, [policy, TL, TOTAL]);
  // What holds the clock: a human moment, the end of a scene (narrate, then Cmd+K), or a live step still running.
  const blocked = (b: Beat) => {
    const afterHalt = haltedAt !== null && b.atMs >= haltedAt;
    // A live money step holds the clock until the real call finished, in both modes. Nothing runs past a halt.
    const step = afterHalt ? null : liveStepOf(b, HAOYUN);
    if (live.on && !live.error && step && !live.done.includes(step)) return true;
    if (b.gate) return true;
    if (!present) return false;
    // Once the rules stop the PO, only scene changes and the end still wait for you.
    if (afterHalt) return b.ev.type === "scene" || b.ev.type === "end_card";
    return isStop(b);
  };
  const blockedRef = useRef(blocked);
  useEffect(() => { blockedRef.current = blocked; });

  useEffect(() => {
    if (!playing) { last.current = null; return; }
    let raf = 0;
    const tick = (now: number) => {
      const dt = last.current === null ? 0 : now - last.current;
      last.current = now;
      setT((x) => {
        // Autoplay answers each human moment by itself after a short beat, so the story runs start to finish.
        const next = stepClockWith(x, Math.min(TOTAL, x + dt), (b) => blockedRef.current(b), TL);
        if (next >= TOTAL) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, TL, TOTAL]);

  const held = heldAt(t, blocked, TL);
  const heldStep = held && !(haltedAt !== null && held.atMs >= haltedAt) ? liveStepOf(held, HAOYUN) : null;
  const heldGate = held?.gate ?? null;
  // Autoplay: a human moment waits a beat, then answers itself.
  useEffect(() => {
    if (present || !held?.gate || !playing) return;
    const at = held.atMs, target = clickTargetOf(held);
    const id = setTimeout(() => { if (cursorOn && target) ghost.tap(target, () => setT(at)); else setT(at); }, 1400);
    return () => clearTimeout(id);
  }, [present, held, playing, cursorOn, ghost]);
  const liveBusy = !!heldStep && live.on && !live.error && !live.done.includes(heldStep);
  // In Present the next step is always named and one press away, whether the clock is held there or on its way.
  const upcoming = held ?? (present ? nextBlock(t, blocked, TL) : null);
  // In Present, a human moment that comes next is already shown as waiting: the next press answers it.
  const waiting = heldGate ?? (present && upcoming?.gate ? upcoming.gate : null);
  const finished = t >= TOTAL;
  const sceneTitle = (id: number) => LIST[id]?.enter ?? `Go to ${LIST[id]?.title ?? "the next scene"}`;
  const nextLabel = upcoming && !liveBusy ? describeStop(upcoming, sceneTitle, HAOYUN) : null;
  const jump = (id: number) => { jumped.current = true; setT(sceneStartMs(id, LIST)); setPinnedProof(null); setViewer(null); };
  const reset = () => { setPinnedProof(null); setViewer(null); live.reset(); };
  const restart = () => { jumped.current = true; setT(0); reset(); setPlaying(true); };
  const pickScenario = (id: ScenarioId, sceneId = 0) => { jumped.current = true; setScenarioId(id); setT(sceneStartMs(sceneId, SCENARIOS[id].scenes)); reset(); setPlaying(true); };
  const pickRef = useRef(pickScenario);
  useEffect(() => { pickRef.current = pickScenario; });
  /** Next: play the next step (or answer the moment). A live step finishes first. */
  const proceed = () => {
    if (finished) { const to = AFTER[scenarioId].to; if (to) pickScenario(to); return; }
    if (upcoming && !liveBusy) {
      // A live money step not yet run is never skipped: the press brings the clock to it, the step
      // runs on testnet, and the next press only works once it is confirmed.
      const step = haltedAt !== null && upcoming.atMs >= haltedAt ? null : liveStepOf(upcoming, HAOYUN);
      const unrun = live.on && !live.error && !!step && !live.done.includes(step);
      setT(unrun ? upcoming.atMs - 1 : upcoming.atMs); setPlaying(true); return;
    }
    if (!present && t < TOTAL) setPlaying(true);
  };
  const proceedRef = useRef(proceed);
  useEffect(() => { proceedRef.current = proceed; });
  /**
   * Next from the keyboard, the rail or the remote: with the presenter cursor on, a step that is a
   * click in the app (a tab, a button, a tap on the phone) is clicked first, then happens. A step
   * that only animates gets no click; the cursor rests beside its content.
   */
  const advance = () => {
    const b = !finished && upcoming && !liveBusy ? upcoming : null;
    const target = b ? clickTargetOf(b) : null;
    if (cursorOn && target) { ghost.tap(target, () => proceedRef.current()); return; }
    proceedRef.current();
    if (cursorOn && b?.focus) ghost.rest(b.focus.id);
  };
  const advanceRef = useRef(advance);
  useEffect(() => { advanceRef.current = advance; });
  // A click the running clock reaches by itself (a product tab between stops): the cursor sets off
  // early, so the press lands just before the change.
  const tapped = useRef<Set<string>>(new Set());
  const lastTapT = useRef(t);
  useEffect(() => {
    if (t < lastTapT.current) tapped.current.clear();
    lastTapT.current = t;
    if (!cursorOn || !playing) return;
    for (const b of TL) {
      if (b.atMs <= t || b.atMs > t + LOOKAHEAD_MS) continue;
      const target = clickTargetOf(b), key = `${scenarioId}:${b.atMs}`;
      if (!target || tapped.current.has(key) || blockedRef.current(b)) continue;
      tapped.current.add(key);
      ghost.tapBy(target, b.atMs - t);
    }
  }, [t, TL, cursorOn, playing, scenarioId, ghost]);

  // The camera: a step whose beat the clock just crossed brings its focus. Jumps (a chapter, a
  // scenario, a restart) cross many beats at once and zoom nowhere.
  const focusKey = (b: Beat) => `${scenarioId}:${b.atMs}`;
  useEffect(() => {
    const from = prevT.current;
    prevT.current = t;
    if (jumped.current) { jumped.current = false; return; }
    if (t <= from) return;
    const hit = TL.filter((b) => b.focus && b.atMs > from && b.atMs <= t).at(-1);
    if (!hit || skipped.includes(focusKey(hit))) return;
    queueMicrotask(() => setCamRequest((r) => ({ seq: (r?.seq ?? 0) + 1, focus: hit.focus! })));
    // focusKey reads scenarioId, which only changes with a jump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, TL, skipped]);
  const nextStop = TL.find((b) => b.atMs > t && isStop(b)) ?? null;
  const nextFocus = TL.find((b) => b.atMs > t && b.focus) ?? null;
  const holdNext = !!nextStop?.focus && !skipped.includes(focusKey(nextStop));
  const previewFocus = () => { if (nextFocus) setCamRequest((r) => ({ seq: (r?.seq ?? 0) + 1, focus: nextFocus.focus! })); };
  const skipFocus = () => {
    if (camState.mode !== "full") { setFullSeq((n) => n + 1); return; }
    if (nextFocus) { const k = focusKey(nextFocus); setSkipped((x) => [...x, k]); }
    setFullSeq((n) => n + 1);
  };

  // Live: a money step under way opens the drawer, so its entry shows "Confirming", then its explorer button.
  useEffect(() => { if (live.on && liveBusy) queueMicrotask(() => setDrawerOpen(true)); }, [live.on, liveBusy]);
  // Fire the live step the clock is holding at.
  const liveRun = live.run;
  const liveScenario = scenarioId === "adjusted" ? "adjusted" : "happy";
  useEffect(() => { if (heldStep && live.on && !live.pending && !live.error) void liveRun(heldStep, liveScenario); }, [heldStep, live.on, live.pending, live.error, liveRun, liveScenario]);

  const base = useMemo(() => stateAt(t, TL, policy), [t, TL, policy]);
  // In live mode the real proofs replace the placeholders as they arrive.
  const st = useMemo(() => ({ ...base, proofs: base.proofs.map((p) => (live.byKey[p.id] ? { ...live.byKey[p.id], scene: p.scene, atMs: p.atMs } : p)) }), [base, live.byKey]);
  const scene = LIST.find((x) => x.id === st.scene) ?? LIST[0];
  // The phone shows this scene's conversation only.
  const sceneMsgStart = useMemo(() => stateAt(sceneStartMs(st.scene, LIST), TL, policy).messages.length, [st.scene, LIST, TL, policy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || viewer || e.altKey) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); advanceRef.current(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") { e.preventDefault(); pickRef.current(scenarioId === "standoff" ? "adjusted" : "standoff"); return; }
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      if (e.metaKey || e.ctrlKey) return;
      const key = e.key.toLowerCase();
      if (key === "f") { setCameraOn((c) => !c); return; }
      if (key === "z") { setFollow((f) => !f); return; }
      if (key === "c") { setCursorPref(!cursorOn); return; }
      if (key === "0") { setFullSeq((n) => n + 1); return; }
      // The right arrow plays the next step (and its zoom); the left arrow goes back a chapter.
      if (e.key === "ArrowRight") { e.preventDefault(); advanceRef.current(); }
      if (e.key === "ArrowLeft") { jumped.current = true; setT(sceneStartMs(Math.max(0, stateAt(t, TL).scene - 1), LIST)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [t, viewer, TL, LIST, scenarioId, cursorOn]);

  // The drawer's history as a transaction log. Live: every real row of this run as it lands, plus a
  // "Confirming" entry for a money step under way. Replay of the happy path: the recorded live run
  // (fixtures/recorded/live-run.json), each step revealed as the story reaches it. The story's own
  // placeholders for those steps step aside.
  const liveRows = live.rows;
  const realRows = useMemo<LiveRow[]>(() => (live.on ? liveRows : scenarioId === "happy" ? (recordedRun.rows as LiveRow[]) : []), [live.on, liveRows, scenarioId]);
  const history = useMemo(() => {
    const real = liveEntries(realRows, TL, { replay: !live.on, supplier: HAOYUN }).filter((p) => live.on || (p.atMs ?? 0) <= t);
    const waiting = live.on && live.pending ? pendingEntry(live.pending, TL, HAOYUN) : null;
    const landed = waiting && real.some((p) => p.key && (p.atMs ?? 0) === (waiting.atMs ?? 0) - 1 && p.kind === waiting.kind);
    return mergeHistory(st.proofs, [...real, ...(waiting && !landed ? [waiting] : [])]);
  }, [realRows, TL, live.on, live.pending, t, st.proofs]);
  const lastProof = history.at(-1) ?? null;
  const pinned = pinnedProof ? history.find((p) => p.id === pinnedProof) ?? null : null;
  const placed = arrange(board, st.layout);
  const ownBoard = board.some(Boolean);
  const gridMode = ownBoard || drag !== null;
  const rows = drag ? 2 : rowsUsed(placed);
  const cols = drag ? COLS : Math.max(1, ...placed.map((p) => (p.spot % COLS) + 1));
  const boardCtx = {
    isMine: (id: PanelId) => board.includes(id),
    isLocked: (id: PanelId) => locked.includes(id),
    dragging: drag?.id ?? null,
    startDrag: (id: PanelId, e: React.PointerEvent) => {
      e.preventDefault();
      const x0 = e.clientX, y0 = e.clientY;
      const spotAt = (x: number, y: number) => {
        const el = document.elementsFromPoint(x, y).find((n) => n instanceof HTMLElement && n.dataset.spot !== undefined) as HTMLElement | undefined;
        return el ? Number(el.dataset.spot) : null;
      };
      setDrag({ id, dx: 0, dy: 0, over: null });
      const move = (ev: PointerEvent) => setDrag({ id, dx: ev.clientX - x0, dy: ev.clientY - y0, over: spotAt(ev.clientX, ev.clientY) });
      const up = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const spot = spotAt(ev.clientX, ev.clientY);
        setDrag(null);
        if (spot !== null) setBoard(placeCard(boardRef.current, lockedRef.current, id, spot, placedRef.current));
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    step: (id: PanelId, dx: number, dy: number) => {
      const cur = placed.find((p) => p.id === id);
      if (!cur) return;
      const col = (cur.spot % COLS) + dx, row = Math.floor(cur.spot / COLS) + dy;
      if (col < 0 || col >= COLS || row < 0 || row * COLS + col >= SPOTS) return;
      setBoard(placeCard(board, locked, id, row * COLS + col, placed));
    },
    lock: (id: PanelId) => { const r = lockCard(board, locked, id, placed); setBoard(r.board); setLocked(r.locked); },
    close: (id: PanelId) => { setBoard(closeCard(board, id)); setLocked(locked.filter((x) => x !== id)); },
  };
  const boardRef = useRef(board), lockedRef = useRef(locked), placedRef = useRef(placed);
  useEffect(() => { boardRef.current = board; lockedRef.current = locked; placedRef.current = placed; });

  // An explainer moment opens the drawer on its proof; collapsing it holds until the next moment.
  const [shutExplain, setShutExplain] = useState<string | null>(null);
  const explainOn = !!st.explain && shutExplain !== st.explain;
  const explainProof = st.explain ? history.findLast((p) => (p.key ?? p.id) === EXPLAINERS[st.explain!].proof) ?? null : null;
  const drawerOpen = drawerOpenState || !!pinned || explainOn;
  const actions: WorkspaceActions = {
    openPhoto: (checkpointId, index) => { setPlaying(false); setViewer({ checkpointId, index }); },
    openProof: (id) => { setPinnedProof(id); },
    waiting, answer: () => proceedRef.current(),
    live: {
      on: live.on, connected: live.on ? (live.preflight ? live.preflight.ok : null) : null,
      note: live.on && live.preflight?.ok ? `Tidepool testnet · treasury ${formatUsd(Math.round(live.preflight.treasuryUsd * 100))}` : null,
      running: live.on && liveBusy && heldStep ? runningText(heldStep, st.limitApprovals.length > 0 ? HOLD_UNIT : PO.revisedUnitCents) : null,
    },
  };

  // The phone: on in scenes with a conversation, and whenever a human moment waits on Telegram.
  const chat = st.messages.slice(sceneMsgStart);
  const phoneOn = !!scene.phone;
  const lastBot = [...chat].reverse().find((m) => m.channel === "telegram" && m.direction === "out");
  const phoneTo = waiting?.who ?? (lastBot?.to as "Luca" | "Jordan" | undefined) ?? "Luca";
  const lastPrice = st.price.history.at(-1);
  const adjustedUnit = st.limitApprovals.length > 0 ? HOLD_UNIT : PO.revisedUnitCents;
  const trailing = waiting?.id === "on_hold" || (scene.title === "On hold" && !st.endCard)
    ? { tone: "attention" as const, text: "On hold", note: "waiting on you" }
    : lastBot?.text.startsWith("Countering") && !(lastPrice && lastPrice.pass) ? { tone: "active" as const, text: "Waiting on Haoyun" } : null;

  const needs: Partial<Record<PanelId, number>> = {};
  for (const p of waiting?.panels ?? []) needs[p] = 1;
  const status: { tone: StatusTone; text: string } = waiting
    ? { tone: "attention", text: waiting.status ?? "Stockbot needs you" }
    : st.halted ? { tone: "attention", text: "On hold, needs you" }
    : st.scene === 0 && st.proofs.length < 2 ? { tone: undefined, text: "Stockbot ready" }
    : st.stage === "paid" || st.stage === "closed" ? { tone: "success", text: scene.status ?? "Settled" }
    : { tone: "active", text: scene.status ?? "Working" };
  const navOpen = navChoice ?? st.scene === 0;
  const synthetic = history.some((p) => p.synthetic) || (!history.length && !live.on);
  // What the rail's footnote says: every proof real, only the money steps real, or placeholders.
  const proofsReal: "all" | "money" | "none" = !history.some((p) => p.synthetic) && history.length ? "all" : history.some((p) => !p.synthetic) || (scenarioId === "happy" && !live.on) ? "money" : "none";
  const endText = scenarioId === "standoff"
    ? { big: <>PO <N>{PO.number}</N> ended. <N>$0</N> moved.</>, sub: "Haoyun and QuickShip held at +10%, over Astro's 5% ceiling. Stockbot stopped before committing anything." }
    : { big: <><N>0</N> wires. <N>0</N> days waiting. <N>1</N> human decision.</>, sub: <>Astro Robotics · PO <N>{PO.number}</N> closed in <N>{story.closedInDays}</N> days</> };
  const sceneGrid = scene.grid;
  const gridStyle: React.CSSProperties = gridMode
    ? { gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }
    : sceneGrid && placed.every((p) => !p.mine)
      ? { gridTemplateColumns: sceneGrid.cols.split(" ").map((c) => `minmax(0, ${c})`).join(" "), ...(sceneGrid.rows ? { gridTemplateRows: sceneGrid.rows.split(" ").map((r) => `minmax(0, ${r})`).join(" ") } : {}), ...(sceneGrid.areas ? { gridTemplateAreas: sceneGrid.areas.join(" ") } : {}) }
      : { gridTemplateColumns: `repeat(${Math.max(1, placed.length)}, minmax(0, 1fr))` };
  const useAreas = !gridMode && !!sceneGrid?.areas && placed.every((p) => !p.mine);
  const stacked = !gridMode && sceneGrid?.cols === "1fr" && placed.every((p) => !p.mine);

  // The remote (/present): send what is on screen, take its commands.
  const channel = useRef<BroadcastChannel | null>(null);
  const lastSent = useRef("");
  const cmdRef = useRef<(c: RemoteCommand["cmd"]) => void>(() => {});
  useEffect(() => {
    cmdRef.current = (c) => {
      if (c === "next") advanceRef.current();
      else if (c === "preview") previewFocus();
      else if (c === "skip") skipFocus();
      else if (c === "full") setFullSeq((n) => n + 1);
      else if (c === "camera") setCameraOn((x) => !x);
      else if (c === "follow") setFollow((x) => !x);
      else if (c === "cursor") setCursorPref(!cursorOn);
      else if (c === "hello" && lastSent.current) channel.current?.postMessage(JSON.parse(lastSent.current));
    };
  });
  const remoteState: RemoteState = {
    type: "state", scenario: SC.title, chapter: st.scene + 1, chapterTitle: scene.title, chapters: LIST.length,
    next: finished ? AFTER[scenarioId].label : nextLabel,
    camera: { on: cameraOn, follow, mode: camState.mode, focusId: camState.focusId, zoom: camState.zoom },
    upcoming: nextFocus?.focus ? { step: nextFocus.step ?? nextFocus.focus.id, id: nextFocus.focus.id, zoom: nextFocus.focus.zoom, skipped: skipped.includes(focusKey(nextFocus)) } : null,
  };
  const remoteJson = JSON.stringify(remoteState);
  useEffect(() => { lastSent.current = remoteJson; channel.current?.postMessage(JSON.parse(remoteJson)); }, [remoteJson]);
  useEffect(() => {
    const ch = openChannel();
    channel.current = ch;
    if (!ch) return;
    ch.onmessage = (e: MessageEvent<RemoteCommand>) => { if (e.data?.type === "cmd") cmdRef.current(e.data.cmd); };
    return () => { ch.close(); channel.current = null; };
  }, []);

  // Live, before the first step: how many order wallets are left and whether the treasury covers the commit.
  const liveStatus = live.on && (liveBusy || live.error)
    ? (live.error ? `Live call failed (${live.error}). The replay carries on.` : `Live on Tidepool testnet: ${heldStep} running`)
    : live.on && !live.done.length && live.preflight ? live.preflight.message
    : null;

  return (
    <PolicyContext.Provider value={policyCtx}>
    <ActionsContext.Provider value={actions}>
    <BoardContext.Provider value={boardCtx}>
    <div className={s.root} data-theme="clean" data-mode={mode} data-nav={navOpen ? "open" : "closed"} data-rail={railHidden ? "hidden" : "shown"} data-working={playing && st.stage !== "closed"} data-ghost={ghost.shown}>
      <Camera on={cameraOn} follow={follow} request={camRequest} fullSeq={fullSeq} holdNext={holdNext} onChange={setCamState}
        apiRef={camApi} overlay={cursorOn ? <GhostCursor g={ghost.g} shown={ghost.shown} reduced={reduced} /> : null}>
      <Sidebar open={navOpen} onToggle={() => setNavChoice(!navOpen)} onScreen={placed.map((p) => p.id)} pinned={board.filter((x): x is PanelId => !!x)}
        needs={needs} status={status}
        onPick={(id) => {
          if (board.includes(id)) { if (!locked.includes(id)) boardCtx.close(id); return; }
          const here = placed.find((p) => p.id === id);
          setBoard(here ? placeCard(board, locked, id, here.spot, placed) : openCard(board, id, placed));
        }}
        onClear={() => { setBoard(emptyBoard()); setLocked([]); }} />

      <main className={s.main}>
        <StatsBar st={st} title={!navOpen} />
        <div className={s.body}>
          {phoneOn && (
            <Phone messages={chat} to={phoneTo} clock={scene.clock ?? "09:00"} waiting={waiting} onAnswer={proceed} onNext={proceed} trailing={trailing}
              onChoice={(c) => { if (c.startsWith("Raise")) pickScenario("adjusted", ADJUSTMENT_SCENE); }}
              facts={{
                totalCents: st.limitApprovals.length > 0 ? amounts(adjustedUnit).lockedCents : PO.revisedTotalCents,
                releaseCents: st.dock?.releaseCents ?? 0, holdCents: st.dock?.holdCents ?? 0, receivedQty: st.dock?.receivedQty ?? 0, deadline: story.deadline,
              }} />
          )}
          <div className={s.stack}>
            <div className={s.grid} data-end={st.endCard} style={gridStyle}>
              {drag && Array.from({ length: SPOTS }, (_, spot) => (
                <div key={`spot-${spot}`} className={s.dropSpot} data-spot={spot} data-over={drag.over === spot}
                  style={{ gridColumn: (spot % COLS) + 1, gridRow: Math.floor(spot / COLS) + 1 }} aria-hidden="true" />
              ))}
              {placed.length === 0 && <p className={s.empty}>Pick a panel in the sidebar to pin it here.</p>}
              {placed.map(({ id, spot }, i) => {
                const P = PANELS[id];
                const moving = drag?.id === id;
                const style: React.CSSProperties = gridMode
                  ? { gridColumn: (spot % COLS) + 1, gridRow: Math.floor(spot / COLS) + 1, ...(moving ? { transform: `translate(${drag!.dx}px, ${drag!.dy}px)` } : {}) }
                  : useAreas ? { gridArea: id } : stacked ? { gridRow: i + 1 } : {};
                return (
                  <div key={id} className={s.slot} data-moving={moving} style={style}>
                    <P st={st} pulse={st.pulse === id} />
                  </div>
                );
              })}
            </div>
            {st.endCard && (
              <div className={s.endLine} role="region" aria-label="End card">
                <p className={s.endBig}>{endText.big}</p>
                <p className={s.endSub}>{endText.sub}</p>
              </div>
            )}
            <Drawer proof={pinned ?? (explainOn ? explainProof : null) ?? lastProof} lastProof={lastProof} history={history} open={drawerOpen} narrow={phoneOn}
              explain={explainOn ? st.explain : null} st={st}
              onToggle={() => { if (pinned) setPinnedProof(null); if (explainOn) setShutExplain(st.explain); setDrawerOpen(!drawerOpen); }} />
          </div>
        </div>
        {viewer && (
          <PhotoViewer checkpointId={viewer.checkpointId} index={viewer.index}
            onIndex={(index) => setViewer({ ...viewer, index })} onClose={() => setViewer(null)}
            onProof={(id) => { setPinnedProof(id); setViewer(null); }} />
        )}
      </main>
      </Camera>

      <DemoRail scenario={SC} scenarios={Object.values(SCENARIOS)} scene={st.scene} title={scene.title} line={scene.line}
        waiting={waiting} onHold={waiting?.id === "on_hold"} halted={waiting ? null : st.halted?.reason ?? null} rulesChanged={policyCtx.changed} onResetRules={policyCtx.reset}
        next={finished ? { label: AFTER[scenarioId].label, key: "⌘B" } : nextLabel ? { label: nextLabel, key: "⌘K" } : null} onNext={() => advanceRef.current()}
        present={present} setPresent={(p) => { setPlayMode(p ? "present" : "autoplay"); setCursorPref(null); if (!p) setPlaying(true); }}
        playing={playing && !finished} finished={finished} onPlayPause={() => { if (finished) { setT(0); setPlaying(true); } else setPlaying((x) => !x); }}
        pick={(id) => pickScenario(id)} jump={jump} restart={restart}
        live={{ available: live.available, on: live.on, toggle: () => live.setOn(!live.on), status: liveStatus }}
        mode={mode} toggleMode={() => setMode((m) => (m === "dark" ? "light" : "dark"))}
        synthetic={synthetic} proofsReal={proofsReal} hide={() => setRailHidden(true)}
        camera={{ on: cameraOn, follow, toggle: () => setCameraOn((c) => !c), toggleFollow: () => setFollow((f) => !f), focus: camState.focusId, next: nextFocus?.step ?? null,
          cursor: cursorOn, toggleCursor: () => setCursorPref(!cursorOn) }} />
      {railHidden && <RailShow onClick={() => setRailHidden(false)} />}
    </div>
    </BoardContext.Provider>
    </ActionsContext.Provider>
    </PolicyContext.Provider>
  );
}
