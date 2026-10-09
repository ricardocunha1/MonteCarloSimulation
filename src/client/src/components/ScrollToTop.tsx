import { useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Client-side navigation keeps the window's scroll offset, so a page reached
// from a scrolled-down page (e.g. Confirm -> Results) would open mid-page.
// Reset to the top on every new navigation, as a full page load would; leave
// back/forward (POP) alone so the browser can restore the previous position.
export function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    if (navigationType !== "POP") window.scrollTo(0, 0);
  }, [pathname, navigationType]);

  return null;
}
