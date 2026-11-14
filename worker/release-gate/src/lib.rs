//! Evernear release gate. Holds the escrow grant token only inside an attested OutLayer run
//! and releases money from a per-order Tidepool agent only when the stage's signals are present.
//!
//! Everything here is pure: the host calls (mac, sign, public key, env, HTTP) sit behind the
//! `Host` trait, so `cargo test` runs natively. `src/main.rs` implements `Host` on OutLayer.
//! Amounts are integer US cents. The arithmetic refuses rather than rounds.

use base64::Engine;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

/// The only host the module sends to. Tidepool, the testnet copy of the Agent API.
pub const TIDEPOOL_HOST: &str = "www.usetidepool.tech";
/// Base Sepolia USDC as Tidepool names it on NEAR testnet (6 decimals).
pub const ASSET: &str = "nep141:base-0x38d81431b9f76d9699af7517040d5221d9dea252.tp-omft.testnet";
pub const CHAIN: &str = "base";
/// Declared in manifest.json: the encryption key used only through `mac`.
pub const GRANT_KEY_PATH: &str = "grant";
/// Declared in manifest.json: the ed25519 key that signs every release result.
pub const RESULT_KEY_PATH: &str = "result";
/// Every signed message starts with this; the module composes the rest itself.
pub const SIGN_PREFIX: &[u8] = b"evernear-release-gate:v1:";
/// The grant token is the MAC of this prefix plus the agent id.
pub const GRANT_PREFIX: &[u8] = b"tidepool-grant:v1:";
/// The env var (an OutLayer secret) holding Evernear's Tidepool API key.
pub const API_KEY_ENV: &str = "AGENT_API_KEY";
/// An on-chain run's output must fit in this many bytes.
pub const MAX_OUTPUT_BYTES: usize = 900;

/// The advance share the buyer's rules set (policy/astro.json `advance_percent`). Pinned in the
/// build, so a caller cannot ask for a bigger advance; a rule change is a new build and a new grant.
pub const ADVANCE_PERCENT: u64 = 30;

/// v3: the receiving dock devices whose signed count the balance is paid on, pinned in the build
/// (the same keys as the deployment's DOCK_DEVICE_KEYS). A new device is a new build and a new grant.
pub const PINNED_DOCK_DEVICES: [(&str, &str); 1] = [("dock-3-scanner", "cb7f72a5c9f648acf4b989d5868d1129374da140a206eba6304bc4a43a594edc")];
/// The bytes a dock device signs: this prefix, then canonical JSON of {at, count, device, po}.
pub const DOCK_PREFIX: &str = "evernear-dock-count:v1:";

pub const ADVANCE_SIGNALS: [&str; 2] = ["bill_of_lading", "export_cleared"];
pub const BALANCE_SIGNALS: [&str; 2] = ["import_cleared", "dock_count"];

const MAX_ID_LEN: usize = 48;
const MAX_TX_FIELD_LEN: usize = 80;

/// The host functions the module needs. On OutLayer these are the `outlayer:encryption-keys`
/// and `outlayer:signing-keys` imports, the run's env, and wasi-http.
pub trait Host {
    fn mac(&self, path: &str, data: &[u8]) -> Result<Vec<u8>, String>;
    fn sign(&self, path: &str, message: &[u8]) -> Result<Vec<u8>, String>;
    fn public_key(&self, path: &str) -> Result<Vec<u8>, String>;
    fn env(&self, name: &str) -> Option<String>;
    /// Send a POST. Called only with a request `check_url` accepted.
    fn post(&self, request: &HttpRequest) -> Result<HttpResponse, String>;
    /// Send a GET (the order account's policy and balances). Called only with a request `check_url` accepted.
    fn get(&self, request: &HttpRequest) -> Result<HttpResponse, String>;
}

#[derive(Debug, Clone, PartialEq)]
pub struct HttpRequest {
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct HttpResponse {
    pub status: u16,
    pub body: Vec<u8>,
}

// ---------- input ----------

#[derive(Debug, Clone, Deserialize)]
pub struct ReleaseInput {
    pub stage: String,
    pub po: String,
    pub agent_id: String,
    pub to: String,
    pub unit_cents: u64,
    pub ordered_qty: u64,
    pub locked_cents: u64,
    pub released_cents: u64,
    pub advance_percent: u64,
    #[serde(default)]
    pub received_qty: Option<u64>,
    #[serde(default)]
    pub signals: BTreeMap<String, Value>,
    /// Accepted for compatibility. The module always sends its own key (`idempotency_key`).
    #[serde(default)]
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "mode", rename_all = "snake_case")]
enum Input {
    Enroll { agent_id: String },
    Release(ReleaseInput),
}

