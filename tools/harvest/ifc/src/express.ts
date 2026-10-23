// Minimal EXPRESS (ISO 10303-11) parser: TYPE and ENTITY declarations only.
// FUNCTION, RULE, PROCEDURE and CONSTANT blocks are skipped. WHERE/UNIQUE are not interpreted.
import { z } from "zod";

export type TypeExpr =
  | { k: "simple"; name: "REAL" | "INTEGER" | "NUMBER" | "BOOLEAN" | "LOGICAL" | "STRING" | "BINARY" }
  | { k: "named"; name: string }
  | { k: "agg"; agg: "LIST" | "SET" | "BAG" | "ARRAY"; lo: string; hi: string; unique: boolean; of: TypeExpr };

export interface TypeDef {
  name: string;
  /** declared shape */
  body: { k: "enum"; values: string[] } | { k: "select"; members: string[] } | { k: "expr"; expr: TypeExpr };
  where: string[]; // rule labels only
  whereText: string; // raw WHERE text, for the narrow positive/non-negative checks
}

export interface Attr {
  name: string;
  optional: boolean;
  type: TypeExpr;
}

export interface EntityDef {
  name: string;
  abstract: boolean;
  supertypeOf: string; // raw text of the SUPERTYPE OF clause, "" when absent
  subtypeOf: string[];
  attrs: Attr[];
  redeclared: string[]; // explicit `SELF\Base.attr : type` narrowing redeclarations (not new columns)
  derived: string[]; // DERIVE names (skipped, never stored)
  derivedRedeclared: string[]; // DERIVE `SELF\Base.attr` overrides of an inherited attribute
  inverse: string[]; // INVERSE names (skipped, never stored)
}

export interface Schema {
  name: string;
  types: Map<string, TypeDef>;
  entities: Map<string, EntityDef>;
  skipped: { functions: number; rules: number };
}

const SchemaShape = z.object({ name: z.string().min(1) });

/** Remove (* nested *) and -- line comments, and ".." tail remarks; keep string literals intact. */
export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  let depth = 0;
  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];
    if (depth === 0 && c === "'") {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "'") {
          if (src[j + 1] === "'") j += 2;
          else break;
        } else j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === "(" && n === "*") {
      depth++;
      i += 2;
    } else if (c === "*" && n === ")" && depth > 0) {
      depth--;
      i += 2;
      if (depth === 0) out += " ";
    } else if (depth === 0 && c === "-" && n === "-") {
      while (i < src.length && src[i] !== "\n") i++;
    } else {
      if (depth === 0) out += c;
      i++;
    }
  }
  return out;
}

type Tok = { t: "id" | "num" | "str" | "sym"; v: string };

export function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  const re = /\s+|('(?:[^']|'')*')|([A-Za-z_][A-Za-z0-9_]*)|(\d+(?:\.\d+)?)|(:=:|:<>:|:=|<>|<=|>=|\|\||\*\*|\\|[(){}\[\];:,.=<>+\-*/|?])/gy;
  let m: RegExpExecArray | null;
  while (re.lastIndex < src.length) {
    const at = re.lastIndex;
    m = re.exec(src);
    if (!m) throw new Error(`tokenize: unexpected character ${JSON.stringify(src[at])} at ${at}`);
    if (m[1] !== undefined) toks.push({ t: "str", v: m[1] });
    else if (m[2] !== undefined) toks.push({ t: "id", v: m[2] });
    else if (m[3] !== undefined) toks.push({ t: "num", v: m[3] });
    else if (m[4] !== undefined) toks.push({ t: "sym", v: m[4] });
  }
  return toks;
}

const SIMPLE = new Set(["REAL", "INTEGER", "NUMBER", "BOOLEAN", "LOGICAL", "STRING", "BINARY"]);

