# dock-check

OutLayer WASI module that computes the release for a delivery: received quantity times unit price, the rest held. Same arithmetic as `engine/plain.ts` `matchReceipt`; both are checked against `vectors.json` (Rust: `cargo test`, TypeScript: `tests/dockcheck.test.ts`).

Build (needs Rust with the `wasm32-wasip2` target):

```bash
rustup target add wasm32-wasip2
cargo test
cargo build --release --target wasm32-wasip2
sha256sum target/wasm32-wasip2/release/dock-check.wasm   # this is DOCK_CHECK_WASM_SHA256
```

Deploy on testnet (needs a NEAR testnet key via `outlayer login testnet`): `outlayer upload` then `outlayer deploy dock-check <url>`. Runs over HTTPS need a funded payment key.

Release rule: `convex/near/dockcheck.ts` refuses any release whose attestation does not name the approved wasm sha256, or whose input or output hash does not match, or whose amount differs from the engine.
