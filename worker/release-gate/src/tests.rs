//! Native tests. A mock host stands in for OutLayer: HMAC-SHA256 for `mac`, a fixed ed25519
//! seed for the `result` key, and a recorded fake Tidepool for HTTP. No network.

use super::*;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use hmac::{Hmac, Mac};
use std::cell::RefCell;

const SEED: [u8; 32] = [7u8; 32];
const MAC_KEY: &[u8] = b"test-only grant key, not a secret";
const API_KEY: &str = "naa_test_key_not_real";

struct MockHost {
    api_key: Option<String>,
    response: Result<HttpResponse, String>,
    sent: RefCell<Vec<HttpRequest>>,
    /// The release input of the current run: by default the mock order account agrees with it.
    hint: RefCell<Option<Value>>,
    /// Overrides for the order account's policy and balances answers (v2 tests).
    policy_body: RefCell<Option<Value>>,
    balances_body: RefCell<Option<Value>>,
    gets: RefCell<Vec<String>>,
}

/// The Tidepool policy answer for an order account: allowlist with one withdraw address and the owner, cap = locked.
fn policy_answer(locked_cents: u64, to: &str) -> Value {
    json!({"wallet_id": "w", "revision": 1, "status": "APPLIED", "policy": {"frozen": false, "actions": ["transfer", "withdraw"],
        "limits": {"per_transaction": {ASSET: cents_to_base_units(locked_cents)}},
        "destinations": {"mode": "only", "list": [{"action": "withdraw", "chain": "base", "address": to, "memo": null}, {"action": "transfer", "address": "astro"}]}}})
}
fn balances_answer(held_cents: u64) -> Value {
    json!({"near_account_id": "x", "balances": [{"asset_id": ASSET, "balance_raw": cents_to_base_units(held_cents)}]})
}

impl MockHost {
    fn accepting() -> Self {
        let body = br#"{"correlation_id":"corr_123","agent_id":"agent_fe8606f9c6dc60f3f1768ed9","status":"QUEUED","failure_code":null,"details":{"intent_hash":"ih_1","tx_hash":null}}"#;
        MockHost { api_key: Some(API_KEY.into()), response: Ok(HttpResponse { status: 202, body: body.to_vec() }), sent: RefCell::new(vec![]),
            hint: RefCell::new(None), policy_body: RefCell::new(None), balances_body: RefCell::new(None), gets: RefCell::new(vec![]) }
    }
    /// Runs the module, letting the mock order account agree with the input unless overridden.
    fn run(&self, input: &str) -> String {
        *self.hint.borrow_mut() = serde_json::from_str(input).ok();
        run(self, input)
    }
}

impl Host for MockHost {
    fn mac(&self, path: &str, data: &[u8]) -> Result<Vec<u8>, String> {
        if path != GRANT_KEY_PATH {
            return Err("undeclared path".into());
        }
        let mut m = <Hmac<sha2::Sha256> as Mac>::new_from_slice(MAC_KEY).unwrap();
        m.update(data);
        Ok(m.finalize().into_bytes().to_vec())
    }
    fn sign(&self, path: &str, message: &[u8]) -> Result<Vec<u8>, String> {
        if path != RESULT_KEY_PATH {
            return Err("undeclared path".into());
        }
        Ok(SigningKey::from_bytes(&SEED).sign(message).to_bytes().to_vec())
    }
    fn public_key(&self, path: &str) -> Result<Vec<u8>, String> {
        if path != RESULT_KEY_PATH {
            return Err("undeclared path".into());
        }
        Ok(SigningKey::from_bytes(&SEED).verifying_key().to_bytes().to_vec())
    }
    fn env(&self, name: &str) -> Option<String> {
        (name == API_KEY_ENV).then(|| self.api_key.clone()).flatten()
    }
    fn post(&self, request: &HttpRequest) -> Result<HttpResponse, String> {
        check_url(&request.url)?;
        self.sent.borrow_mut().push(request.clone());
        self.response.clone()
    }
    fn get(&self, request: &HttpRequest) -> Result<HttpResponse, String> {
        check_url(&request.url)?;
        self.gets.borrow_mut().push(request.url.clone());
        let h = self.hint.borrow().clone().unwrap_or(Value::Null);
        let locked = h["locked_cents"].as_u64().unwrap_or(0);
        let released = h["released_cents"].as_u64().unwrap_or(0).min(locked);
        let to = h["to"].as_str().unwrap_or("0x0000000000000000000000000000000000000000").to_string();
        let body = if request.url.ends_with("/policy") {
            self.policy_body.borrow().clone().unwrap_or_else(|| policy_answer(locked, &to))
        } else {
            self.balances_body.borrow().clone().unwrap_or_else(|| balances_answer(locked - released))
        };
        Ok(HttpResponse { status: 200, body: body.to_string().into_bytes() })
    }
}