// ---------- the decision ----------

#[derive(Debug, Clone, PartialEq)]
pub enum Decision {
    Release { amount_cents: u64, held_cents: u64, signal_ids: Vec<String> },
    Refuse { reason: &'static str, missing: Vec<String> },
}

fn refuse(reason: &'static str) -> Decision {
    Decision::Refuse { reason, missing: vec![] }
}

/// Short identifiers that end up in signed output and in URLs: a fixed safe alphabet.
pub fn valid_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= MAX_ID_LEN
        && s.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.' | b':'))
}

/// Tidepool agent ids look like `agent_fe8606f9c6dc60f3f1768ed9`. The id goes into the URL
/// path, so anything else is refused.
pub fn valid_agent_id(s: &str) -> bool {
    match s.strip_prefix("agent_") {
        Some(rest) => !rest.is_empty() && rest.len() <= 40 && rest.bytes().all(|b| b.is_ascii_alphanumeric()),
        None => false,
    }
}

/// An EVM address: `0x` and 40 hex digits.
pub fn valid_evm_address(s: &str) -> bool {
    s.len() == 42 && s.starts_with("0x") && s[2..].bytes().all(|b| b.is_ascii_hexdigit())
}

/// The id of one evidence object, or None when the evidence does not count: it must be a
/// non-empty object with a string `id` (safe alphabet) and an `at`.
pub fn evidence_id(evidence: &Value) -> Option<String> {
    let obj = evidence.as_object()?;
    if obj.is_empty() {
        return None;
    }
    let id = obj.get("id")?.as_str()?;
    let at = obj.get("at")?;
    let at_ok = match at {
        Value::String(s) => !s.is_empty(),
        Value::Number(_) => true,
        _ => false,
    };
    (valid_id(id) && at_ok).then(|| id.to_string())
}

pub fn required_signals(stage: &str) -> Option<&'static [&'static str; 2]> {
    match stage {
        "advance" => Some(&ADVANCE_SIGNALS),
        "balance" => Some(&BALANCE_SIGNALS),
        _ => None,
    }
}

/// Decide one release. Pure: no host, no clock.
pub fn decide(r: &ReleaseInput) -> Decision {
    let Some(required) = required_signals(&r.stage) else { return refuse("bad_stage") };
    if !valid_agent_id(&r.agent_id) {
        return refuse("bad_agent_id");
    }
    if !valid_evm_address(&r.to) {
        return refuse("bad_recipient");
    }
    if r.unit_cents == 0 || r.ordered_qty == 0 {
        return refuse("bad_terms");
    }
    // The order's wallet holds the full order value: locked must be ordered x unit exactly.
    match r.ordered_qty.checked_mul(r.unit_cents) {
        Some(total) if total == r.locked_cents => {}
        _ => return refuse("locked_mismatch"),
    }
    if r.released_cents > r.locked_cents {
        return refuse("over_locked");
    }

    // Every required signal, all reported at once.
    let mut missing = Vec::new();
    let mut signal_ids = Vec::new();
    for name in required.iter() {
        match r.signals.get(*name).and_then(evidence_id) {
            Some(id) => signal_ids.push(id),
            None => missing.push(name.to_string()),
        }
    }
    if !missing.is_empty() {
        return Decision::Refuse { reason: "missing_signals", missing };
    }

    let amount: u64 = match r.stage.as_str() {
        "advance" => {
            if r.released_cents != 0 {
                return refuse("already_released");
            }
            if r.advance_percent == 0 || r.advance_percent > 100 {
                return refuse("bad_percent");
            }
            if r.advance_percent != ADVANCE_PERCENT {
                return refuse("percent_not_policy");
            }
            let Some(product) = r.locked_cents.checked_mul(r.advance_percent) else {
                return refuse("bad_terms");
            };
            if product % 100 != 0 {
                return refuse("inexact_amount");
            }
            product / 100
        }
        _ => {
            let Some(received) = r.received_qty else { return refuse("missing_received_qty") };
            if received > r.ordered_qty {
                return refuse("received_over_ordered");
            }
            // The dock count evidence must state the same count the release is computed from.
            let counted = r.signals.get("dock_count").and_then(|e| e.get("count")).and_then(Value::as_u64);
            if counted != Some(received) {
                return refuse("count_mismatch");
            }
            let due = (received as i128) * (r.unit_cents as i128) - (r.released_cents as i128);
            if due <= 0 {
                return refuse("nothing_due");
            }
            due as u64
        }
    };
    if amount == 0 {
        return refuse("nothing_due");
    }
    match r.released_cents.checked_add(amount) {
        Some(total) if total <= r.locked_cents => Decision::Release {
            amount_cents: amount,
            held_cents: r.locked_cents - total,
            signal_ids,
        },
        _ => refuse("over_locked"),
    }
}

