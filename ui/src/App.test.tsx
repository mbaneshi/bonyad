import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { ApiProvider } from "./api/hooks";
import { createApi } from "./api/client";
import type { EntityView } from "./model";

/** A scripted stand-in for the API: it records requests and can be told to fail. */
function fakeServer() {
  const entities: EntityView[] = [];
  const calls: { method: string; path: string; body: unknown }[] = [];
  const state = { down: false, rejectSurface: false };
  const json = (status: number, body: unknown, type = "application/json") =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": type } });

  const fetchImpl = async (input: Request) => {
    if (state.down) throw new TypeError("network down");
    const url = new URL(input.url);
    const body = input.method === "GET" || input.method === "DELETE" ? undefined : await input.clone().json();
    calls.push({ method: input.method, path: url.pathname, body });
    const now = "2026-10-21T12:00:00Z";
    if (url.pathname === "/v1/project")
      return json(200, { project: { id: "p", name: "Sample", unit: "m", frame: "local-cartesian" }, entities });
    if (url.pathname === "/v1/points" && input.method === "POST") {
      const e = { id: body.id, label: null, created_at: now, updated_at: now, geometry: { kind: "point", x: body.x, y: body.y } };
      entities.push(e as EntityView);
      return json(201, e);
    }
    if (url.pathname === "/v1/surfaces" && input.method === "POST") {
      if (state.rejectSurface)
        return json(
          422,
          {
            type: "about:blank", title: "Invalid geometry", status: 422, code: "invalid_geometry",
            violations: [{ code: "self_intersecting_surface", path: "vertices", message: "edges cross" }],
          },
          "application/problem+json",
        );
      const e = { id: body.id, label: null, created_at: now, updated_at: now, geometry: { kind: "surface", vertices: body.vertices } };
      entities.push(e as EntityView);
      return json(201, e);
    }
    const measure = url.pathname.match(/^\/v1\/entities\/(.+)\/measure$/);
    if (measure) return json(200, { kind: "surface", entity_id: measure[1], area: 6, area_unit: "m²", perimeter: 12, unit: "m" });
    return json(404, { type: "about:blank", title: "nf", status: 404, code: "not_found" }, "application/problem+json");
  };
  return { entities, calls, state, fetchImpl };
}

function setup(server = fakeServer()) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  const api = createApi(server.fetchImpl as unknown as typeof fetch);
  render(
    <QueryClientProvider client={client}>
      <ApiProvider api={api}>
        <App />
      </ApiProvider>
    </QueryClientProvider>,
  );
  return { server, user: userEvent.setup() };
}

describe("App", () => {
  it("starts empty and says how to begin", async () => {
    setup();
    expect(await screen.findByText(/هنوز چیزی ترسیم نشده/)).toBeInTheDocument();
  });

  it("creates a point from Persian digits and shows it in the list", async () => {
    const { server, user } = setup();
    await screen.findByText(/هنوز چیزی/);
    await user.click(screen.getByRole("button", { name: /نقطه/ }));
    const panel = screen.getByRole("complementary", { name: "ویژگی‌ها" });
    await user.type(within(panel).getByLabelText("x"), "۱");
    await user.type(within(panel).getByLabelText("y"), "1");
    await user.click(within(panel).getByRole("button", { name: "ایجاد" }));

    await waitFor(() => expect(document.querySelector(".entity-list")).toBeInTheDocument());
    const post = server.calls.find((c) => c.method === "POST");
    expect(post?.body).toMatchObject({ x: 1, y: 1 });
    expect((post?.body as { id: string }).id).toMatch(/^[0-9a-f-]{36}$/);
    // The new point is selected and its form is open for editing.
    expect(await within(panel).findByRole("button", { name: "ذخیره" })).toBeInTheDocument();
  });

  it("keeps a field-level message for unreadable text and sends nothing", async () => {
    const { server, user } = setup();
    await screen.findByText(/هنوز چیزی/);
    await user.click(screen.getByRole("button", { name: /نقطه/ }));
    const panel = screen.getByRole("complementary", { name: "ویژگی‌ها" });
    await user.type(within(panel).getByLabelText("x"), "abc");
    await user.click(within(panel).getByRole("button", { name: "ایجاد" }));
    expect(within(panel).getAllByText("یک عدد معتبر وارد کنید.")).toHaveLength(2); // x and the empty y
    expect(server.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("shows the server's rule in Persian and leaves the project unchanged on a 422", async () => {
    const server = fakeServer();
    server.state.rejectSurface = true;
    const { user } = setup(server);
    await screen.findByText(/هنوز چیزی/);
    await user.click(screen.getByRole("button", { name: /سطح/ }));
    const panel = screen.getByRole("complementary", { name: "ویژگی‌ها" });
    const coords = [["0", "0"], ["4", "3"], ["4", "0"]];
    const xs = within(panel).getAllByLabelText("x");
    const ys = within(panel).getAllByLabelText("y");
    for (const [i, [x, y]] of coords.entries()) {
      await user.type(xs[i]!, x!);
      await user.type(ys[i]!, y!);
    }
    await user.click(within(panel).getByRole("button", { name: "ایجاد" }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent("اضلاع سطح یکدیگر را قطع می‌کنند");
    expect(server.entities).toHaveLength(0);
    expect(xs[1]).toHaveValue("4"); // the user's input survives to be fixed
  });

  it("reports a lost connection and recovers on retry", async () => {
    const server = fakeServer();
    server.state.down = true;
    const { user } = setup(server);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("ارتباط با سرور برقرار نشد");
    server.state.down = false;
    await user.click(within(alert).getByRole("button", { name: "تلاش دوباره" }));
    expect(await screen.findByText(/هنوز چیزی/)).toBeInTheDocument();
  });

  it("measures a selected surface from the server, not from the browser", async () => {
    const server = fakeServer();
    server.entities.push({
      id: "11111111-1111-4111-8111-111111111111", label: null,
      created_at: "2026-10-21T12:00:00Z", updated_at: "2026-10-21T12:00:00Z",
      geometry: { kind: "surface", vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }] },
    });
    const { user } = setup(server);
    const list = await screen.findByRole("region", { name: "عناصر" });
    await user.click(await within(list).findByRole("button", { name: /سطح/ }));
    const panel = screen.getByRole("complementary", { name: "ویژگی‌ها" });
    expect(await within(panel).findByText("6 m²")).toBeInTheDocument();
    expect(within(panel).getByText("12 m")).toBeInTheDocument();
  });
});
