import { entityRows, expect, expectFitsViewport, test } from "./fixtures";

// The agent service replays a fixed script (tests/e2e/fixtures/agent-script.json) of 7 model
// turns in a loop: scenario 1 (3 turns), scenario 2 (3 turns), then one turn that never ends.
// The two tests below consume exactly one cycle, in this order, so every viewport starts clean.

test("scenarios 1 and 2 through the assistant: streamed, verified, restored", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/");
  await page.locator("[data-open-chat]").click();
  const input = page.locator(".chat-form textarea");
  await expect(input).toBeInViewport();

  // Scenario 1
  await input.fill("Create points A(0,0), B(4,0), C(0,3), a line A-B and a triangle. Tell me the length and area.");
  await page.locator("[data-chat-send]").click();
  const chat = page.locator(".chat");
  await expect(chat).toContainText("The line is 4 m long and the surface is 6 m²");
  await expect(chat.locator('.tool[data-status="done"]')).toHaveCount(7);
  // The API's own answers are shown on the tool rows.
  await expect(chat.locator('.tool[data-tool="measure_entity"]').first()).toContainText("4 m");
  await expect(chat.locator('.tool[data-tool="measure_entity"]').last()).toContainText("6 m²");
  // The drawing filled in without a reload: 3 points, 1 line, 1 surface.
  await expect(entityRows(page)).toHaveCount(5);

  // Scenario 2
  await input.fill("Move B to (8,0) and recalculate.");
  await page.locator("[data-chat-send]").click();
  await expect(chat).toContainText("After moving B the area is 12 m²");
  await expect(chat.locator('.tool[data-tool="update_geometry"]')).toHaveAttribute("data-status", "done");

  // The API holds the moved vertex.
  const project = await (await request.get("/v1/project")).json();
  const surface = project.entities.find((e: any) => e.geometry.kind === "surface");
  expect(surface.geometry.vertices).toContainEqual({ x: 8, y: 0 });
  await expectFitsViewport(page);

  // Reload: the conversation comes back with both runs.
  await page.reload();
  await page.locator("[data-open-chat]").click();
  await expect(page.locator(".chat .turn")).toHaveCount(2);
  await expect(page.locator(".chat")).toContainText("After moving B the area is 12 m²");

  expect(errors).toEqual([]);
});

test("stop cancels a run that never finishes and says what happens next", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-open-chat]").click();
  await page.locator(".chat-form textarea").fill("slow request");
  await page.locator("[data-chat-send]").click();
  const stop = page.locator("[data-chat-stop]");
  await expect(stop).toBeVisible();
  await stop.click();
  await expect(page.locator('.turn[data-status="cancelled"]')).toBeVisible();
  await expect(page.locator("[data-chat-send]")).toBeVisible();
});
