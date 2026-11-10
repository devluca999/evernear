// The search map's labels: on the final map (all five suppliers checked), at every likely map size,
// no label overlaps another, a pin, or the search bar, and the two that fit (Haoyun, QuickShip) are
// fully inside the map.
import { describe, expect, it } from "vitest";
import { boxesOverlap, estimateLabel, labelWhy, pinFrac, placeLabels, type Box } from "../workspace/map/labels";
import { MAP } from "../workspace/map/generated";
import { fullView } from "../workspace/map/view";
import { plainEngine } from "@/engine/plain";
import { bomFor, bom10MA, NEED_BY, offers, policy, suppliers } from "@/seed/astro";
import { pinReason } from "../workspace/format";

// The final search: the five suppliers Stockbot checks, scored as the story scores them.
const SEARCHED = ["haoyun", "quickship", "kansai", "rheinwerk", "huaxin"];
const results = suppliers.filter((s) => SEARCHED.includes(s.id)).map((sup) => plainEngine.scoreFitment(bom10MA, offers.filter((o) => o.supplierId === sup.id), sup, policy, NEED_BY));

describe("search map labels", () => {
  // Map box widths from a 1280 px screen to a 4K one (the box keeps the map's 720:300 shape).
  // Below 1050 px the suppliers that do not fit show a short reason.
  for (const w of [900, 1000, 1100, 1300, 1520, 1800]) {
    it(`never overlap at a ${w} px wide map, and the two that fit stay fully readable`, () => {
      const h = (w * 300) / 720;
      const view = fullView(MAP.width, MAP.height);
      const labels = results.map((f) => {
        const [fx, fy] = pinFrac(f.supplierId, view);
        const sup = suppliers.find((s) => s.id === f.supplierId)!;
        return { id: f.supplierId, px: fx * w, py: fy * h, ...estimateLabel(sup.name, labelWhy(pinReason(f, bomFor["10ma"].length).text, f.pass, w)), first: f.pass };
      });
      const search: Box = { x: 12, y: 12, w: Math.min(720, w - 68), h: 86 };
      const out = placeLabels(labels, { x: 0, y: 0, w, h }, [search]);
      const boxes = out.map((p, i) => ({ id: p.id, b: { x: p.x, y: p.y, w: labels[i].w, h: labels[i].h } }));
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) expect(boxesOverlap(boxes[i].b, boxes[j].b), `${boxes[i].id} over ${boxes[j].id}`).toBe(false);
        for (const l of labels) if (l.id !== boxes[i].id) expect(boxesOverlap(boxes[i].b, { x: l.px - 4, y: l.py - 4, w: 8, h: 8 }), `${boxes[i].id} over ${l.id}'s pin`).toBe(false);
        expect(boxesOverlap(boxes[i].b, search), `${boxes[i].id} under the search bar`).toBe(false);
      }
      for (const { id, b } of boxes.filter((x) => ["haoyun", "quickship"].includes(x.id))) {
        expect(b.x >= 0 && b.y >= 0 && b.x + b.w <= w && b.y + b.h <= h, `${id} inside the map`).toBe(true);
      }
      expect(results.filter((f) => f.pass).map((f) => f.supplierId).sort()).toEqual(["haoyun", "quickship"]);
    });
  }
});
