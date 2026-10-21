import { useEffect, type RefObject } from "react";

/**
 * On narrow screens the properties panel is a fixed bottom sheet. Publish its height as
 * `--sheet-h` so the drawing is fitted into the space above it, not hidden underneath.
 */
export function useSheetHeight(ref: RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    const root = document.documentElement.style;
    const el = ref.current;
    if (!el || !open) {
      root.removeProperty("--sheet-h");
      return;
    }
    const update = () => root.setProperty("--sheet-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.removeProperty("--sheet-h");
    };
  }, [ref, open]);
}
