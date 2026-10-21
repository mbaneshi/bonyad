import { expect, test as base, type Page } from "@playwright/test";
import postgres from "postgres";
import { e2eDatabaseUrl } from "../ports";

export { expect };

/** Every test starts from an empty drawing and no conversations (the project row stays). */
export const test = base.extend<{ clean: void }>({
  clean: [
    async ({}, use) => {
      const sql = postgres(e2eDatabaseUrl(), { max: 1 });
      await sql`delete from bonyad.entities`;
      await sql`delete from agent.conversations`;
      await sql.end();
      await use();
    },
    { auto: true },
  ],
});

export const field = (page: Page, path: string) => page.locator(`[data-field="${path}"]`);
export const submit = (page: Page) => page.locator(".entity-form button[type=submit]");
export const entityRows = (page: Page) => page.locator(".entity-list li");

/** The page never scrolls sideways, and the open panel (sheet or column) is inside the viewport. */
export async function expectFitsViewport(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await page.evaluate(() => {
    const r = document.querySelector(".panel.open")?.getBoundingClientRect();
    return r ? { left: r.left, right: r.right, bottom: r.bottom, w: innerWidth, h: innerHeight } : null;
  });
  expect(box).not.toBeNull();
  expect(box!.left).toBeGreaterThanOrEqual(0);
  expect(box!.right).toBeLessThanOrEqual(box!.w + 0.5);
  expect(box!.bottom).toBeLessThanOrEqual(box!.h + 0.5);
}
