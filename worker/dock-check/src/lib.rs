//! Attested dock check. Pure arithmetic, no I/O: received quantity times unit price is
//! released, the rest is held. Amounts are integer US cents. Mirrors engine/plain.ts matchReceipt.

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, PartialEq)]
pub struct Input {
    pub po: String,
    pub ordered_qty: u64,
    pub received_qty: u64,
    pub unit_cents: u64,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Output {
    pub po: String,
    pub accepted_qty: u64,
    pub release_cents: u64,
    pub hold_cents: u64,
}

pub fn compute(i: &Input) -> Output {
    let accepted = i.received_qty.min(i.ordered_qty);
    let release = accepted * i.unit_cents;
    let total = i.ordered_qty * i.unit_cents;
    Output { po: i.po.clone(), accepted_qty: accepted, release_cents: release, hold_cents: total - release }
}

pub fn run(input: &str) -> Result<String, String> {
    let i: Input = serde_json::from_str(input).map_err(|e| format!("bad input: {e}"))?;
    if i.ordered_qty == 0 || i.unit_cents == 0 {
        return Err("ordered_qty and unit_cents must be positive".into());
    }
    serde_json::to_string(&compute(&i)).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Deserialize)]
    struct Vector { input: serde_json::Value, output: serde_json::Value }

    #[test]
    fn matches_shared_vectors() {
        let raw = include_str!("../vectors.json");
        let vectors: Vec<Vector> = serde_json::from_str(raw).unwrap();
        for v in vectors {
            let out = run(&v.input.to_string()).unwrap();
            let got: serde_json::Value = serde_json::from_str(&out).unwrap();
            assert_eq!(got, v.output);
        }
    }

    #[test]
    fn short_shipment_releases_34200_holds_3800() {
        let o = compute(&Input { po: "1042".into(), ordered_qty: 2000, received_qty: 1800, unit_cents: 1900 });
        assert_eq!(o.release_cents, 3_420_000);
        assert_eq!(o.hold_cents, 380_000);
    }
}
