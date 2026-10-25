import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ToastProvider } from "./components/Toast";
import "./index.css";
import { ForecastProvider } from "./monteCarloStore";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ForecastProvider>
          <App />
        </ForecastProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