/// Re-signs a test input's terms with the TEST-ONLY approver keys (seeds 41, 42) after an edit to
/// po, to, quantity, unit price or total, the way the approvers would sign new terms.
fn resign(input: &mut Value) {
    let (po, to, q, u, l) = (input["po"].clone(), input["to"].as_str().unwrap().to_ascii_lowercase(), input["ordered_qty"].clone(), input["unit_cents"].clone(), input["locked_cents"].clone());
    let t = &mut input["terms"];
    t["po"] = po;
    t["supplierAddress"] = json!(to);
    t["quantity"] = q;
    t["unitCents"] = u;
    t["totalCents"] = l;
    let digest = hex::encode(sha2::Sha256::digest(canonical(&input["terms"]).as_bytes()));
    for (i, seed) in [(0usize, 41u8), (1, 42)] {
        let a = &mut input["approvals"][i];
        a["digest"] = json!(digest);
        let nep413 = a.get("scheme").and_then(Value::as_str) == Some("nep413");
        let bytes = approval_bytes(a, nep413).unwrap();
        a["signature"] = json!(hex::encode(SigningKey::from_bytes(&[seed; 32]).sign(&bytes).to_bytes()));
    }
}

fn vectors() -> Value {
    serde_json::from_str(include_str!("../vectors.json")).unwrap()
}

fn case(name: &str) -> Value {
    vectors()["release_cases"].as_array().unwrap().iter().find(|c| c["name"] == name).unwrap_or_else(|| panic!("no case {name}"))["input"].clone()
}

fn verify(out: &Value) {
    let pk = hex::decode(out["public_key"].as_str().unwrap()).unwrap();
    let sig = hex::decode(out["signature"].as_str().unwrap()).unwrap();
    let key = VerifyingKey::from_bytes(&pk.try_into().unwrap()).unwrap();
    key.verify(&signed_message(out), &Signature::from_bytes(&sig.try_into().unwrap())).expect("signature verifies");
}

fn run_case(host: &MockHost, input: &Value) -> Value {
    let raw = host.run(&input.to_string());
    assert!(raw.len() <= MAX_OUTPUT_BYTES, "output is {} bytes", raw.len());
    serde_json::from_str(&raw).unwrap()
}

#[test]
fn shared_release_vectors() {
    for c in vectors()["release_cases"].as_array().unwrap() {
        let host = MockHost::accepting();
        let out = run_case(&host, &c["input"]);
        let expect = &c["expect"];
        let name = c["name"].as_str().unwrap();
        assert_eq!(out["ok"], expect["ok"], "{name}: {out}");
        if out.get("signature").is_some() {
            verify(&out);
        } else {
            assert_eq!(expect["reason"], "bad_stage", "{name}: unsigned output");
        }
        let sent = host.sent.borrow();
        if expect["ok"] == true {
            assert_eq!(out["amount_cents"], expect["amount_cents"], "{name}");
            assert_eq!(out["held_cents"], expect["held_cents"], "{name}");
            assert_eq!(out["signals"], expect["signals"], "{name}");
            assert_eq!(out["tx"]["correlation_id"], "corr_123");
            assert_eq!(sent.len(), 1, "{name}: one withdraw");
            let body: Value = serde_json::from_slice(&sent[0].body).unwrap();
            assert_eq!(body["amount"], expect["base_units"], "{name}");
        } else {
            if expect["reason"] != "bad_stage" {
                assert_eq!(out["reason"], expect["reason"], "{name}: {out}");
                assert_eq!(out["missing"], expect["missing"], "{name}");
            }
            assert!(sent.is_empty(), "{name}: a refusal sends nothing");
        }
    }
}

fn amounts(name: &str) -> (u64, u64) {
    let r: ReleaseInput = serde_json::from_value(case(name)).unwrap();
    match decide(&r) {
        Decision::Release { amount_cents, held_cents, .. } => (amount_cents, held_cents),
        d => panic!("{name}: {d:?}"),
    }
}

