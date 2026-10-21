import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { ApiProvider } from "../api/hooks";
import { createApi } from "../api/client";
import type { EntityView } from "../model";
import { AgentProvider } from "./useAgent";
import { createAgentApi } from "./client";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Drives both the drawing API and the agent service from one scripted fetch. */
function world(opts: { agentDown?: boolean; history?: unknown } = {}) {
  const entities: EntityView[] = [];
  const posts: { path: string; body: unknown }[] = [];
  let release: (() => void) | undefined;

  const sse = (events: { type: string; data: Record<string, unknown> }[], hold = false) => {
    const enc = new TextEncoder();
    return new Response(
      new ReadableStream({
        async start(c) {
          for (const [i, e] of events.entries()) {
            c.enqueue(enc.encode(`id: ${i + 1}\nevent: ${e.type}\ndata: ${JSON.stringify({ run_id: "run-1", seq: i + 1, ...e })}\n\n`));
            await Promise.resolve();
          }
          if (hold) await new Promise<void>((r) => (release = r));
          c.close();
        },
      }),
      { headers: { "content-type": "text/event-stream", "x-run-id": "run-1" } },
    );
  };

  const fetchImpl = async (input: Request | string, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    const path = new URL(url, "http://x").pathname;
    const method = typeof input === "string" ? (init?.method ?? "GET") : input.method;
    if (path === "/v1/project") return json(200, { project: { id: "p", name: "S", unit: "m", frame: "local-cartesian" }, entities });
    if (path === "/agent/conversations/latest") return opts.history ? json(200, opts.history) : json(404, {});
    if (path === "/agent/runs" && method === "POST") {
      if (opts.agentDown) throw new TypeError("down");
      const body = JSON.parse(String(init?.body));
      posts.push({ path, body });
      if (body.message.startsWith("slow")) return sse([{ type: "run_started", data: { task: body.message, conversation_id: "c1" } }, { type: "text_delta", data: { text: "working" } }], true);
      entities.push({ id: "11111111-1111-4111-8111-111111111111", label: null, created_at: "t", updated_at: "t", geometry: { kind: "point", x: 1, y: 1 } });
      return sse([
        { type: "run_started", data: { task: body.message, conversation_id: "c1" } },
        { type: "text_delta", data: { text: "Adding " } },
        { type: "text_delta", data: { text: "a point." } },
        { type: "assistant_message", data: { text: "Adding a point." } },
        { type: "tool_started", data: { tool_use_id: "t1", name: "create_point", input: { x: 1, y: 1 } } },
        { type: "tool_completed", data: { tool_use_id: "t1", name: "create_point", result: { id: "x", geometry: { kind: "point", x: 1, y: 1 } } } },
        { type: "tool_started", data: { tool_use_id: "t2", name: "measure_entity", input: {} } },
        { type: "tool_completed", data: { tool_use_id: "t2", name: "measure_entity", result: { kind: "surface", area: 6, area_unit: "m²", perimeter: 12, unit: "m" } } },
        { type: "assistant_message", data: { text: "Done: the area is 6 m²." } },
        { type: "run_completed", data: {} },
      ]);
    }
    if (path === "/agent/runs/run-1/cancel") {
      posts.push({ path, body: null });
      release?.();
      return json(202, { cancelling: true });
    }
    return json(404, {});
  };
  return { entities, posts, fetchImpl: fetchImpl as unknown as typeof fetch };
}

function setup(w = world()) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <ApiProvider api={createApi(w.fetchImpl)}>
        <AgentProvider api={createAgentApi(w.fetchImpl)}>
          <App />
        </AgentProvider>
      </ApiProvider>
    </QueryClientProvider>,
  );
  return { w, user: userEvent.setup() };
}

const openChat = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(document.querySelector("[data-open-chat]")!);
  return screen.getByRole("region", { name: "دستیار" });
};

