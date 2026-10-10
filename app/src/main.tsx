import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { Root } from "./ops";

createRoot(document.getElementById("root")!).render(<Root />);