// ---------- token, scale, canonical JSON ----------

/// `ngt_` + base64url without padding of the 32 MAC bytes: 47 characters.
pub fn grant_token_from_mac(mac: &[u8]) -> Result<String, String> {
    if mac.len() != 32 {
        return Err(format!("mac must be 32 bytes, got {}", mac.len()));
    }
    Ok(format!("ngt_{}", base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(mac)))
}

/// Tidepool's rule for a grant token: `^ngt_[A-Za-z0-9_-]{43}$`.
pub fn valid_grant_token(t: &str) -> bool {
    t.len() == 47
        && t.starts_with("ngt_")
        && t[4..].bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// What `grant_issue` registers: sha256 hex of the token string (the SDK's `grantCommitment`).
pub fn grant_hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

pub fn grant_mac_input(agent_id: &str) -> Vec<u8> {
    let mut data = GRANT_PREFIX.to_vec();
    data.extend_from_slice(agent_id.as_bytes());
    data
}

/// Story cents to Base USDC base units at the testnet scale of 1:1,000.
/// cents / 100 dollars, / 1000 scale, x 10^6 base units = cents x 10. Always exact.
pub fn cents_to_base_units(cents: u64) -> String {
    ((cents as u128) * 10).to_string()
}

/// The module's own idempotency key: one per agent, order and stage, so a repeated run of
/// the same stage replays the first result instead of paying again.
pub fn idempotency_key(agent_id: &str, po: &str, stage: &str) -> String {
    let digest = Sha256::digest(format!("evernear-release-gate:v1:idem:{agent_id}:{po}:{stage}").as_bytes());
    format!("rg1-{stage}-{}", &hex::encode(digest)[..32])
}

/// Canonical JSON: object keys sorted by their UTF-8 bytes, no whitespace, strings and
/// numbers as serde_json writes them (the same as JavaScript `JSON.stringify` for the
/// values this module emits: ASCII strings and integers).
pub fn canonical(v: &Value) -> String {
    let mut out = String::new();
    write_canonical(v, &mut out);
    out
}

fn write_canonical(v: &Value, out: &mut String) {
    match v {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            out.push('{');
            for (i, k) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(k).expect("string"));
                out.push(':');
                write_canonical(&map[*k], out);
            }
            out.push('}');
        }
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_canonical(item, out);
            }
            out.push(']');
        }
        other => out.push_str(&serde_json::to_string(other).expect("scalar")),
    }
}

/// The exact bytes the `result` key signs: the prefix, then the canonical JSON of the
/// result without its `signature` member.
pub fn signed_message(result: &Value) -> Vec<u8> {
    let mut unsigned = result.clone();
    if let Value::Object(map) = &mut unsigned {
        map.remove("signature");
    }
    let mut msg = SIGN_PREFIX.to_vec();
    msg.extend_from_slice(canonical(&unsigned).as_bytes());
    msg
}

pub fn evidence_sha256(r: &ReleaseInput) -> String {
    let mut used = Map::new();
    if let Some(required) = required_signals(&r.stage) {
        for name in required.iter() {
            if let Some(e) = r.signals.get(*name) {
                used.insert(name.to_string(), e.clone());
            }
        }
    }
    hex::encode(Sha256::digest(canonical(&Value::Object(used)).as_bytes()))
}

// ---------- the request ----------

/// Accept only `https://www.usetidepool.tech/v1/agents/...`. No other scheme, no port, no
/// user info, no other host (in particular never the mainnet `api.agentsonintents.com`).
pub fn check_url(url: &str) -> Result<(), String> {
    let rest = url.strip_prefix("https://").ok_or("only https is allowed")?;
    let (authority, path) = match rest.find('/') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, ""),
    };
    if authority != TIDEPOOL_HOST {
        return Err(format!("host not allowed: {authority}"));
    }
    if !path.starts_with("/v1/agents/") || path.contains("..") || path.contains('?') || path.contains('#') {
        return Err("path not allowed".into());
    }
    Ok(())
}