#[test]
fn exact_amounts_at_1260() {
    assert_eq!(amounts("advance at $1260").0, 1_890_000); // $18,900
    assert_eq!(amounts("balance at $1260"), (3_654_000, 756_000)); // $36,540 paid, $7,560 held
}

#[test]
fn exact_amounts_at_1320() {
    assert_eq!(amounts("advance at $1320").0, 1_980_000); // $19,800
    assert_eq!(amounts("balance at $1320"), (3_828_000, 792_000)); // $38,280 paid, $7,920 held
}

fn reason(name: &str) -> (String, Vec<String>) {
    let r: ReleaseInput = serde_json::from_value(case(name)).unwrap();
    match decide(&r) {
        Decision::Refuse { reason, missing } => (reason.to_string(), missing),
        d => panic!("{name}: {d:?}"),
    }
}

#[test]
fn advance_refused_without_bill_of_lading() {
    assert_eq!(reason("advance without bill of lading"), ("missing_signals".into(), vec!["bill_of_lading".to_string()]));
}

#[test]
fn advance_refused_without_export_clearance() {
    assert_eq!(reason("advance without export clearance"), ("missing_signals".into(), vec!["export_cleared".to_string()]));
}

#[test]
fn balance_refused_without_import_clearance() {
    assert_eq!(reason("balance without import clearance"), ("missing_signals".into(), vec!["import_cleared".to_string()]));
}

#[test]
fn balance_refused_without_dock_count() {
    assert_eq!(reason("balance without dock count"), ("missing_signals".into(), vec!["dock_count".to_string()]));
}

#[test]
fn refusal_is_signed_and_sends_nothing() {
    let host = MockHost::accepting();
    let out = run_case(&host, &case("advance without bill of lading"));
    assert_eq!(out["ok"], false);
    assert_eq!(out["stage"], "advance");
    assert_eq!(out["po"], "1042");
    verify(&out);
    assert!(host.sent.borrow().is_empty());
}

#[test]
fn total_paid_never_above_locked() {
    // Every stage, price and prior release up to the locked total: what has been released
    // plus what this release pays never exceeds locked.
    for unit in [126_000u64, 132_000] {
        let base: ReleaseInput = serde_json::from_value(case("balance at $1260")).unwrap();
        let advance_signals: BTreeMap<String, Value> = serde_json::from_value(case("advance at $1260")["signals"].clone()).unwrap();
        for released in (0..=unit * 50).step_by(10_000) {
            for received in 0..=60u64 {
                let mut r = base.clone();
                r.unit_cents = unit;
                r.locked_cents = unit * 50;
                r.released_cents = released;
                r.received_qty = Some(received);
                r.signals.get_mut("dock_count").unwrap()["count"] = json!(received);
                if let Decision::Release { amount_cents, held_cents, .. } = decide(&r) {
                    assert!(released + amount_cents <= r.locked_cents);
                    assert_eq!(released + amount_cents + held_cents, r.locked_cents);
                }
                let mut a = r.clone();
                a.stage = "advance".into();
                a.signals = advance_signals.clone();
                if let Decision::Release { amount_cents, .. } = decide(&a) {
                    assert!(released + amount_cents <= a.locked_cents);
                }
            }
        }
    }
    // Advance, then balance, both at the full count: exactly locked.
    let adv = amounts("balance with no advance pays the full order, never above locked");
    assert_eq!(adv, (6_300_000, 0));
}

#[test]
fn token_format() {
    let host = MockHost::accepting();
    let mac = host.mac(GRANT_KEY_PATH, &grant_mac_input("agent_fe8606f9c6dc60f3f1768ed9")).unwrap();
    let token = grant_token_from_mac(&mac).unwrap();
    assert_eq!(token.len(), 47);
    assert!(valid_grant_token(&token));
    assert!(grant_token_from_mac(&mac[..31]).is_err());
    for c in vectors()["token_cases"].as_array().unwrap() {
        let mac = hex::decode(c["mac_hex"].as_str().unwrap()).unwrap();
        let token = grant_token_from_mac(&mac).unwrap();
        assert_eq!(token, c["token"].as_str().unwrap());
        assert!(valid_grant_token(&token));
        assert_eq!(grant_hash(&token), c["grant_hash"].as_str().unwrap());
    }
}

