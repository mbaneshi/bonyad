// Doxygen/markdown flavoured USD docs -> plain sentences.

export function cleanDoc(raw: string): string {
  let s = raw;
  s = s.replace(/\\ref\s+\S+\s+"([^"]*)"/g, "$1");
  s = s.replace(/\\ref\s+(\S+)/g, "$1");
  s = s.replace(/\\(?:em|a|b|c|p)\s+/g, "");
  s = s.replace(/\\(?:li|note|deprecated|todo|anchor\s+\S+|section\s+\S+|subsection\s+\S+|brief)\b/g, " ");
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, " ");
  s = s.replace(/\\[a-zA-Z]+/g, " ");
  s = s.replace(/`/g, "");
  s = s.replace(/__([^_\s][^_]*)__/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/(^|\s)_([^_\s][^_]*)_(?=[\s.,;:)]|$)/g, "$1$2");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** First `n` sentences of cleaned text, capped at `max` characters (cut on a word boundary). */
export function sentences(raw: string | undefined, n: number, max: number): string | undefined {
  if (!raw) return undefined;
  const s = cleanDoc(raw);
  if (!s) return undefined;
  const parts: string[] = [];
  const re = /[^.!?]*[.!?](?=\s|$)/g;
  let m: RegExpExecArray | null;
  let used = 0;
  while ((m = re.exec(s)) && parts.length < n) {
    // do not split on common abbreviations / e.g. i.e.
    parts.push(m[0].trim());
    used = re.lastIndex;
  }
  let out = parts.length ? parts.join(" ") : s;
  if (!parts.length && used === 0) out = s;
  if (out.length > max) {
    out = out.slice(0, max);
    const cut = out.lastIndexOf(" ");
    out = (cut > max * 0.6 ? out.slice(0, cut) : out).replace(/[,;:\s]+$/, "") + " ...";
  }
  return out;
}

export function snake(name: string): string {
  return name
    .replace(/__INSTANCE_NAME__/g, "_instance_name_")
    .replace(/[:.\-]+/g, "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase()
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function pascal(name: string): string {
  const parts = name.split(/[:._\-]+/).filter(Boolean);
  return parts.map((p) => p[0]!.toUpperCase() + p.slice(1)).join("");
}
