import { z } from "zod";
import { uuidV5 } from "./uuid";

/**
 * The tool catalog: one tool per API operation, each with an explicit route. Nothing is
 * generated; `test/contract.test.ts` checks this file against `contracts/openapi.json`, so a
 * tool cannot drift from, or outlive, the endpoint it calls.
 */

const num = z.number().describe("a finite number, in metres");
const point = z.strictObject({ x: num, y: num });

const geometry = z.union([
  z.strictObject({ kind: z.literal("point"), x: num, y: num }),
  z.strictObject({ kind: z.literal("line"), a: point, b: point }),
  z.strictObject({ kind: z.literal("surface"), vertices: z.array(point) }),
]);

const entityId = z.uuid().describe("an entity id returned by an earlier tool call");

export type Route = { method: "GET" | "POST" | "PUT" | "DELETE"; template: string };
export type BuiltCall = { params: Record<string, string>; body?: unknown };

export type ToolSpec<S extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  kind: "read" | "mutation";
  schema: S;
  route: Route;
  /** `toolUseId` makes creates idempotent: a retried call derives the same entity id. */
  build: (input: z.infer<S>, toolUseId: string) => BuiltCall;
};

function tool<S extends z.ZodType>(spec: ToolSpec<S>): ToolSpec {
  return spec as unknown as ToolSpec;
}

export const TOOLS: ToolSpec[] = [
  tool({
    name: "get_project_state",
    description:
      "Read the whole project: its unit and every entity (id, kind, geometry). Call this to see what exists before changing anything.",
    kind: "read",
    schema: z.strictObject({}),
    route: { method: "GET", template: "/v1/project" },
    build: () => ({ params: {} }),
  }),
  tool({
    name: "create_point",
    description: "Create a point at (x, y). Returns the new entity with its id.",
    kind: "mutation",
    schema: z.strictObject({ x: num, y: num }),
    route: { method: "POST", template: "/v1/points" },
    build: (i, id) => ({ params: {}, body: { id: uuidV5(id), x: i.x, y: i.y } }),
  }),
  tool({
    name: "create_line",
    description:
      "Create a straight line between a and b. The line owns its two endpoints; they are not links to existing points. The endpoints must differ.",
    kind: "mutation",
    schema: z.strictObject({ a: point, b: point }),
    route: { method: "POST", template: "/v1/lines" },
    build: (i, id) => ({ params: {}, body: { id: uuidV5(id), a: i.a, b: i.b } }),
  }),
  tool({
    name: "create_surface",
    description:
      "Create a flat polygon from an ordered list of vertices. List each corner once (A, B, C), not A, B, C, A: the closing edge is implied. At least three vertices, not all on one line, and edges must not cross.",
    kind: "mutation",
    schema: z.strictObject({ vertices: z.array(point) }),
    route: { method: "POST", template: "/v1/surfaces" },
    build: (i, id) => ({ params: {}, body: { id: uuidV5(id), vertices: i.vertices } }),
  }),
  tool({
    name: "update_geometry",
    description:
      "Replace an existing entity's geometry, for example to move a point or a vertex. The kind must match the entity's kind. Send the complete new geometry.",
    kind: "mutation",
    schema: z.strictObject({ entity_id: entityId, geometry }),
    route: { method: "PUT", template: "/v1/entities/{id}/geometry" },
    build: (i) => ({ params: { id: i.entity_id }, body: i.geometry }),
  }),
  tool({
    name: "delete_entity",
    description: "Delete an entity by id.",
    kind: "mutation",
    schema: z.strictObject({ entity_id: entityId }),
    route: { method: "DELETE", template: "/v1/entities/{id}" },
    build: (i) => ({ params: { id: i.entity_id } }),
  }),
  tool({
    name: "measure_entity",
    description:
      "Measure a line (length) or a surface (area and perimeter). Always use this for numbers; never compute them yourself.",
    kind: "read",
    schema: z.strictObject({ entity_id: entityId }),
    route: { method: "GET", template: "/v1/entities/{id}/measure" },
    build: (i) => ({ params: { id: i.entity_id } }),
  }),
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

// Zod's uuid pattern is long and adds nothing for the model; `format: "uuid"` stays and Zod
// still enforces the exact pattern when the input is validated.
function dropUuidPattern(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(dropUuidPattern);
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (k === "pattern" && o.format === "uuid") continue;
      out[k] = dropUuidPattern(v);
    }
    return out;
  }
  return node;
}

/** What the model is shown: strict JSON Schema generated from the same Zod schema that validates. */
export function toolDefinitions() {
  return TOOLS.map((t) => {
    const { $schema: _omit, ...rest } = z.toJSONSchema(t.schema, { io: "input" }) as Record<string, unknown>;
    return { name: t.name, description: t.description, input_schema: dropUuidPattern(rest) as Record<string, unknown> };
  });
}