pub fn withdraw_url(agent_id: &str) -> String {
    format!("https://{TIDEPOOL_HOST}/v1/agents/{agent_id}/withdraw")
}

pub fn withdraw_body(amount_cents: u64, to: &str) -> String {
    canonical(&json!({
        "asset": ASSET,
        "amount": cents_to_base_units(amount_cents),
        "chain": CHAIN,
        "recipient": to,
    }))
}

pub fn build_withdraw(agent_id: &str, po: &str, stage: &str, amount_cents: u64, to: &str, api_key: &str, grant_token: &str) -> Result<HttpRequest, String> {
    let url = withdraw_url(agent_id);
    check_url(&url)?;
    Ok(HttpRequest {
        url,
        headers: vec![
            ("x-api-key".into(), api_key.into()),
            ("x-grant-token".into(), grant_token.into()),
            ("idempotency-key".into(), idempotency_key(agent_id, po, stage)),
            ("content-type".into(), "application/json".into()),
        ],
        body: withdraw_body(amount_cents, to).into_bytes(),
    })
}

fn short(v: Option<&Value>) -> Option<Value> {
    let s = v?.as_str()?;
    let s: String = s.chars().take(MAX_TX_FIELD_LEN).collect();
    Some(Value::String(s))
}

/// The identifying fields of Tidepool's answer (a `StatusResponse`, or an `ErrorDocument`).
pub fn tx_fields(status: u16, body: &[u8]) -> Value {
    let parsed: Value = serde_json::from_slice(body).unwrap_or(Value::Null);
    let mut tx = Map::new();
    tx.insert("http_status".into(), json!(status));
    for k in ["correlation_id", "status", "failure_code"] {
        if let Some(v) = short(parsed.get(k)) {
            tx.insert(k.into(), v);
        }
    }
    if let Some(details) = parsed.get("details") {
        for k in ["tx_hash", "transaction_hash", "intent_hash", "destination_tx_hash"] {
            if let Some(v) = short(details.get(k)) {
                tx.insert(k.into(), v);
            }
        }
    }
    if let Some(err) = parsed.get("errors").and_then(|e| e.get(0)) {
        if let Some(v) = short(err.get("code")) {
            tx.insert("error_code".into(), v);
        }
        if let Some(v) = short(err.get("layer")) {
            tx.insert("error_layer".into(), v);
        }
    }
    Value::Object(tx)
}

// ---------- the order account, read from Tidepool ----------

/// What the order account itself says, so the module does not take it from the caller: the
/// committed total (the per-transaction cap the owner set at open), the one withdraw address its
/// policy allows, and what it still holds. `released` is derived: committed minus held.
#[derive(Debug, Clone, PartialEq)]
pub struct ChainState {
    pub locked_cents: u64,
    pub held_cents: u64,
    pub withdraw_to: String,
}

impl ChainState {
    /// What has left the account, at least: committed minus held, never below zero (a deposit
    /// from outside can make the account hold more than the commitment).
    pub fn released_cents(&self) -> u64 {
        self.locked_cents.saturating_sub(self.held_cents)
    }
}

pub fn agent_url(agent_id: &str, sub: &str) -> String {
    format!("https://{TIDEPOOL_HOST}/v1/agents/{agent_id}/{sub}")
}

fn get_request(agent_id: &str, sub: &str, api_key: &str) -> Result<HttpRequest, String> {
    let url = agent_url(agent_id, sub);
    check_url(&url)?;
    Ok(HttpRequest { url, headers: vec![("x-api-key".into(), api_key.into()), ("accept".into(), "application/json".into())], body: vec![] })
}

/// Base units (6 decimals, 1:1,000) back to story cents; refuses anything not a whole cent.
pub fn base_units_to_cents(units: &str) -> Option<u64> {
    let u: u128 = units.parse().ok()?;
    if u % 10 != 0 {
        return None;
    }
    u64::try_from(u / 10).ok()
}

/// A balance in base units to whole cents, rounded down: dust sent in from outside never blocks a release.
pub fn base_units_to_cents_floor(units: &str) -> Option<u64> {
    let u: u128 = units.parse().ok()?;
    u64::try_from(u / 10).ok()
}

