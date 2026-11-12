import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ItemEditor } from "./ItemEditor";
import "../styles/layout.css";
import "../styles/panels.css";
import "../styles/characters.css";
import "../styles/items.css";
import "./styles/matchers-values.css";
import "./styles/components-items.css";
import "./styles/item-page.css";
import "./styles/steps.css";
import "./styles/pages.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");
createRoot(rootElement).render(
  <StrictMode>
    <ItemEditor />
  </StrictMode>,
);
