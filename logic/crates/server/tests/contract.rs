//! `contracts/openapi.json` is generated from the code and committed. This test fails if the
//! committed copy has drifted, so the contract the UI and agent build on is never stale.
//! It needs no database. To refresh the file after an intentional API change:
//!
//!     UPDATE_CONTRACT=1 cargo test -p bonyad-server --test contract
//!
//! (or `just openapi`), then commit the result.

use std::path::PathBuf;

fn committed_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../contracts/openapi.json")
}

#[test]
fn the_committed_contract_matches_the_code() {
    let generated = bonyad_server::openapi().to_pretty_json().expect("renders");
    let path = committed_path();

    if std::env::var("UPDATE_CONTRACT").as_deref() == Ok("1") {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, format!("{generated}\n")).unwrap();
        return;
    }

    let committed = std::fs::read_to_string(&path).unwrap_or_else(|e| {
        panic!(
            "cannot read {}: {e}. Generate it with UPDATE_CONTRACT=1 or `just openapi`.",
            path.display()
        )
    });
    assert_eq!(
        committed.trim_end(),
        generated.trim_end(),
        "contracts/openapi.json is stale. Run `just openapi` and commit the result."
    );
}
