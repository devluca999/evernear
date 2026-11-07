#!/usr/bin/env node
// The frame check, in a real browser at 1920x1080. Walks a scenario in Present mode pressing Cmd+K,
// as a presenter would, and at every zoom checks that the focused element is fully inside the
// zoomed viewport, that nothing inside it is cut (text running out of a box, an ellipsis that is not
// a deliberate abbreviation, an ancestor clipping it), and that every text the step declares
// (scenes.ts `shows`) is on screen. At every press it also lists any cut text on the cards.
// Prints the presses each chapter takes. Replay only: it never turns Live on.
//
//   node scripts/check-frames.mjs [--url http://localhost:3000/] [--scenario happy|standoff|adjusted|all] [--shots dir]
//
// Uses the installed Google Chrome through the DevTools protocol (Node 24 has WebSocket built in).
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("url", "http://localhost:3000/");
const WHICH = arg("scenario", "all");
const SHOTS = arg("shots", null);
const CHROME = process.env.CHROME ?? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => existsSync(p));
if (!CHROME) { console.error("No Chrome found; set CHROME to its path."); process.exit(2); }
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "frames-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--hide-scrollbars", "--window-size=1920,1080", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });

let ws, seq = 0;
const waiting = new Map();
for (let i = 0; i < 60 && !ws; i++) {
  try { const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.type === "page"); if (page) ws = new WebSocket(page.webSocketDebuggerUrl); } catch { /* not up yet */ }
  if (!ws) await sleep(200);
}
await new Promise((r) => ws.addEventListener("open", r));
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; waiting.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const run = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await cdp("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

// In the page: what is on screen right now, and what is cut.
const PROBE = `(() => {
  const frame = document.querySelector("[data-camera]"); const fr = frame.getBoundingClientRect();
  const inside = (r, b) => r.left >= b.left - 1 && r.top >= b.top - 1 && r.right <= b.right + 1 && r.bottom <= b.bottom + 1;
  // Layout size, not screen size: a 1 px screen-reader label is still 1 px when the camera zooms.
  const tiny = (el) => (el.offsetWidth ?? 2) <= 1 || (el.offsetHeight ?? 2) <= 1;
  /** Boxes in el that cut their text: running out sideways, or out the bottom of a box that does not scroll. */
  const cuts = (root) => {
    const out = [];
    for (const d of [root, ...root.querySelectorAll("*")]) {
      if (tiny(d) || d.closest("[data-abbr]") || d.closest("svg")) continue;
      const cs = getComputedStyle(d);
      const clips = (v) => v === "hidden" || v === "clip";
      const scrolls = (v) => v === "auto" || v === "scroll";
      if ((clips(cs.overflowX) || cs.textOverflow === "ellipsis") && d.scrollWidth > d.clientWidth + 1) out.push("wide: " + (d.textContent || "").trim().slice(0, 60));
      else if (clips(cs.overflowY) && !scrolls(cs.overflowY) && d.scrollHeight > d.clientHeight + 1 && (d.textContent || "").trim()) out.push("tall: " + (d.textContent || "").trim().slice(0, 60));
    }
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (/…|\\.\\.\\./.test(n.textContent) && !n.parentElement.closest("[data-abbr]") && !tiny(n.parentElement)) out.push("ellipsis: " + n.textContent.trim().slice(0, 60));
    return out;
  };
  const chapter = ([...document.querySelectorAll("p, span, div")].map((e) => e.children.length ? "" : e.textContent).find((x) => /^(Happy path|Bad path|Bad path, adjusted) · Chapter \\d+$/.test(x || "")) || "").match(/(\\d+)$/)?.[1];
  const next = [...document.querySelectorAll("button")].map((b) => b.innerText.replace(/\\s+/g, " ").trim()).find((x) => /⌘K$/.test(x)) || null;
  const waitingFor = !!document.querySelector('[role="group"][aria-label="Waiting for you"]');
  const out = { chapter: Number(chapter), next, waitingFor, focus: frame.dataset.focusOn || null, zoom: Number(frame.dataset.zoom), problems: [], cards: [] };
  for (const card of document.querySelectorAll("[data-camera] [data-panel]")) { const c = card.getBoundingClientRect(); if (c.right > fr.left && c.left < fr.right) out.cards.push(...cuts(card).map((x) => card.dataset.panel + " " + x)); }
  if (!out.focus) return out;
  const el = [...document.querySelectorAll('[data-focus="' + out.focus + '"]')].find((e) => !tiny(e));
  if (!el) { out.problems.push("focus element missing"); return out; }
  const r = el.getBoundingClientRect();
  out.rect = [r.left - fr.left, r.top - fr.top, r.width, r.height].map(Math.round);
  if (!inside(r, fr)) out.problems.push("element runs past the viewport " + JSON.stringify(out.rect));
  for (let p = el.parentElement; p && p !== frame; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.overflow !== "visible" && !inside(r, p.getBoundingClientRect())) { out.problems.push("clipped by " + (p.getAttribute("aria-label") || p.dataset.panel || p.className.toString().slice(0, 30))); break; }
  }
  out.problems.push(...cuts(el));
  // Each declared text: the smallest element holding it is on screen and not scrolled away.
  const shows = JSON.parse(frame.dataset.shows || "[]");
  const norm = (s) => (s || "").replace(/\\s+/g, " ");
  for (const text of shows) {
    const holders = [el, ...el.querySelectorAll("*")].filter((d) => norm(d.textContent).includes(text) && !tiny(d));
    if (!holders.length) { out.problems.push("does not show " + JSON.stringify(text)); continue; }
    const h = holders.reduce((a, b) => (norm(b.textContent).length < norm(a.textContent).length ? b : a));
    const hr = h.getBoundingClientRect();
    if (!inside(hr, fr)) { out.problems.push(JSON.stringify(text) + " is off screen"); continue; }
    for (let p = h.parentElement; p && p !== frame; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflow !== "visible" && !inside(hr, p.getBoundingClientRect())) { out.problems.push(JSON.stringify(text) + " is scrolled or clipped away"); break; }
    }
  }
  return out;
})()`;

const press = () => run(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))`);
const scenarios = WHICH === "all" ? ["happy", "standoff", "adjusted"] : [WHICH];
const report = { url: BASE, scenarios: {} };
let failed = 0;

for (const sc of scenarios) {
  await cdp("Page.navigate", { url: `${BASE}?scenario=${sc}` });
  await sleep(3500);
  const presses = {}, zooms = [], cards = new Set();
  // The page opens on chapter 1; the first press is the first step.
  for (let n = 1; n <= 80; n++) {
    const before = await run(PROBE);
    if (!before.next && !before.waitingFor) { await sleep(800); const again = await run(PROBE); if (!again.next && !again.waitingFor) break; }
    if (before.next && /Try the bad path|Back to the happy path/.test(before.next)) break;
    await press();
    // Let a zoom start and settle (the cursor's glide comes first), then look.
    let m = null, last = null;
    for (let i = 0; i < 30; i++) { await sleep(100); m = await run(PROBE); if (m.focus && last && last.zoom === m.zoom && i > 9) break; last = m; }
    presses[m.chapter] = (presses[m.chapter] ?? 0) + 1;
    m.cards.forEach((x) => cards.add(`ch${m.chapter}: ${x}`));
    if (m.focus) {
      const ok = m.problems.length === 0;
      if (!ok) failed++;
      zooms.push({ press: n, chapter: m.chapter, focus: m.focus, zoom: m.zoom, ok, problems: m.problems });
      console.log(`${ok ? "ok  " : "FAIL"} ${sc} ch${m.chapter} press ${n} ${m.focus} x${m.zoom}${ok ? "" : "  " + m.problems.join("; ")}`);
      if (SHOTS) {
        const shot = await cdp("Page.captureScreenshot", { format: "png" });
        writeFileSync(join(SHOTS, `${sc}-ch${m.chapter}-${m.focus.replace(/\W+/g, "-")}.png`), Buffer.from(shot.result.data, "base64"));
      }
    }
    // Wait out the hold before the next press, as a presenter talking over it would.
    for (let i = 0; i < 40; i++) { await sleep(100); const x = await run(PROBE); if (!x.focus || x.zoom === 1) break; }
    await sleep(300);
  }
  report.scenarios[sc] = { presses, zooms, cardCuts: [...cards] };
  console.log(`${sc}: presses by chapter ${JSON.stringify(presses)}`);
  if (cards.size) console.log(`${sc}: cut text on cards (not zoomed):\n  ${[...cards].join("\n  ")}`);
}

writeFileSync(join(SHOTS ?? profile, "frames-report.json"), JSON.stringify(report, null, 1));
ws.close(); chrome.kill();
console.log(failed ? `${failed} zoom(s) cut or off screen` : "every zoom shows its element in full");
process.exit(failed ? 1 : 0);
