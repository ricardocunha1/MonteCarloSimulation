import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { DataSource, SimulateResponse, ValidateResponse } from "./lib/monteCarlo/types";

// In-memory only (no storage): replaces the legacy hidden-field JSON blob.
// A page reload drops the state and the step pages redirect back to "/monte-carlo".

export interface Execution {
  result: SimulateResponse;
  sprintStartDate: string;
}

interface ForecastState {
  /** Sprint history source chosen on the data source page; the input form requires one. */
  dataSource: DataSource | null;
  setDataSource: (value: DataSource | null) => void;
  validation: ValidateResponse | null;
  setValidation: (value: ValidateResponse | null) => void;
  execution: Execution | null;
  setExecution: (value: Execution | null) => void;
}

const ForecastContext = createContext<ForecastState | null>(null);

export function ForecastProvider({
  children,
  initialDataSource = null,
  initialValidation = null,
  initialExecution = null,
}: {
  children: ReactNode;
  initialDataSource?: DataSource | null;
  initialValidation?: ValidateResponse | null;
  initialExecution?: Execution | null;
}) {
  const [dataSource, setDataSource] = useState(initialDataSource);
  const [validation, setValidation] = useState(initialValidation);
  const [execution, setExecution] = useState(initialExecution);
  const value = useMemo(
    () => ({ dataSource, setDataSource, validation, setValidation, execution, setExecution }),
    [dataSource, validation, execution],
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
