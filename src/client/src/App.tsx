import { Navigate, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";
import { ConfirmPage } from "./pages/ConfirmPage";
import { HubHomePage } from "./pages/HubHomePage";
import { InputPage } from "./pages/InputPage";
import { ResultsPage } from "./pages/ResultsPage";

/** Route table: hub home at `/`, the Monte Carlo flow under `/monte-carlo`, anything else redirects home. */
export function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HubHomePage />} />
        <Route path="/monte-carlo" element={<InputPage />} />
        <Route path="/monte-carlo/confirm" element={<ConfirmPage />} />
        <Route path="/monte-carlo/results" element={<ResultsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
