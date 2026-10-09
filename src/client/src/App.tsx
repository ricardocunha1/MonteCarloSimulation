import { Navigate, Route, Routes } from "react-router-dom";
import { ConfirmPage } from "./pages/ConfirmPage";
import { InputPage } from "./pages/InputPage";
import { ResultsPage } from "./pages/ResultsPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<InputPage />} />
      <Route path="/confirm" element={<ConfirmPage />} />
      <Route path="/results" element={<ResultsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
