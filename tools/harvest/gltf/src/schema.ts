// Loose reader for the JSON Schema dialect used by the glTF repository (draft 2020-12 for core, draft-04 for KHR extensions).
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { z } from "zod";

export interface Node {
  $id?: string;
  title?: string;
  type?: string | string[];
  description?: string;
  gltf_detailedDescription?: string;
  $ref?: string;
  allOf?: Node[];
  anyOf?: Node[];
  oneOf?: Node[];
  not?: Node;
  properties?: Record<string, Node>;
  items?: Node;
  required?: string[];
  default?: unknown;
  const?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
  minItems?: number;
  maxItems?: number;
  additionalProperties?: boolean | Node;
  dependentRequired?: Record<string, string[]>;
  definitions?: Record<string, Node>;
  format?: string;
  uniqueItems?: boolean;
  [k: string]: unknown;
}

export const NodeSchema: z.ZodType<Node> = z.lazy(() =>
  z
    .object({
      $id: z.string().optional(),
      title: z.string().optional(),
      type: z.union([z.string(), z.array(z.string())]).optional(),
      description: z.string().optional(),
      gltf_detailedDescription: z.string().optional(),
      $ref: z.string().optional(),
      allOf: z.array(NodeSchema).optional(),
      anyOf: z.array(NodeSchema).optional(),
      oneOf: z.array(NodeSchema).optional(),
      not: NodeSchema.optional(),
      properties: z.record(z.string(), NodeSchema).optional(),
      items: NodeSchema.optional(),
      required: z.array(z.string()).optional(),
      default: z.unknown().optional(),
      const: z.unknown().optional(),
      enum: z.array(z.unknown()).optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      exclusiveMinimum: z.union([z.number(), z.boolean()]).optional(),
      exclusiveMaximum: z.union([z.number(), z.boolean()]).optional(),
      minItems: z.number().optional(),
      maxItems: z.number().optional(),
      additionalProperties: z.union([z.boolean(), NodeSchema]).optional(),
      dependentRequired: z.record(z.string(), z.array(z.string())).optional(),
      definitions: z.record(z.string(), NodeSchema).optional(),
      format: z.string().optional(),
      uniqueItems: z.boolean().optional(),
    })
    .loose(),
);

export interface Doc {
  stem: string; // file name without ".schema.json"
  file: string; // repo-relative path
  ext?: string; // extension name for KHR extension schemas
  node: Node;
}

export function loadDir(root: string, relDir: string, ext?: string): Doc[] {
  const dir = join(root, relDir);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".schema.json"))
    .sort()
    .map((f) => {
      const raw: unknown = JSON.parse(readFileSync(join(dir, f), "utf8"));
      const node = NodeSchema.parse(raw);
      return { stem: basename(f, ".schema.json"), file: `${relDir}/${f}`, ...(ext ? { ext } : {}), node };
    });
}

export function listExtensions(root: string, relDir: string): { ext: string; schemaDir: string }[] {
  return readdirSync(join(root, relDir))
    .sort()
    .flatMap((ext) => {
      try {
        readdirSync(join(root, relDir, ext, "schema"));
        return [{ ext, schemaDir: `${relDir}/${ext}/schema` }];
      } catch {
        return [];
      }
    });
}
