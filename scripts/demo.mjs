#!/usr/bin/env node
// DEMO_MODE=1 npm run demo: builds and serves the workspace replaying recorded fixtures.
// Needs no keys and no Convex deployment. --check builds, starts, fetches the page and exits.
import { spawn, spawnSync } from "node:child_process";

const env = { ...process.env, DEMO_MODE: process.env.DEMO_MODE ?? "1" };
const port = process.env.PORT ?? "3000";
const check = process.argv.includes("--check");
const bin = (name) => `node_modules/.bin/${name}`;

if (env.DEMO_MODE !== "1") console.log("DEMO_MODE is not 1; serving anyway with replayed fixtures.");
const build = spawnSync(bin("next"), ["build"], { stdio: "inherit", env });
if (build.status !== 0) process.exit(build.status ?? 1);

const server = spawn(bin("next"), ["start", "-p", port], { stdio: check ? "ignore" : "inherit", env });
const url = `http://localhost:${port}/`;
if (!check) {
  console.log(`\nEvernear demo on ${url}  (?scene=0 to 9 jumps to a scene, ?mode=light for the light theme)`);
} else {
  let ok = false;
  for (let i = 0; i < 40 && !ok; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(url);
      const html = await res.text();
      ok = res.status === 200 && html.includes("<title>Evernear</title>");
    } catch {}
  }
  server.kill();
  console.log(ok ? "demo check passed" : "demo check failed");
  process.exit(ok ? 0 : 1);
}
