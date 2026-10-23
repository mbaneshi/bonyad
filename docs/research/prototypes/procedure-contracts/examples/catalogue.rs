//! Prints the whole catalogue as a Markdown table: `cargo run --example catalogue`.

use procedure_contracts::all_specs;

fn main() {
    let specs = all_specs();
    println!("| Key | v | Kind | Effect | Inputs | Outputs | Errors |");
    println!("|---|---|---|---|---|---|---|");
    for s in &specs {
        println!(
            "| `{}` | {} | {:?} | {:?} | {} | {} | {} |",
            s.key,
            s.version,
            s.kind,
            s.effect,
            s.input_fields.join(", "),
            s.output_fields.join(", "),
            s.error_codes.join(", "),
        );
    }
    eprintln!("{} procedures", specs.len());
}
