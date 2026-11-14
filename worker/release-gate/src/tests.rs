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
}

impl MockHost {
    fn accepting() -> Self {
        let body = br#"{"correlation_id":"corr_123","agent_id":"agent_fe8606f9c6dc60f3f1768ed9","status":"QUEUED","failure_code":null,"details":{"intent_hash":"ih_1","tx_hash":null}}"#;
        MockHost { api_key: Some(API_KEY.into()), response: Ok(HttpResponse { status: 202, body: body.to_vec() }), sent: RefCell::new(vec![]) }
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
    let raw = run(host, &input.to_string());
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
    let raw = run(&host, &case("advance at $1260").to_string());
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
    input["signals"]["bill_of_lading"]["id"] = json!("b".repeat(48));
    input["signals"]["export_cleared"]["id"] = json!("e".repeat(48));
    let raw = run(&host, &input.to_string());
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
    let raw = run(&host, &case("balance at $1320").to_string());
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
