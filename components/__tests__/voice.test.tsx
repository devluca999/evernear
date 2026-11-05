// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Workspace } from "../workspace/Workspace";
import { scenes } from "@/scenario/scenes";
import { sceneStartMs } from "@/scenario/runner";

afterEach(cleanup);
const BAD = /[!–—]|\p{Extended_Pictographic}/u;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe("voice", () => {
  it("shows no exclamation marks, en or em dashes, or emoji on any scene", () => {
    for (const sc of scenes) {
      for (const off of [500, sc.durationMs - 100]) {
        const { container, unmount } = render(<Workspace initialMs={sceneStartMs(sc.id) + off} autoplay={false} />);
        expect(container.textContent ?? "", `scene ${sc.id}`).not.toMatch(BAD);
        unmount();
      }
    }
  });
  it("keeps dashes and emoji out of story data and fixtures", () => {
    for (const f of [...files("scenario"), ...files("seed"), ...files("fixtures")].filter((f) => !f.includes("__tests__"))) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/[–—]|\p{Extended_Pictographic}/u);
    }
  });
});
