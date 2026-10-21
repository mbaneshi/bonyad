import { entityRows, expect, expectFitsViewport, field, submit, test } from "./fixtures";

test("the acceptance example, by hand", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("422") && errors.push(m.text()));

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  await expect(page.getByText(/هنوز چیزی ترسیم نشده/)).toBeVisible();

  // a point (1, 1)
  await page.locator("[data-add=point]").click();
  await field(page, "x").fill("1");
  await field(page, "y").fill("1");
  await submit(page).click();
  await expect(entityRows(page)).toHaveCount(1);

  // a line (0,0) -> (4,0): length 4 m
  await page.locator("[data-add=line]").click();
  for (const [f, v] of [["a.x", "0"], ["a.y", "0"], ["b.x", "4"], ["b.y", "0"]] as const) await field(page, f).fill(v);
  await submit(page).click();
  await expect(page.locator(".measures")).toContainText("4 m");

  // a surface (0,0), (4,0), (0,3): area 6 m²
  await page.locator("[data-add=surface]").click();
  const triangle = [[0, 0], [4, 0], [0, 3]];
  for (const [i, [x, y]] of triangle.entries()) {
    await field(page, `vertices[${i}].x`).fill(String(x));
    await field(page, `vertices[${i}].y`).fill(String(y));
  }
  await submit(page).click();
  await expect(page.locator(".measures")).toContainText("6 m²");
  await expectFitsViewport(page);

  // move vertex (4,0) -> (8,0), typed with a Persian digit: area 12 m²
  await field(page, "vertices[1].x").fill("۸");
  await submit(page).click();
  await expect(page.locator(".measures")).toContainText("12 m²");

  // a reload shows the same state
  await page.reload();
  await expect(entityRows(page)).toHaveCount(3);
  await entityRows(page).nth(2).locator("button").click();
  await expect(page.locator(".measures")).toContainText("12 m²");

  // a bow-tie is rejected in Persian and changes nothing
  await page.locator("[data-add=surface]").click();
  const bowTie = [[0, 0], [4, 4], [4, 0]];
  for (const [i, [x, y]] of bowTie.entries()) {
    await field(page, `vertices[${i}].x`).fill(String(x));
    await field(page, `vertices[${i}].y`).fill(String(y));
  }
  await page.locator(".entity-form button.secondary").click(); // add a vertex
  await field(page, "vertices[3].x").fill("0");
  await field(page, "vertices[3].y").fill("4");
  await submit(page).click();
  await expect(page.getByRole("alert")).toContainText("اضلاع سطح یکدیگر را قطع می‌کنند");
  await expect(entityRows(page)).toHaveCount(3);
  await expectFitsViewport(page);

  expect(errors).toEqual([]);
});

test("a zero-length line is refused next to its field and nothing is saved", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-add=line]").click();
  for (const f of ["a.x", "a.y", "b.x", "b.y"]) await field(page, f).fill("2");
  await submit(page).click();
  await expect(page.getByRole("alert")).toContainText("طول خط نمی‌تواند صفر باشد");
  await expect(page.getByText(/هنوز چیزی ترسیم نشده/)).toBeVisible();
});
