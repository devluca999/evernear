//! OutLayer entry point: input JSON on stdin, output JSON on stdout. The host calls are the
//! `outlayer:encryption-keys` and `outlayer:signing-keys` imports, the run's env and wasi-http.
//! All decisions live in `src/lib.rs`.

#[cfg(target_arch = "wasm32")]
mod host {
    wit_bindgen::generate!({
        world: "guest",
        path: "wit",
        generate_all,
    });
}

// The manifest, in the `outlayer.manifest` custom section: covered by the wasm's sha256.
#[cfg(target_arch = "wasm32")]
#[used]
#[link_section = "outlayer.manifest"]
static OUTLAYER_MANIFEST: [u8; include_bytes!("../manifest.json").len()] = *include_bytes!("../manifest.json");

#[cfg(target_arch = "wasm32")]
struct Outlayer;

#[cfg(target_arch = "wasm32")]
impl release_gate::Host for Outlayer {
    fn mac(&self, path: &str, data: &[u8]) -> Result<Vec<u8>, String> {
        // Declared without a vault, so every call passes None.
        host::outlayer::encryption_keys::api::mac(path, None, data)
    }

    fn sign(&self, path: &str, message: &[u8]) -> Result<Vec<u8>, String> {
        host::outlayer::signing_keys::api::sign(path, None, message)
    }

    fn public_key(&self, path: &str) -> Result<Vec<u8>, String> {
        host::outlayer::signing_keys::api::public_key(path, None)
    }

    fn env(&self, name: &str) -> Option<String> {
        std::env::var(name).ok()
    }

    fn post(&self, request: &release_gate::HttpRequest) -> Result<release_gate::HttpResponse, String> {
        // Checked again here, right before the socket: nothing leaves for another host.
        release_gate::check_url(&request.url)?;
        let mut builder = wasi_http_client::Client::new()
            .post(&request.url)
            .connect_timeout(std::time::Duration::from_secs(20));
        for (k, v) in &request.headers {
            builder = builder.header(k.as_str(), v.as_bytes().to_vec());
        }
        let response = builder.body(&request.body).send().map_err(|e| e.to_string())?;
        let status = response.status();
        let body = response.body().map_err(|e| e.to_string())?;
        Ok(release_gate::HttpResponse { status, body })
    }
}

#[cfg(target_arch = "wasm32")]
fn main() {
    use std::io::{Read, Write};
    let mut input = String::new();
    let output = match std::io::stdin().read_to_string(&mut input) {
        Ok(_) => release_gate::run(&Outlayer, &input),
        Err(e) => release_gate::canonical(&serde_json::json!({"ok": false, "reason": "bad_input", "detail": e.to_string()})),
    };
    let mut out = std::io::stdout();
    out.write_all(output.as_bytes()).expect("write stdout");
    out.flush().expect("flush stdout");
}

#[cfg(not(target_arch = "wasm32"))]
fn main() {
    eprintln!("release-gate runs on OutLayer: build with --target wasm32-wasip2");
    std::process::exit(2);
}
