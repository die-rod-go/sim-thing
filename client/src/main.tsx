import { createRoot } from "react-dom/client";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");
createRoot(rootElement).render(<p>Village Sim</p>);
