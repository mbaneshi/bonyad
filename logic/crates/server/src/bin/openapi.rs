//! Prints the OpenAPI document. `just openapi` writes it to `contracts/openapi.json`.

fn main() {
    match bonyad_server::openapi().to_pretty_json() {
        Ok(json) => println!("{json}"),
        Err(error) => {
            eprintln!("cannot render the OpenAPI document: {error}");
            std::process::exit(1);
        }
    }
}