/// Reads the policy and balances answers. Refuses an account that is frozen, not applied, does
/// not restrict destinations to an allowlist, or allows more or fewer than one withdraw address.
pub fn parse_chain_state(policy: &[u8], balances: &[u8]) -> Result<ChainState, &'static str> {
    let p: Value = serde_json::from_slice(policy).map_err(|_| "chain_unreadable")?;
    if let Some(st) = p.get("status").and_then(Value::as_str) {
        if st != "APPLIED" {
            return Err("policy_not_applied");
        }
    }
    let pol = p.get("policy").ok_or("chain_unreadable")?;
    if pol.get("frozen").and_then(Value::as_bool) == Some(true) {
        return Err("account_frozen");
    }
    let dest = pol.get("destinations").ok_or("policy_not_restrictive")?;
    if dest.get("mode").and_then(Value::as_str) != Some("only") {
        return Err("policy_not_restrictive");
    }
    let withdraws: Vec<&Value> = dest.get("list").and_then(Value::as_array).map(|l| l.iter().filter(|d| d.get("action").and_then(Value::as_str) == Some("withdraw")).collect()).unwrap_or_default();
    if withdraws.len() != 1 || withdraws[0].get("chain").and_then(Value::as_str) != Some(CHAIN) {
        return Err("policy_withdraw_ambiguous");
    }
    let withdraw_to = withdraws[0].get("address").and_then(Value::as_str).filter(|a| valid_evm_address(a)).ok_or("policy_withdraw_ambiguous")?.to_ascii_lowercase();
    let cap = pol.get("limits").and_then(|l| l.get("per_transaction")).and_then(|c| c.get(ASSET)).and_then(Value::as_str).ok_or("policy_no_cap")?;
    let locked_cents = base_units_to_cents(cap).ok_or("policy_no_cap")?;
    let b: Value = serde_json::from_slice(balances).map_err(|_| "chain_unreadable")?;
    let held_units = b.get("balances").and_then(Value::as_array).ok_or("chain_unreadable")?
        .iter().find(|x| x.get("asset_id").and_then(Value::as_str) == Some(ASSET))
        .and_then(|x| x.get("balance_raw").and_then(Value::as_str)).unwrap_or("0");
    let held_cents = base_units_to_cents_floor(held_units).ok_or("chain_unreadable")?;
    Ok(ChainState { locked_cents, held_cents, withdraw_to })
}

fn read_chain_state(host: &dyn Host, agent_id: &str, api_key: &str) -> Result<ChainState, &'static str> {
    let policy = host.get(&get_request(agent_id, "policy", api_key).map_err(|_| "host_not_allowed")?).map_err(|_| "chain_unavailable")?;
    let balances = host.get(&get_request(agent_id, "balances", api_key).map_err(|_| "host_not_allowed")?).map_err(|_| "chain_unavailable")?;
    if !(200..300).contains(&policy.status) || !(200..300).contains(&balances.status) {
        return Err("chain_unavailable");
    }
    parse_chain_state(&policy.body, &balances.body)
}

/// The caller's numbers must agree with the account: the same commitment, the same recipient,
/// and the same amount already released. A disagreement is refused, never trusted.
pub fn check_against_chain(r: &ReleaseInput, c: &ChainState) -> Result<(), &'static str> {
    if r.locked_cents != c.locked_cents {
        return Err("locked_not_on_chain");
    }
    if r.to.to_ascii_lowercase() != c.withdraw_to {
        return Err("recipient_not_on_chain");
    }
    // Refused when more has left the account than the caller says (an understated release would
    // be paid again). Overstating only lowers what this stage pays, so it is not refused here.
    if c.released_cents() > r.released_cents {
        return Err("released_not_on_chain");
    }
    Ok(())
}

// ---------- v3: the signed dock count ----------

