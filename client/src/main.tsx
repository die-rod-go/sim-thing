import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import "./styles/layout.css";
import "./styles/shell.css";
import "./styles/panels.css";
import "./styles/story.css";
import "./styles/sheet.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
