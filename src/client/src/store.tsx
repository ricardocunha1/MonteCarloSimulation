import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { SimulateResponse, ValidateResponse } from "./types";

// In-memory only (no storage): replaces the legacy hidden-field JSON blob.
// A page reload drops the state and the step pages redirect back to "/".

export type Execution =
  | { status: "ok"; result: SimulateResponse; sprintStartDate: string }
  | { status: "error"; errors: string[] };

interface ForecastState {
  validation: ValidateResponse | null;
  setValidation: (value: ValidateResponse | null) => void;
  execution: Execution | null;
  setExecution: (value: Execution | null) => void;
}

const ForecastContext = createContext<ForecastState | null>(null);

export function ForecastProvider({
  children,
  initialValidation = null,
  initialExecution = null,
}: {
  children: ReactNode;
  initialValidation?: ValidateResponse | null;
  initialExecution?: Execution | null;
}) {
  const [validation, setValidation] = useState(initialValidation);
  const [execution, setExecution] = useState(initialExecution);
  const value = useMemo(
    () => ({ validation, setValidation, execution, setExecution }),
    [validation, execution],
  );
  return <ForecastContext.Provider value={value}>{children}</ForecastContext.Provider>;
}

export function useForecast(): ForecastState {
  const state = useContext(ForecastContext);
  if (!state) {
    throw new Error("useForecast must be used within a ForecastProvider");
  }
  return state;
}
