import createClient from "openapi-fetch";
import type { components, paths } from "./generated/schema";
import { ApiError, fromProblem } from "./problem";

type Result<T> = { data?: T; error?: unknown; response: Response };
type Geometry = components["schemas"]["Geometry"];

/** The seven operations, as typed calls. Every failure is thrown as an ApiError. */
export function createApi(fetchImpl?: typeof fetch) {
  const client = createClient<paths>({
    baseUrl: globalThis.location?.origin ?? "http://localhost",
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });

  async function call<T>(run: () => Promise<Result<T>>): Promise<T> {
    let r: Result<T>;
    try {
      r = await run();
    } catch {
      throw new ApiError(0, "network");
    }
    if (!r.response.ok) throw fromProblem(r.response.status, r.error);
    return r.data as T;
  }

  return {
    getProject: () => call(() => client.GET("/v1/project")),

    createEntity: (id: string, g: Geometry) => {
      switch (g.kind) {
        case "point":
          return call(() => client.POST("/v1/points", { body: { id, x: g.x, y: g.y } }));
        case "line":
          return call(() => client.POST("/v1/lines", { body: { id, a: g.a, b: g.b } }));
        case "surface":
          return call(() => client.POST("/v1/surfaces", { body: { id, vertices: g.vertices } }));
      }
    },

    updateGeometry: (id: string, g: Geometry, expectedRevision: number) =>
      call(() => client.PUT("/v1/entities/{id}/geometry", { params: { path: { id } }, body: { expected_revision: expectedRevision, geometry: g } })),

    deleteEntity: (id: string) =>
      call(() => client.DELETE("/v1/entities/{id}", { params: { path: { id } } })),

    measure: (id: string) =>
      call(() => client.GET("/v1/entities/{id}/measure", { params: { path: { id } } })),
  };
}

export type Api = ReturnType<typeof createApi>;
