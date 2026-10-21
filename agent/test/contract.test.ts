import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOOLS, toolDefinitions } from "../src/tools";
import { REPO } from "./helpers";

type OpenApi = { paths: Record<string, Record<string, any>>; components: { schemas: Record<string, any> } };
const spec = JSON.parse(readFileSync(join(REPO, "contracts/openapi.json"), "utf8")) as OpenApi;

/** Every operation in the contract the agent may use (the health probe is not a tool). */
const operations = Object.entries(spec.paths)
  .filter(([path]) => path !== "/healthz")
  .flatMap(([path, methods]) => Object.keys(methods).map((m) => `${m.toUpperCase()} ${path}`));

const resolveRef = (node: any): any => (node?.$ref ? spec.components.schemas[node.$ref.split("/").pop()!] : node);
const bodySchema = (route: { method: string; template: string }) =>
  resolveRef(spec.paths[route.template]?.[route.method.toLowerCase()]?.requestBody?.content?.["application/json"]?.schema);

describe("tools vs contracts/openapi.json", () => {
  test("every tool maps to an operation that exists", () => {
    for (const t of TOOLS) {
      expect(spec.paths[t.route.template]?.[t.route.method.toLowerCase()], `${t.name} -> ${t.route.method} ${t.route.template}`).toBeDefined();
    }
  });

  test("every operation has exactly one tool", () => {
    const mapped = TOOLS.map((t) => `${t.route.method} ${t.route.template}`);
    expect(new Set(mapped).size).toBe(mapped.length);
    expect(mapped.sort()).toEqual(operations.sort());
  });

  test("tool names are unique", () => {
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
  });

  test("create tools send only fields the request body accepts, and cover its required ones", () => {
    for (const t of TOOLS.filter((x) => x.route.method === "POST")) {
      const body = bodySchema(t.route);
      const accepted = new Set(Object.keys(body.properties));
      const sent = (t.build as any)(sampleInput(t.name), "toolu_x").body as Record<string, unknown>;
      for (const key of Object.keys(sent)) expect(accepted.has(key), `${t.name} sends unknown field ${key}`).toBe(true);
      for (const key of body.required as string[]) expect(key in sent, `${t.name} omits required field ${key}`).toBe(true);
    }
  });

  test("update_geometry accepts exactly the kinds the API's Geometry accepts", () => {
    const api = resolveRef(spec.paths["/v1/entities/{id}/geometry"].put.requestBody.content["application/json"].schema);
    const apiKinds = api.oneOf.map((o: any) => o.allOf.find((p: any) => p.properties?.kind).properties.kind.enum[0]).sort();
    const def = toolDefinitions().find((t) => t.name === "update_geometry")!;
    const toolKinds = (def.input_schema as any).properties.geometry.anyOf.map((o: any) => o.properties.kind.const).sort();
    expect(toolKinds).toEqual(apiKinds);
  });

  test("path parameters are filled from validated uuids only", () => {
    const t = TOOLS.find((x) => x.name === "delete_entity")!;
    expect(t.schema.safeParse({ entity_id: "../../etc/passwd" }).success).toBe(false);
  });
});

describe("what the model is shown", () => {
  test("every object schema is strict: additionalProperties false and all properties required", () => {
    const walk = (node: any, where: string) => {
      if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${where}[${i}]`));
      if (node && typeof node === "object") {
        if (node.type === "object") {
          expect(node.additionalProperties, where).toBe(false);
          expect([...(node.required ?? [])].sort(), where).toEqual(Object.keys(node.properties ?? {}).sort());
        }
        for (const [k, v] of Object.entries(node)) walk(v, `${where}.${k}`);
      }
    };
    for (const d of toolDefinitions()) walk(d.input_schema, d.name);
  });
});

function sampleInput(tool: string): any {
  const p = { x: 1, y: 2 };
  return tool === "create_point" ? p : tool === "create_line" ? { a: p, b: { x: 3, y: 4 } } : { vertices: [p, { x: 3, y: 4 }, { x: 0, y: 9 }] };
}
