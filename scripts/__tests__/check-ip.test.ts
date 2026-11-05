import { describe, expect, it } from "vitest";
// plain ESM script, typed loosely
import { scan } from "../check-ip.mjs";

const run = (text: string) => scan(["a.ts"], () => text) as string[];

describe("check:ip", () => {
  it("passes clean text", () => {
    expect(run("const total = 38000;\nSupplier: Haoyun")).toEqual([]);
  });
  it("flags ticket and spec ids", () => {
    expect(run("see EN" + "G-12")).toHaveLength(1);
    expect(run("spec S" + "61 says")).toHaveLength(1);
    expect(run("S" + "42 is fine")).toHaveLength(0);
  });
  it("flags blocked words in any case", () => {
    expect(run("Ever" + "Bot")).toHaveLength(1);
    expect(run("compo" + "sio sdk")).toHaveLength(1);
    expect(run("restock" + "-chain")).toHaveLength(1);
  });
  it("skips the exempt rule file", () => {
    expect(scan(["CLAUDE.md"], () => "ever" + "bot")).toEqual([]);
  });
});