describe("assistant panel", () => {
  it("streams text and tool progress, and the drawing updates without a manual refresh", async () => {
    const { w, user } = setup();
    await screen.findByText(/هنوز چیزی/);
    const chat = await openChat(user);
    await user.type(within(chat).getByRole("textbox"), "add a point and measure");
    await user.click(within(chat).getByRole("button", { name: "ارسال" }));

    expect(await within(chat).findByText("Done: the area is 6 m².")).toBeInTheDocument();
    expect(within(chat).getByText("ایجاد نقطه")).toBeInTheDocument();
    expect(chat.querySelectorAll('[data-status="done"]').length).toBeGreaterThanOrEqual(2);
    // The tool's verified result is shown, distinct from the model's prose.
    expect(within(chat).getByText("6 m² · 12 m")).toBeInTheDocument();
    expect(w.posts[0]).toMatchObject({ body: { message: "add a point and measure" } });
    // No reload, no click: the new point is already in the entity list.
    const list = screen.getByRole("region", { name: "عناصر" });
    await waitFor(() => expect(within(list).getByRole("button", { name: /نقطه/ })).toBeInTheDocument());
  });

  it("sends the selected entity and continues the same conversation", async () => {
    const { w, user } = setup();
    await screen.findByText(/هنوز چیزی/);
    let chat = await openChat(user);
    await user.type(within(chat).getByRole("textbox"), "first");
    await user.click(within(chat).getByRole("button", { name: "ارسال" }));
    await within(chat).findByText("Done: the area is 6 m²."); // conversation id c1 is now known

    const list = screen.getByRole("region", { name: "عناصر" });
    await user.click(await within(list).findByRole("button", { name: /نقطه/ })); // select it (opens properties)
    await user.click(within(screen.getByRole("complementary")).getByRole("button", { name: "دستیار" })); // back to the assistant tab
    chat = screen.getByRole("region", { name: "دستیار" });
    await user.type(within(chat).getByRole("textbox"), "second");
    await user.click(within(chat).getByRole("button", { name: "ارسال" }));
    await waitFor(() => expect(w.posts.filter((p) => p.path === "/agent/runs")).toHaveLength(2));
    expect(w.posts[1]!.body).toMatchObject({ message: "second", conversation_id: "c1", selection: ["11111111-1111-4111-8111-111111111111"] });
  });

  it("stop cancels the run through the service", async () => {
    const { w, user } = setup();
    await screen.findByText(/هنوز چیزی/);
    const chat = await openChat(user);
    await user.type(within(chat).getByRole("textbox"), "slow one");
    await user.click(within(chat).getByRole("button", { name: "ارسال" }));
    await user.click(await within(chat).findByRole("button", { name: "توقف" }));
    await waitFor(() => expect(w.posts.some((p) => p.path === "/agent/runs/run-1/cancel")).toBe(true));
  });

  it("restores the last conversation after a reload", async () => {
    const history = {
      conversation_id: "c1",
      runs: [{ id: "r0", task: "earlier task", status: "completed", events: [
        { seq: 1, type: "run_started", data: { task: "earlier task" } },
        { seq: 2, type: "tool_started", data: { tool_use_id: "a", name: "create_line", input: {} } },
        { seq: 3, type: "tool_completed", data: { tool_use_id: "a", name: "create_line", result: { geometry: { kind: "line", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } } } } },
        { seq: 4, type: "assistant_message", data: { text: "Line created." } },
        { seq: 5, type: "run_completed", data: {} },
      ] }],
    };
    const { user } = setup(world({ history }));
    const chat = await openChat(user);
    expect(await within(chat).findByText("earlier task")).toBeInTheDocument();
    expect(within(chat).getByText("Line created.")).toBeInTheDocument();
    expect(within(chat).getByText("ایجاد خط")).toBeInTheDocument();
  });

  it("says plainly when the service is down and keeps the typed text out of the log", async () => {
    const { user } = setup(world({ agentDown: true }));
    await screen.findByText(/هنوز چیزی/);
    const chat = await openChat(user);
    await user.type(within(chat).getByRole("textbox"), "hello");
    await user.click(within(chat).getByRole("button", { name: "ارسال" }));
    expect(await within(chat).findByRole("alert")).toHaveTextContent("سرویس دستیار در دسترس نیست");
    expect(chat.querySelectorAll(".turn")).toHaveLength(0);
  });
});
