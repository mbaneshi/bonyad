import { useEffect } from "react";

/**
 * Publishes the on-screen keyboard's height as `--kb` so the bottom sheet rides above it and
 * the focused input stays visible. Without visualViewport (desktop, jsdom) it stays 0.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb", `${Math.round(inset)}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.documentElement.style.removeProperty("--kb");
    };
  }, []);
}