class Parser {
  p = 0;
  constructor(readonly toks: Tok[]) {}
  peek(o = 0): Tok | undefined {
    return this.toks[this.p + o];
  }
  next(): Tok {
    const t = this.toks[this.p++];
    if (!t) throw new Error("unexpected end of input");
    return t;
  }
  isKw(kw: string, o = 0): boolean {
    const t = this.peek(o);
    return !!t && t.t === "id" && t.v.toUpperCase() === kw;
  }
  isSym(s: string, o = 0): boolean {
    const t = this.peek(o);
    return !!t && t.t === "sym" && t.v === s;
  }
  expectKw(kw: string): void {
    if (!this.isKw(kw)) throw new Error(`expected ${kw} at token ${this.p}, got ${this.peek()?.v}`);
    this.p++;
  }
  expectSym(s: string): void {
    if (!this.isSym(s)) throw new Error(`expected '${s}' at token ${this.p}, got ${this.peek()?.v}`);
    this.p++;
  }
  id(): string {
    const t = this.next();
    if (t.t !== "id") throw new Error(`expected identifier, got ${t.v}`);
    return t.v;
  }
  /** Skip a balanced "( ... )" group; cursor must be on "(". Returns the inner tokens. */
  group(): Tok[] {
    this.expectSym("(");
    let d = 1;
    const out: Tok[] = [];
    while (d > 0) {
      const t = this.next();
      if (t.t === "sym" && t.v === "(") d++;
      if (t.t === "sym" && t.v === ")") {
        d--;
        if (d === 0) break;
      }
      out.push(t);
    }
    return out;
  }
  bound(): string {
    // number, '?', or an identifier/expression up to ':' or ']'
    let s = "";
    while (!this.isSym(":") && !this.isSym("]")) s += this.next().v;
    return s;
  }
  typeExpr(): TypeExpr {
    const t = this.next();
    if (t.t !== "id") throw new Error(`type expression: unexpected ${t.v}`);
    const kw = t.v.toUpperCase();
    if (kw === "LIST" || kw === "SET" || kw === "BAG" || kw === "ARRAY") {
      let lo = "0";
      let hi = "?";
      if (this.isSym("[")) {
        this.p++;
        lo = this.bound();
        this.expectSym(":");
        hi = this.bound();
        this.expectSym("]");
      }
      this.expectKw("OF");
      let unique = false;
      if (this.isKw("OPTIONAL")) this.p++; // ARRAY OF OPTIONAL x
      if (this.isKw("UNIQUE")) {
        this.p++;
        unique = true;
      }
      return { k: "agg", agg: kw, lo, hi, unique, of: this.typeExpr() };
    }
    if (SIMPLE.has(kw)) {
      if (this.isSym("(")) this.group(); // STRING(22), BINARY(32)
      if (this.isKw("FIXED")) this.p++;
      return { k: "simple", name: kw as never };
    }
    return { k: "named", name: t.v };
  }
}

