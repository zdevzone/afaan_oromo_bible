import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { createServices } from "./app/createServices";
import "./styles/globals.css";

if (__WDIO_TEST__) await import("@wdio/tauri-plugin");

const container = document.getElementById("root");
if (!container) throw new Error("The application root is missing.");
const root = createRoot(container);

root.render(
  <main className="startup-state" aria-live="polite">
    Opening your reading space…
  </main>,
);

createServices().then(
  (services) =>
    root.render(
      <StrictMode>
        <App services={services} />
      </StrictMode>,
    ),
  (error: unknown) =>
    root.render(
      <main className="startup-state" role="alert">
        <h1>Could not open the reading space</h1>
        <p>{error instanceof Error ? error.message : "Application services could not start."}</p>
        <p>Your existing personal records have not been reset.</p>
      </main>,
    ),
);
