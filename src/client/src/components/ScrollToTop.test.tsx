import { act, render } from "@testing-library/react";
import { MemoryRouter, useNavigate, type NavigateFunction } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollToTop } from "./ScrollToTop";

let navigate: NavigateFunction;
function NavigateProbe() {
  navigate = useNavigate();
  return null;
}

function renderScrollToTop() {
  render(
    <MemoryRouter initialEntries={["/monte-carlo/confirm"]}>
      <ScrollToTop />
      <NavigateProbe />
    </MemoryRouter>,
  );
}

describe("ScrollToTop", () => {
  afterEach(() => vi.restoreAllMocks());

  it("scrolls to the top when navigating to a new page", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderScrollToTop();
    scrollTo.mockClear();

    act(() => navigate("/monte-carlo/results"));

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("leaves the scroll position alone on back/forward navigation", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderScrollToTop();
    act(() => navigate("/monte-carlo/results"));
    scrollTo.mockClear();

    act(() => navigate(-1));

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
