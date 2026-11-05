//! OutLayer passes the input on stdin and reads the result from stdout.
use std::io::{Read, Write};

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).expect("read stdin");
    match dock_check::run(&input) {
        Ok(out) => { std::io::stdout().write_all(out.as_bytes()).expect("write stdout"); }
        Err(e) => { eprintln!("{e}"); std::process::exit(1); }
    }
}
