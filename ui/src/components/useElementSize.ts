import { useEffect, useState, type RefObject } from "react";
import type { Size } from "../view";

const FALLBACK: Size = { width: 600, height: 400 }; // jsdom and first paint have no layout

export function useElementSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>(FALLBACK);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ width: r.width, height: r.height });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}