export function parseExpress(source: string): Schema {
  const toks = tokenize(stripComments(source));
  const ps = new Parser(toks);
  ps.expectKw("SCHEMA");
  const schemaName = SchemaShape.parse({ name: ps.id() }).name;
  ps.expectSym(";");
  const types = new Map<string, TypeDef>();
  const entities = new Map<string, EntityDef>();
  const skipped = { functions: 0, rules: 0 };

  const skipTo = (end: string) => {
    while (!ps.isKw(end)) ps.next();
    ps.next();
    ps.expectSym(";");
  };

  while (ps.peek() && !ps.isKw("END_SCHEMA")) {
    if (ps.isKw("TYPE")) {
      ps.p++;
      const name = ps.id();
      ps.expectSym("=");
      let body: TypeDef["body"];
      if (ps.isKw("ENUMERATION")) {
        ps.p++;
        ps.expectKw("OF");
        const inner = ps.group();
        body = { k: "enum", values: inner.filter((x) => x.t === "id").map((x) => x.v) };
      } else if (ps.isKw("SELECT")) {
        ps.p++;
        const inner = ps.group();
        body = { k: "select", members: inner.filter((x) => x.t === "id").map((x) => x.v) };
      } else {
        body = { k: "expr", expr: ps.typeExpr() };
      }
      ps.expectSym(";");
      const where: string[] = [];
      let whereText = "";
      if (ps.isKw("WHERE")) {
        ps.p++;
        while (!ps.isKw("END_TYPE")) {
          const t = ps.next();
          whereText += t.v + " ";
          if (t.t === "id" && ps.isSym(":")) where.push(t.v);
        }
      }
      ps.expectKw("END_TYPE");
      ps.expectSym(";");
      types.set(name, { name, body, where, whereText });
    } else if (ps.isKw("ENTITY")) {
      ps.p++;
      const e: EntityDef = {
        name: ps.id(),
        abstract: false,
        supertypeOf: "",
        subtypeOf: [],
        attrs: [],
        redeclared: [],
        derived: [],
        derivedRedeclared: [],
        inverse: [],
      };
      if (ps.isKw("ABSTRACT")) {
        ps.p++;
        e.abstract = true;
      }
      if (ps.isKw("SUPERTYPE")) {
        ps.p++;
        ps.expectKw("OF");
        e.supertypeOf = ps
          .group()
          .map((x) => x.v)
          .join(" ");
      }
      if (ps.isKw("SUBTYPE")) {
        ps.p++;
        ps.expectKw("OF");
        e.subtypeOf = ps
          .group()
          .filter((x) => x.t === "id")
          .map((x) => x.v);
      }
      ps.expectSym(";");
      // explicit attributes
      const stops = ["DERIVE", "INVERSE", "UNIQUE", "WHERE", "END_ENTITY"];
      while (!stops.some((s) => ps.isKw(s))) {
        const names: string[] = [];
        let redeclared = false;
        for (;;) {
          if (ps.isKw("SELF")) {
            // SELF\Base.attr
            ps.p++;
            ps.expectSym("\\");
            ps.id();
            ps.expectSym(".");
            names.push(ps.id());
            redeclared = true;
          } else names.push(ps.id());
          if (ps.isSym(",")) ps.p++;
          else break;
        }
        ps.expectSym(":");
        let optional = false;
        if (ps.isKw("OPTIONAL")) {
          ps.p++;
          optional = true;
        }
        const type = ps.typeExpr();
        ps.expectSym(";");
        for (const n of names) {
          if (redeclared) e.redeclared.push(n);
          else e.attrs.push({ name: n, optional, type });
        }
      }
      // DERIVE / INVERSE: only collect names; skip the right-hand sides
      while (!ps.isKw("END_ENTITY")) {
        if (ps.isKw("DERIVE") || ps.isKw("INVERSE")) {
          const sect = ps.next().v.toUpperCase();
          while (!["DERIVE", "INVERSE", "UNIQUE", "WHERE", "END_ENTITY"].some((s) => ps.isKw(s))) {
            let self = false;
            if (ps.isKw("SELF")) {
              ps.p++;
              ps.expectSym("\\");
              ps.id();
              ps.expectSym(".");
              self = true;
            }
            const n = ps.id();
            // skip to the terminating ';' at paren depth 0
            let d = 0;
            for (;;) {
              const t = ps.next();
              if (t.t === "sym" && t.v === "(") d++;
              else if (t.t === "sym" && t.v === ")") d--;
              else if (t.t === "sym" && t.v === ";" && d === 0) break;
            }
            if (sect === "DERIVE") (self ? e.derivedRedeclared : e.derived).push(n);
            else e.inverse.push(n);
          }
        } else {
          // UNIQUE / WHERE: skip to the next section keyword
          ps.p++;
          while (!["DERIVE", "INVERSE", "UNIQUE", "WHERE", "END_ENTITY"].some((s) => ps.isKw(s))) ps.p++;
        }
      }
      ps.expectKw("END_ENTITY");
      ps.expectSym(";");
      entities.set(e.name, e);
    } else if (ps.isKw("FUNCTION")) {
      skipped.functions++;
      skipTo("END_FUNCTION");
    } else if (ps.isKw("RULE")) {
      skipped.rules++;
      skipTo("END_RULE");
    } else if (ps.isKw("PROCEDURE")) {
      skipTo("END_PROCEDURE");
    } else if (ps.isKw("CONSTANT")) {
      skipTo("END_CONSTANT");
    } else {
      throw new Error(`unexpected token ${ps.peek()?.v} at ${ps.p}`);
    }
  }
  return { name: schemaName, types, entities, skipped };
}