#[test]
fn enroll_never_outputs_the_token() {
    let host = MockHost::accepting();
    let agent = "agent_fe8606f9c6dc60f3f1768ed9";
    let raw = run(&host, &json!({"mode": "enroll", "agent_id": agent}).to_string());
    let token = grant_token_from_mac(&host.mac(GRANT_KEY_PATH, &grant_mac_input(agent)).unwrap()).unwrap();
    assert!(!raw.contains(&token));
    assert!(!raw.contains(&token[4..]));
    assert!(!raw.contains("ngt_"));
    let out: Value = serde_json::from_str(&raw).unwrap();
    let keys: Vec<&String> = out.as_object().unwrap().keys().collect();
    assert_eq!(keys, ["agent_id", "grant_hash", "mode", "public_key"]);
    assert_eq!(out["grant_hash"], grant_hash(&token));
    assert_eq!(out["public_key"], hex::encode(host.public_key(RESULT_KEY_PATH).unwrap()));
    assert!(host.sent.borrow().is_empty());
}

#[test]
fn release_output_never_contains_token_or_api_key() {
    let host = MockHost::accepting();
    let raw = host.run(&case("advance at $1260").to_string());
    assert!(!raw.contains("ngt_"));
    assert!(!raw.contains(API_KEY));
}

#[test]
fn testnet_scale() {
    assert_eq!(cents_to_base_units(1_890_000), "18900000"); // $18,900 story = 18.900000 test USDC
    for c in vectors()["scale_cases"].as_array().unwrap() {
        assert_eq!(cents_to_base_units(c["cents"].as_u64().unwrap()), c["base_units"].as_str().unwrap());
    }
}

#[test]
fn only_tidepool_is_allowed() {
    for c in vectors()["host_cases"].as_array().unwrap() {
        let url = c["url"].as_str().unwrap();
        assert_eq!(check_url(url).is_ok(), c["allowed"].as_bool().unwrap(), "{url}");
    }
    assert!(check_url("https://api.agentsonintents.com/v1/agents/agent_x/withdraw").is_err());
}

#[test]
fn withdraw_request_shape() {
    let host = MockHost::accepting();
    let out = run_case(&host, &case("advance at $1260"));
    assert_eq!(out["ok"], true);
    let sent = host.sent.borrow();
    let req = &sent[0];
    assert_eq!(req.url, "https://www.usetidepool.tech/v1/agents/agent_fe8606f9c6dc60f3f1768ed9/withdraw");
    let h = |k: &str| req.headers.iter().find(|(n, _)| n == k).map(|(_, v)| v.clone()).unwrap();
    assert_eq!(h("x-api-key"), API_KEY);
    assert!(valid_grant_token(&h("x-grant-token")));
    assert_eq!(h("content-type"), "application/json");
    let idem = &vectors()["idempotency_cases"][0];
    assert_eq!(h("idempotency-key"), idem["key"].as_str().unwrap());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert_eq!(body, json!({"asset": ASSET, "amount": "18900000", "chain": "base", "recipient": "0x2003975a521c6fa45238dbc402c9e4adcb8863e0"}));
}

#[test]
fn idempotency_vectors() {
    for c in vectors()["idempotency_cases"].as_array().unwrap() {
        let k = idempotency_key(c["agent_id"].as_str().unwrap(), c["po"].as_str().unwrap(), c["stage"].as_str().unwrap());
        assert_eq!(k, c["key"].as_str().unwrap());
        assert!((8..=128).contains(&k.len()));
    }
}

#[test]
fn api_key_comes_only_from_env() {
    let mut host = MockHost::accepting();
    host.api_key = None;
    let mut input = case("advance at $1260");
    input["api_key"] = json!("naa_from_input");
    input["x-api-key"] = json!("naa_from_input");
    let out = run_case(&host, &input);
    assert_eq!(out["reason"], "api_key_missing");
    verify(&out);
    assert!(host.sent.borrow().is_empty());
}

#[test]
fn tidepool_refusal_is_a_signed_refusal() {
    let mut host = MockHost::accepting();
    host.response = Ok(HttpResponse {
        status: 403,
        body: br#"{"errors":[{"status":"403","code":"policy_destination_denied","layer":"policy","title":"denied"}],"meta":{}}"#.to_vec(),
    });
    let out = run_case(&host, &case("advance at $1260"));
    assert_eq!(out["ok"], false);
    assert_eq!(out["reason"], "withdraw_refused");
    assert_eq!(out["tx"]["error_code"], "policy_destination_denied");
    verify(&out);
}

