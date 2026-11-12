import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MapEditor } from "./MapEditor";
import "../styles/layout.css";
import "../styles/panels.css";
import "../styles/characters.css";
import "../styles/map-editor.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");
createRoot(rootElement).render(
  <StrictMode>
    <MapEditor />
  </StrictMode>,
);
