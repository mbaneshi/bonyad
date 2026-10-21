import { createHash } from "node:crypto";

// A fixed namespace for ids this service derives; never change it, or retries stop matching.
const NAMESPACE = "6f0f2f5e-3c1a-5b7e-9a64-0b6f1d2c8e41";

/** RFC 4122 version 5 (SHA-1, name-based): the same name always gives the same id. */
export function uuidV5(name: string, namespace: string = NAMESPACE): string {
  const ns = Buffer.from(namespace.replaceAll("-", ""), "hex");
  const h = createHash("sha1").update(ns).update(name).digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
