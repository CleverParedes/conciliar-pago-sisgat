import {
  StrictMode,
} from "react";
import {
  createRoot,
} from "react-dom/client";
import "./index.css";
import App from "./App";

const elementoRaiz =
  document.getElementById("root");

if (!elementoRaiz) {
  throw new Error(
    'No se encontró el elemento "root".',
  );
}

createRoot(
  elementoRaiz,
).render(
  <StrictMode>
    <App />
  </StrictMode>,
);