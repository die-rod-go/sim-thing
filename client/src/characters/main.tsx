import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CharacterEditor } from "./CharacterEditor";
import "../styles/layout.css";
import "../styles/panels.css";
import "../styles/characters.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");
createRoot(rootElement).render(
  <StrictMode>
    <CharacterEditor />
  </StrictMode>,
);
