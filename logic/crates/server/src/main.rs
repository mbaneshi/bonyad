use std::net::SocketAddr;
use std::process::ExitCode;

use bonyad_persistence::Store;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            tracing::error!("{message}");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> Result<(), String> {
    let database_url =
        std::env::var("DATABASE_URL").map_err(|_| "DATABASE_URL is not set".to_owned())?;
    let bind: SocketAddr = std::env::var("BONYAD_BIND")
        .unwrap_or_else(|_| "127.0.0.1:58080".to_owned())
        .parse()
        .map_err(|e| format!("BONYAD_BIND is not a socket address: {e}"))?;

    // No authentication in this milestone, so refuse to listen beyond this machine unless the
    // operator says so on purpose.
    if !bind.ip().is_loopback() && std::env::var("BONYAD_ALLOW_NON_LOOPBACK").as_deref() != Ok("1")
    {
        return Err(format!(
            "refusing to listen on {bind}: this API has no authentication. Use a loopback address, \
             or set BONYAD_ALLOW_NON_LOOPBACK=1 if you really mean it."
        ));
    }

    let store = Store::connect(&database_url)
        .await
        .map_err(|e| format!("cannot connect to the database: {e}"))?;
    let listener = tokio::net::TcpListener::bind(bind)
        .await
        .map_err(|e| format!("cannot bind {bind}: {e}"))?;
    tracing::info!(%bind, "listening");

    axum::serve(listener, bonyad_server::router(store))
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(|e| format!("server error: {e}"))
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
    tracing::info!("shutting down");
}