#[test]
fn transport_error_says_unknown() {
    let mut host = MockHost::accepting();
    host.response = Err("connection reset".into());
    let out = run_case(&host, &case("advance at $1260"));
    assert_eq!(out["reason"], "withdraw_unknown");
    assert_eq!(out["amount_cents"], 1_890_000);
    verify(&out);
}

#[test]
fn bad_agent_id_never_reaches_the_url() {
    let host = MockHost::accepting();
    let mut input = case("advance at $1260");
    input["agent_id"] = json!("agent_x/../../keys");
    let out = run_case(&host, &input);
    assert_eq!(out["ok"], false);
    assert!(host.sent.borrow().is_empty());
    let raw = run(&host, &json!({"mode": "enroll", "agent_id": "../x"}).to_string());
    assert!(raw.contains("bad_agent_id"));
}

#[test]
fn worst_case_output_fits_on_chain() {
    let long = "x".repeat(200);
    let body = json!({"correlation_id": long, "status": "PROCESSING", "failure_code": long,
        "details": {"tx_hash": long, "transaction_hash": long, "intent_hash": long, "destination_tx_hash": long}});
    let mut host = MockHost::accepting();
    host.response = Ok(HttpResponse { status: 202, body: body.to_string().into_bytes() });
    let mut input = case("advance at $1260");
    input["po"] = json!("p".repeat(48));
    resign(&mut input);
    input["signals"]["bill_of_lading"]["id"] = json!("b".repeat(48));
    input["signals"]["export_cleared"]["id"] = json!("e".repeat(48));
    let raw = host.run(&input.to_string());
    let out: Value = serde_json::from_str(&raw).unwrap();
    assert_eq!(out["ok"], true);
    println!("worst case output: {} bytes", raw.len());
    assert!(raw.len() <= MAX_OUTPUT_BYTES);
    assert!(out["tx"]["correlation_id"].is_string());
    verify(&out);
}

#[test]
fn typical_output_size() {
    let host = MockHost::accepting();
    let raw = host.run(&case("balance at $1320").to_string());
    println!("typical success output: {} bytes\n{raw}", raw.len());
    assert!(raw.len() <= MAX_OUTPUT_BYTES);
}

