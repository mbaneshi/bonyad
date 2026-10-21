import { formatNumber, parseNumber } from "./numbers";

describe("parseNumber", () => {
  it.each([
    ["4", 4],
    ["-2.5", -2.5],
    ["۱۲٫۵", 12.5], // Persian digits and the Arabic decimal separator
    ["٣", 3], // Arabic-Indic digits
    ["1,5", 1.5],
    [" 1e3 ", 1000],
    ["−3", -3], // a typographic minus
    [".5", 0.5],
  ])("reads %s", (text, value) => expect(parseNumber(text)).toBe(value));

  it.each(["", "abc", "1.2.3", "--1", "Infinity", "NaN", "1e999", "4m"])("rejects %j", (text) =>
    expect(parseNumber(text)).toBeNull(),
  );
});

describe("formatNumber", () => {
  it("trims noise and never prints -0", () => {
    expect(formatNumber(12)).toBe("12");
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
    expect(formatNumber(-0)).toBe("0");
    expect(formatNumber(2 / 3)).toBe("0.666667");
  });
});
