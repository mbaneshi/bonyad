// Coordinates are typed by people who may use Persian or Arabic-Indic digits and the
// Arabic decimal separator, so parsing accepts them. Display stays Latin and left-to-right.

const DIGITS: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** A finite number, or `null` when the text is not one. */
export function parseNumber(text: string): number | null {
  const normal = text
    .replace(/[۰-۹٠-٩]/g, (d) => DIGITS[d] ?? d)
    .replace(/[٫,]/g, ".")
    .replace(/[−–]/g, "-")
    .replace(/[\s٬‌‎‏]/g, "");
  if (!NUMBER.test(normal)) return null;
  const value = Number(normal);
  return Number.isFinite(value) ? value : null;
}

/** Shortest readable form, at most six decimals, no exponent for everyday magnitudes. */
export function formatNumber(value: number): string {
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