#[test]
fn canonical_sorts_keys() {
    assert_eq!(canonical(&json!({"b": 1, "a": {"d": [2, {"z": 0, "y": "s"}], "c": true}})), r#"{"a":{"c":true,"d":[2,{"y":"s","z":0}]},"b":1}"#);
}

#[test]
fn signature_vector() {
    let v = vectors();
    let sc = &v["signature_case"];
    let host = MockHost::accepting();
    if sc.is_null() {
        let out = run_case(&host, &case("advance without bill of lading"));
        println!("SIGCASE {}", json!({"seed_hex": hex::encode(SEED), "input_case": "advance without bill of lading", "public_key_hex": out["public_key"], "message": String::from_utf8(signed_message(&out)).unwrap(), "signature_hex": out["signature"], "output": out}));
        panic!("signature_case missing from vectors.json");
    }
    assert_eq!(hex::encode(SEED), sc["seed_hex"].as_str().unwrap());
    let out = run_case(&host, &case("advance without bill of lading"));
    assert_eq!(String::from_utf8(signed_message(&out)).unwrap(), sc["message"].as_str().unwrap());
    assert_eq!(out["signature"], sc["signature_hex"]);
    assert_eq!(out["public_key"], sc["public_key_hex"]);
}

/// v1 bound, kept for the record: `decide` alone still trusts the caller's `released_cents`.
/// v2 (`release`) now reads the order account and refuses a mismatch: see the v2_ tests below.
/// Pins the honest bound on caller-supplied state (README, "What it does not guarantee"):
/// `released_cents` comes from the caller and the module keeps no state. A caller that understates
/// it is paid more for the balance (here the full held $7,560 on top of $36,540), but never more
/// than `locked_cents` in total, never to an address the module did not sign, and only with the
/// balance's signals. The order account's balance and Tidepool's per-stage idempotency key are
/// what stop a second payment; this module alone does not.
#[test]
fn understated_released_overpays_up_to_locked_never_beyond() {
    let input = |released: u64| -> ReleaseInput {
        serde_json::from_value(json!({
            "mode": "release", "stage": "balance", "po": "1042", "agent_id": "agent_fe8606f9c6dc60f3f1768ed9",
            "to": "0x2003975a521c6fa45238dbc402c9e4adcb8863e0", "unit_cents": 126000, "ordered_qty": 50,
            "locked_cents": 6300000, "released_cents": released, "advance_percent": 30, "received_qty": 44,
            "signals": {"import_cleared": {"id": "imp-US-1042", "at": "2026-11-20T15:00:00Z"},
                        "dock_count": {"id": "dock-1042", "at": "2026-11-21T10:00:00Z", "count": 44}}
        })).unwrap()
    };
    // Truthful: $36,540, $7,560 held.
    match decide(&input(1_890_000)) { Decision::Release { amount_cents, held_cents, .. } => assert_eq!((amount_cents, held_cents), (3_654_000, 756_000)), d => panic!("{d:?}") }
    // Understated to $11,340: due is 44 x 1,260 - 11,340 = $44,100, exactly what the account holds after the real advance.
    match decide(&input(1_134_000)) { Decision::Release { amount_cents, .. } => assert_eq!(amount_cents, 4_410_000), d => panic!("{d:?}") }
    // Understated to zero: due $55,440. The module allows it (it is below locked); only the account's
    // real balance ($44,100 after the advance) refuses it at Tidepool.
    match decide(&input(0)) { Decision::Release { amount_cents, .. } => assert_eq!(amount_cents, 5_544_000), d => panic!("{d:?}") }
    // Never above locked, whatever the caller says.
    for released in [0u64, 1, 1_000_000, 1_890_000, 6_300_000, 6_300_001] {
        if let Decision::Release { amount_cents, .. } = decide(&input(released)) { assert!(released + amount_cents <= 6_300_000); }
    }
}

// ---------- v2: the order account is read from Tidepool, not taken from the caller ----------

fn v2_refusal(host: &MockHost, input: &Value) -> String {
    let out = run_case(host, input);
    assert_eq!(out["ok"], false, "{out}");
    verify(&out);
    assert!(host.sent.borrow().is_empty(), "a refusal sends nothing");
    out["reason"].as_str().unwrap().to_string()
}

#[test]
fn v2_reads_policy_and_balance_before_paying() {
    let host = MockHost::accepting();
    let out = run_case(&host, &case("balance at $1260"));
    assert_eq!(out["ok"], true, "{out}");
    let gets = host.gets.borrow();
    assert!(gets.iter().any(|u| u.ends_with("/policy")) && gets.iter().any(|u| u.ends_with("/balances")), "{gets:?}");
}

#[test]
fn v2_understated_released_is_refused() {
    // The caller says nothing was released; the account holds only $44,100 (the advance left).
    let host = MockHost::accepting();
    *host.balances_body.borrow_mut() = Some(balances_answer(4_410_000));
    let mut input = case("balance at $1260");
    input["released_cents"] = json!(0);
    assert_eq!(v2_refusal(&host, &input), "released_not_on_chain");
}

#[test]
fn v2_second_advance_is_refused_by_the_balance() {
    let host = MockHost::accepting();
    *host.balances_body.borrow_mut() = Some(balances_answer(6_300_000 - 1_890_000));
    assert_eq!(v2_refusal(&host, &case("advance at $1260")), "released_not_on_chain");
}

#[test]
fn v2_recipient_and_commitment_must_match_the_policy() {
    let host = MockHost::accepting();
    *host.policy_body.borrow_mut() = Some(policy_answer(6_300_000, "0x1111111111111111111111111111111111111111"));
    assert_eq!(v2_refusal(&host, &case("advance at $1260")), "recipient_not_on_chain");
    let host = MockHost::accepting();
    *host.policy_body.borrow_mut() = Some(policy_answer(9_900_000, "0x2003975a521c6fa45238dbc402c9e4adcb8863e0"));
    *host.balances_body.borrow_mut() = Some(balances_answer(9_900_000));
    assert_eq!(v2_refusal(&host, &case("advance at $1260")), "locked_not_on_chain");
}

#[test]
fn v2_refuses_an_account_that_is_not_locked_down() {
    let to = "0x2003975a521c6fa45238dbc402c9e4adcb8863e0";
    let cases: Vec<(&str, Box<dyn Fn(&mut Value)>)> = vec![
        ("policy_not_restrictive", Box::new(|p: &mut Value| p["policy"]["destinations"]["mode"] = json!("any"))),
        ("account_frozen", Box::new(|p: &mut Value| p["policy"]["frozen"] = json!(true))),
        ("policy_not_applied", Box::new(|p: &mut Value| p["status"] = json!("PENDING"))),
        ("policy_withdraw_ambiguous", Box::new(|p: &mut Value| p["policy"]["destinations"]["list"].as_array_mut().unwrap().push(json!({"action": "withdraw", "chain": "base", "address": "0x1111111111111111111111111111111111111111"})))),
        ("policy_no_cap", Box::new(|p: &mut Value| p["policy"]["limits"] = json!({}))),
    ];
    for (want, edit) in cases {
        let host = MockHost::accepting();
        let mut p = policy_answer(6_300_000, to);
        edit(&mut p);
        *host.policy_body.borrow_mut() = Some(p);
        assert_eq!(v2_refusal(&host, &case("advance at $1260")), want);
    }
}

#[test]
fn v2_advance_percent_is_pinned_in_the_build() {
    let mut input = case("advance at $1260");
    input["advance_percent"] = json!(100);
    let host = MockHost::accepting();
    assert_eq!(v2_refusal(&host, &input), "percent_not_policy");
}

#[test]
fn v2_chain_unreadable_sends_nothing() {
    let host = MockHost::accepting();
    *host.balances_body.borrow_mut() = Some(json!({"nope": 1}));
    assert_eq!(v2_refusal(&host, &case("advance at $1260")), "chain_unreadable");
}

#[test]
fn v2_dust_from_outside_does_not_block_a_release() {
    // Someone sends 0.000001 test USDC (and then a whole cent) into the order account.
    for extra in ["63000001", "63000010"] {
        let host = MockHost::accepting();
        *host.balances_body.borrow_mut() = Some(json!({"balances": [{"asset_id": ASSET, "balance_raw": extra}]}));
        let out = run_case(&host, &case("advance at $1260"));
        assert_eq!(out["ok"], true, "{extra}: {out}");
    }
}

// ---------- v3: the balance needs a dock count signed by a pinned device ----------

#[test]
fn v3_balance_needs_a_pinned_dock_signature() {
    let refuse = |edit: &dyn Fn(&mut Value)| -> String {
        let mut input = case("balance at $1260");
        edit(&mut input);
        let host = MockHost::accepting();
        let out = run_case(&host, &input);
        assert_eq!(out["ok"], false, "{out}");
        verify(&out);
        assert!(host.sent.borrow().is_empty());
        out["reason"].as_str().unwrap().to_string()
    };
    assert_eq!(refuse(&|i| { i["signals"]["dock_count"].as_object_mut().unwrap().remove("attestation"); }), "dock_unsigned");
    assert_eq!(refuse(&|i| i["signals"]["dock_count"]["attestation"]["count"] = json!(50)), "dock_bad_signature");
    assert_eq!(refuse(&|i| i["signals"]["dock_count"]["attestation"]["device"] = json!("someone-else")), "dock_unknown_device");
    assert_eq!(refuse(&|i| i["signals"]["dock_count"]["attestation"]["publicKey"] = json!("ab".repeat(32))), "dock_unknown_device");
    // A count signed for another PO (the terms re-signed for that PO, the count still for 1042).
    assert_eq!(refuse(&|i| { i["po"] = json!("1043"); resign(i); }), "dock_wrong_po");
    // v4: a count signed for another order's wallet of the same PO.
    assert_eq!(refuse(&|i| i["agent_id"] = json!("agent_other123")), "dock_wrong_wallet");
    // The signed attestation itself is good: the case pays.
    let host = MockHost::accepting();
    assert_eq!(run_case(&host, &case("balance at $1260"))["ok"], true);
}

#[test]
fn v3_advance_does_not_need_a_dock_count() {
    let host = MockHost::accepting();
    assert_eq!(run_case(&host, &case("advance at $1260"))["ok"], true);
}

/// Pins a v3 bound the judge panel found (Nov 14): the gate checks ordered_qty x unit_cents == locked,
/// but not that this is the approved price. A backend that states 45 x $1,400 (= $63,000) with a
/// genuinely signed count of 44 is paid 44 x 1,400 - 18,900 = $42,700 instead of $36,540, out of the
/// held part, to the allowlisted supplier only. v4 binds the price and quantity to the approvers'
/// signed terms inside the enclave.
#[test]
fn v3_bound_unit_price_not_bound_to_approved_terms() {
    let mut input = case("balance at $1260");
    input["ordered_qty"] = json!(45);
    input["unit_cents"] = json!(140_000);
    let r: ReleaseInput = serde_json::from_value(input).unwrap();
    match decide(&r) {
        Decision::Release { amount_cents, .. } => assert_eq!(amount_cents, 4_270_000),
        d => panic!("{d:?}"),
    }
}


// ---------- v4: the gate pays only on terms the pinned approvers signed ----------

#[test]
fn v4_the_unit_price_exploit_is_refused() {
    // The v3 bound: 45 x $1,400 = $63,000 with a real count of 44. Without new approvals: refused.
    let host = MockHost::accepting();
    let mut input = case("balance at $1260");
    input["ordered_qty"] = json!(45);
    input["unit_cents"] = json!(140_000);
    let out = run_case(&host, &input);
    assert_eq!((out["ok"].clone(), out["reason"].clone()), (json!(false), json!("terms_mismatch")));
    assert!(host.sent.borrow().is_empty());
    // Even with the terms rewritten to match, the old signatures do not cover them.
    let host = MockHost::accepting();
    input["terms"]["quantity"] = json!(45);
    input["terms"]["unitCents"] = json!(140_000);
    let out = run_case(&host, &input);
    assert_eq!(out["reason"], "approvals_insufficient");
    assert!(host.sent.borrow().is_empty());
}

#[test]
fn v4_needs_two_distinct_pinned_approvers_over_the_digest() {
    let reason = |edit: &dyn Fn(&mut Value)| { let mut i = case("advance at $1260"); edit(&mut i); let h = MockHost::accepting(); let o = run_case(&h, &i); assert!(h.sent.borrow().is_empty() || o["ok"] == true); o["reason"].as_str().unwrap_or("paid").to_string() };
    assert_eq!(reason(&|_| {}), "paid");
    assert_eq!(reason(&|i| { i.as_object_mut().unwrap().remove("terms"); }), "terms_missing");
    assert_eq!(reason(&|i| { i["approvals"].as_array_mut().unwrap().pop(); }), "approvals_insufficient");
    assert_eq!(reason(&|i| { let a = i["approvals"][1].clone(); i["approvals"][0] = a; }), "approvals_insufficient"); // same approver twice
    assert_eq!(reason(&|i| i["approvals"][1]["signature"] = json!("00".repeat(64))), "approvals_insufficient");
    assert_eq!(reason(&|i| i["approvals"][0]["scheme"] = json!("ed25519")), "approvals_insufficient"); // NEAR approver must sign NEP-413
    assert_eq!(reason(&|i| i["approvals"][1]["approver"] = json!("Mallory")), "approvals_insufficient");
    assert_eq!(reason(&|i| i["to"] = json!("0x1111111111111111111111111111111111111111")), "terms_mismatch");
    assert_eq!(reason(&|i| i["terms"]["approvalsRequired"] = json!(0)), "approvals_insufficient"); // digest changes; and 2 are always required
}

/// The cross-language check: the exact release inputs the server composed (tests/gateInputE2E.test.ts,
/// through approvals.forRun, deadline.releaseStage and escrow.releaseByGate) pass the v4 gate: the
/// terms digest recomputes, both approvals verify (Luca NEP-413, Jordan ed25519), and the balance's
/// dock count verifies for this wallet. Then each is paid exactly what the server's rules computed.
#[test]
fn v4_accepts_the_servers_own_inputs() {
    let f: Value = serde_json::from_str(include_str!("../server-inputs.json")).unwrap();
    for (stage, want) in [("advance", 1_890_000u64), ("balance", 3_654_000)] {
        let raw = f[stage].as_str().unwrap();
        let r: ReleaseInput = serde_json::from_str::<Value>(raw).ok().and_then(|v| serde_json::from_value(v).ok()).unwrap();
        assert_eq!(check_approved_terms(&r), Ok(()), "{stage}");
        if stage == "balance" { assert_eq!(check_dock_attestation(&r), Ok(()), "{stage}"); }
        let host = MockHost::accepting();
        let out: Value = serde_json::from_str(&host.run(raw)).unwrap();
        assert_eq!(out["ok"], true, "{stage}: {out}");
        assert_eq!(out["amount_cents"], json!(want), "{stage}");
    }
}
