import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ForecastProvider, type Execution } from "../store";
import type { ValidateResponse } from "../types";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

/** Renders `element` at `path` with stub pages for the other routes, so a
 * navigation shows up as `location` changing. */
export function renderAt(
  path: string,
  element: ReactElement,
  {
    validation = null,
    execution = null,
    routes = {},
  }: {
    validation?: ValidateResponse | null;
    execution?: Execution | null;
    routes?: Record<string, ReactElement>;
  } = {},
) {
  const stubs: Record<string, ReactElement> = {
    "/": <p>input page</p>,
    "/confirm": <p>confirm page</p>,
    "/results": <p>results page</p>,
    ...routes,
    [path]: element,
  };
  return render(
    <ForecastProvider initialValidation={validation} initialExecution={execution}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          {Object.entries(stubs).map(([routePath, routeElement]) => (
            <Route key={routePath} path={routePath} element={routeElement} />
          ))}
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </ForecastProvider>,
  );
}