/// The balance is paid only on a dock count signed by a pinned receiving device, for this PO, equal to
/// the count the amount is computed from. Evidence received from a known device, not a physical fact.
pub fn check_dock_attestation(r: &ReleaseInput) -> Result<(), &'static str> {
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};
    let a = r.signals.get("dock_count").and_then(|d| d.get("attestation")).ok_or("dock_unsigned")?;
    let field = |k: &str| a.get(k).and_then(Value::as_str);
    let (device, key, sig, po, at) = (field("device"), field("publicKey"), field("signature"), field("po"), field("at"));
    let (Some(device), Some(key), Some(sig), Some(po), Some(at)) = (device, key, sig, po, at) else { return Err("dock_unsigned") };
    let count = a.get("count").and_then(Value::as_u64).ok_or("dock_unsigned")?;
    let pinned = PINNED_DOCK_DEVICES.iter().find(|(d, _)| *d == device).ok_or("dock_unknown_device")?;
    if !pinned.1.eq_ignore_ascii_case(key) {
        return Err("dock_unknown_device");
    }
    let pk: [u8; 32] = hex::decode(pinned.1).ok().and_then(|b| b.try_into().ok()).ok_or("dock_unknown_device")?;
    let sig: [u8; 64] = hex::decode(sig).ok().and_then(|b| b.try_into().ok()).ok_or("dock_bad_signature")?;
    let msg = format!("{DOCK_PREFIX}{}", canonical(&json!({"at": at, "count": count, "device": device, "po": po})));
    VerifyingKey::from_bytes(&pk).map_err(|_| "dock_unknown_device")?
        .verify(msg.as_bytes(), &Signature::from_bytes(&sig)).map_err(|_| "dock_bad_signature")?;
    if po != r.po {
        return Err("dock_wrong_po");
    }
    if Some(count) != r.received_qty {
        return Err("dock_count_mismatch");
    }
    Ok(())
}

// ---------- the run ----------

fn sign_result(host: &dyn Host, mut result: Map<String, Value>) -> String {
    let public_key = match host.public_key(RESULT_KEY_PATH) {
        Ok(pk) => hex::encode(pk),
        Err(e) => return canonical(&json!({"ok": false, "reason": "signing_unavailable", "detail": e})),
    };
    result.insert("public_key".into(), Value::String(public_key));
    let unsigned = Value::Object(result);
    match host.sign(RESULT_KEY_PATH, &signed_message(&unsigned)) {
        Ok(sig) => {
            let mut signed = unsigned;
            signed["signature"] = Value::String(hex::encode(sig));
            canonical(&signed)
        }
        Err(e) => canonical(&json!({"ok": false, "reason": "signing_unavailable", "detail": e})),
    }
}

fn derive_token(host: &dyn Host, agent_id: &str) -> Result<String, String> {
    let mac = host.mac(GRANT_KEY_PATH, &grant_mac_input(agent_id))?;
    let token = grant_token_from_mac(&mac)?;
    if !valid_grant_token(&token) {
        return Err("derived token has the wrong shape".into());
    }
    Ok(token)
}

pub fn enroll(host: &dyn Host, agent_id: &str) -> String {
    if !valid_agent_id(agent_id) {
        return canonical(&json!({"ok": false, "mode": "enroll", "reason": "bad_agent_id"}));
    }
    let token = match derive_token(host, agent_id) {
        Ok(t) => t,
        Err(e) => return canonical(&json!({"ok": false, "mode": "enroll", "reason": "mac_unavailable", "detail": e})),
    };
    let public_key = match host.public_key(RESULT_KEY_PATH) {
        Ok(pk) => hex::encode(pk),
        Err(e) => return canonical(&json!({"ok": false, "mode": "enroll", "reason": "signing_unavailable", "detail": e})),
    };
    // The token itself never leaves this function.
    canonical(&json!({
        "mode": "enroll",
        "agent_id": agent_id,
        "grant_hash": grant_hash(&token),
        "public_key": public_key,
    }))
}

fn refusal(r: &ReleaseInput, reason: &str, missing: Vec<String>, extra: Option<(&str, Value)>) -> Map<String, Value> {
    let mut m = Map::new();
    m.insert("ok".into(), json!(false));
    m.insert("stage".into(), json!(r.stage));
    m.insert("po".into(), json!(r.po));
    m.insert("agent_id".into(), json!(r.agent_id));
    m.insert("reason".into(), json!(reason));
    m.insert("missing".into(), json!(missing));
    m.insert("evidence_sha256".into(), json!(evidence_sha256(r)));
    if let Some((k, v)) = extra {
        m.insert(k.into(), v);
    }
    m
}

pub fn release(host: &dyn Host, r: &ReleaseInput) -> String {
    // stage, po and agent_id are echoed into signed output: check their alphabet first.
    if !valid_id(&r.stage) || !valid_id(&r.po) || !valid_agent_id(&r.agent_id) {
        return canonical(&json!({"ok": false, "reason": "bad_input", "detail": "stage, po or agent_id is malformed"}));
    }
    let (amount, held, signal_ids) = match decide(r) {
        Decision::Refuse { reason, missing } => return sign_result(host, refusal(r, reason, missing, None)),
        Decision::Release { amount_cents, held_cents, signal_ids } => (amount_cents, held_cents, signal_ids),
    };
    if r.stage == "balance" {
        if let Err(reason) = check_dock_attestation(r) {
            return sign_result(host, refusal(r, reason, vec![], None));
        }
    }
    let Some(api_key) = host.env(API_KEY_ENV).filter(|k| !k.is_empty()) else {
        return sign_result(host, refusal(r, "api_key_missing", vec![], None));
    };
    // v2: the commitment, the recipient and what was already released come from the order
    // account on Tidepool, not from the caller. The decision above ran on the caller's numbers;
    // they must match the account's or nothing is sent.
    let chain = match read_chain_state(host, &r.agent_id, &api_key) {
        Ok(c) => c,
        Err(reason) => return sign_result(host, refusal(r, reason, vec![], None)),
    };
    if let Err(reason) = check_against_chain(r, &chain) {
        return sign_result(host, refusal(r, reason, vec![], Some(("chain", json!({"locked_cents": chain.locked_cents, "held_cents": chain.held_cents, "to": chain.withdraw_to})))));
    }
    let token = match derive_token(host, &r.agent_id) {
        Ok(t) => t,
        Err(_) => return sign_result(host, refusal(r, "mac_unavailable", vec![], None)),
    };
    let request = match build_withdraw(&r.agent_id, &r.po, &r.stage, amount, &r.to, &api_key, &token) {
        Ok(req) => req,
        Err(_) => return sign_result(host, refusal(r, "host_not_allowed", vec![], None)),
    };
    let response = match host.post(&request) {
        Ok(resp) => resp,
        // Maybe sent, maybe not: run again with the same input; the idempotency key replays.
        Err(_) => return sign_result(host, refusal(r, "withdraw_unknown", vec![], Some(("amount_cents", json!(amount))))),
    };
    let tx = tx_fields(response.status, &response.body);
    let status = tx.get("status").and_then(Value::as_str).unwrap_or("");
    let accepted = (200..300).contains(&response.status)
        && !matches!(status, "FAILED" | "REFUNDED" | "NEEDS_REVIEW" | "");
    if !accepted {
        return fit_signed(host, refusal(r, "withdraw_refused", vec![], Some(("tx", tx))));
    }
    let mut m = Map::new();
    m.insert("ok".into(), json!(true));
    m.insert("stage".into(), json!(r.stage));
    m.insert("po".into(), json!(r.po));
    m.insert("agent_id".into(), json!(r.agent_id));
    m.insert("amount_cents".into(), json!(amount));
    m.insert("held_cents".into(), json!(held));
    m.insert("to".into(), json!(r.to));
    m.insert("tx".into(), tx);
    m.insert("signals".into(), json!(signal_ids));
    m.insert("evidence_sha256".into(), json!(evidence_sha256(r)));
    fit_signed(host, m)
}

/// Sign, and if the output would not fit an on-chain answer, drop the least needed tx
/// fields (never `correlation_id` or `status`) and sign again.
fn fit_signed(host: &dyn Host, mut m: Map<String, Value>) -> String {
    const DROP_ORDER: [&str; 7] = ["transaction_hash", "intent_hash", "failure_code", "destination_tx_hash", "tx_hash", "error_layer", "http_status"];
    let mut out = sign_result(host, m.clone());
    for field in DROP_ORDER {
        if out.len() <= MAX_OUTPUT_BYTES {
            break;
        }
        if let Some(Value::Object(tx)) = m.get_mut("tx") {
            tx.remove(field);
        }
        out = sign_result(host, m.clone());
    }
    out
}

/// The whole run: input JSON in, output JSON out. Never panics on bad input.
pub fn run(host: &dyn Host, input: &str) -> String {
    match serde_json::from_str::<Input>(input) {
        Ok(Input::Enroll { agent_id }) => enroll(host, &agent_id),
        Ok(Input::Release(r)) => release(host, &r),
        Err(e) => canonical(&json!({"ok": false, "reason": "bad_input", "detail": e.to_string()})),
    }
}

#[cfg(test)]
mod tests;
