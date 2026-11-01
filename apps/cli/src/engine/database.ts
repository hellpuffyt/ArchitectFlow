// Database schema analysis (spec section 3, step 6). Extracts entities, fields and
// relationships from the ORM/schema definitions actually present in the source:
// Prisma, SQLAlchemy, Django models, TypeORM, and raw SQL CREATE TABLE. Also
// detects migration tooling. Every entity carries file+line evidence.

import path from "node:path";
import { readTextSafe } from "./discovery.ts";
import { lineAt } from "../util/text.ts";
import { dbName } from "../util/ids.ts";
import type { DiscoveredFile, EntityFact, FieldType, MigrationInfo } from "../types.ts";

export function mapFieldType(raw: string): FieldType {
  const t = raw.toLowerCase();
  if (/uuid|guid/.test(t)) return "uuid";
  if (/bigint|biginteger|int64/.test(t)) return "bigint";
  if (/\b(int|integer|smallint|serial|number)\b/.test(t)) return "integer";
  if (/numeric|decimal|float|double|real|money/.test(t)) return "numeric";
  if (/bool/.test(t)) return "boolean";
  if (/timestamp|datetime/.test(t)) return "timestamp";
  if (/\bdate\b/.test(t)) return "date";
  if (/json/.test(t)) return "json";
  if (/bytea|blob|bytes|binary/.test(t)) return "bytes";
  if (/varchar|char/.test(t)) return "varchar";
  return "text";
}

function ev(path_: string, symbol: string, text: string, idx: number, rel: string) {
  return { path: path_, symbol, lineStart: lineAt(text, idx), relationship: rel };
}

const PRISMA_SCALARS = new Set(["String", "Boolean", "Int", "BigInt", "Float", "Decimal", "DateTime", "Json", "Bytes"]);

function prisma(f: DiscoveredFile, text: string, out: EntityFact[]): void {
  const re = /model\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const name = m[1]!;
    const body = m[2]!;
    const fields: EntityFact["fields"] = [];
    for (const line of body.split(/\r?\n/)) {
      const fm = line.trim().match(/^(\w+)\s+([A-Za-z0-9_]+)(\[\])?(\?)?(.*)$/);
      if (!fm) continue;
      const typeName = fm[2]!;
      const attrs = fm[5] ?? "";
      // Prisma scalar types are capitalised (String/Int/DateTime/...). A type that
      // is NOT a scalar is a relation/enum field with no column of its own; skip it.
      if (!PRISMA_SCALARS.has(typeName)) continue;
      fields.push({
        name: dbName(fm[1]!), type: mapFieldType(typeName),
        primaryKey: /@id\b/.test(attrs), unique: /@unique\b/.test(attrs), nullable: !!fm[4],
        fk: /@relation/.test(attrs) ? (attrs.match(/references:\s*\[(\w+)\]/)?.[1] ?? undefined) : undefined,
      });
    }
    out.push({ name: dbName(name), source: "prisma", fields, evidence: ev(f.rel, `model ${name}`, text, m.index, "Prisma model") });
  }
}

function sqlalchemy(f: DiscoveredFile, text: string, out: EntityFact[]): void {
  // class X(Base): ... __tablename__ = "x" ... columns
  const re = /class\s+(\w+)\s*\(([^)]*)\):([\s\S]*?)(?=\nclass\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const bases = m[2] ?? "";
    const body = m[3] ?? "";
    if (!/Base|DeclarativeBase|db\.Model|Model/.test(bases) && !/__tablename__/.test(body)) continue;
    const tableM = body.match(/__tablename__\s*=\s*["'`](\w+)["'`]/);
    const name = tableM ? tableM[1]! : m[1]!;
    const fields: EntityFact["fields"] = [];
    // name = Column(Type, ...)   or   name: Mapped[...] = mapped_column(Type, ...)
    const reCol = /(\w+)\s*(?::\s*Mapped\[[^\]]*\])?\s*=\s*(?:Column|mapped_column)\s*\(([^\n]*)/g;
    let c: RegExpExecArray | null;
    while ((c = reCol.exec(body))) {
      const fname = c[1]!;
      if (fname.startsWith("__")) continue;
      const args = c[2] ?? "";
      const typeM = args.match(/\b(UUID|BigInteger|Integer|SmallInteger|String|Text|Unicode|Boolean|DateTime|Date|Time|Numeric|Float|JSON|JSONB|LargeBinary|Enum)\b/);
      const fk = args.match(/ForeignKey\s*\(\s*["'`]([^"'`]+)["'`]/);
      fields.push({
        name: dbName(fname), type: mapFieldType(typeM?.[1] ?? "text"),
        primaryKey: /primary_key\s*=\s*True/.test(args), unique: /unique\s*=\s*True/.test(args),
        nullable: !/nullable\s*=\s*False/.test(args), fk: fk?.[1]?.split(".")[0],
      });
    }
    out.push({ name: dbName(name), source: "sqlalchemy", fields, evidence: ev(f.rel, `class ${m[1]}`, text, m.index, "SQLAlchemy model") });
  }
}

function django(f: DiscoveredFile, text: string, out: EntityFact[]): void {
  const re = /class\s+(\w+)\s*\(([^)]*models\.Model[^)]*)\):([\s\S]*?)(?=\nclass\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const name = m[1]!;
    const body = m[3] ?? "";
    const fields: EntityFact["fields"] = [];
    const reF = /(\w+)\s*=\s*models\.(\w+)\s*\(([^\n]*)/g;
    let c: RegExpExecArray | null;
    while ((c = reF.exec(body))) {
      const args = c[3] ?? "";
      fields.push({
        name: dbName(c[1]!), type: mapFieldType(c[2]!),
        primaryKey: /primary_key\s*=\s*True/.test(args), unique: /unique\s*=\s*True/.test(args),
        nullable: /null\s*=\s*True/.test(args), fk: /ForeignKey|OneToOne/.test(c[2]!) ? args.match(/["'`](\w+)["'`]/)?.[1] : undefined,
      });
    }
    out.push({ name: dbName(name), source: "django", fields, evidence: ev(f.rel, `class ${name}`, text, m.index, "Django model") });
  }
}

function typeorm(f: DiscoveredFile, text: string, out: EntityFact[]): void {
  const re = /@Entity\s*\([^)]*\)\s*(?:export\s+)?class\s+(\w+)([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const name = m[1]!;
    const body = m[2] ?? "";
    const fields: EntityFact["fields"] = [];
    const reC = /@(PrimaryGeneratedColumn|PrimaryColumn|Column|CreateDateColumn|UpdateDateColumn)\s*\(([^)]*)\)\s*(\w+)\s*[:!?]\s*(\w+)/g;
    let c: RegExpExecArray | null;
    while ((c = reC.exec(body))) {
      fields.push({ name: dbName(c[3]!), type: mapFieldType(c[2] || c[4] || "text"), primaryKey: /Primary/.test(c[1]!), unique: /unique\s*:\s*true/.test(c[2] ?? ""), nullable: /nullable\s*:\s*true/.test(c[2] ?? "") });
    }
    out.push({ name: dbName(name), source: "typeorm", fields, evidence: ev(f.rel, `@Entity ${name}`, text, m.index, "TypeORM entity") });
  }
}

function rawSql(f: DiscoveredFile, text: string, out: EntityFact[]): void {
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)["'`]?\s*\(([\s\S]*?)\)\s*;/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const name = m[1]!;
    const body = m[2] ?? "";
    const fields: EntityFact["fields"] = [];
    for (const line of body.split(",\n")) {
      const fm = line.trim().match(/^["'`]?(\w+)["'`]?\s+([A-Za-z]+)/);
      if (!fm || /^(PRIMARY|FOREIGN|CONSTRAINT|UNIQUE|CHECK|INDEX|KEY)\b/i.test(fm[1]!)) continue;
      fields.push({ name: dbName(fm[1]!), type: mapFieldType(fm[2]!), primaryKey: /PRIMARY\s+KEY/i.test(line), unique: /UNIQUE/i.test(line), nullable: !/NOT\s+NULL/i.test(line) });
    }
    out.push({ name: dbName(name), source: "sql", fields, evidence: ev(f.rel, `CREATE TABLE ${name}`, text, m.index, "SQL table") });
  }
}

export function extractEntities(root: string, files: DiscoveredFile[]): EntityFact[] {
  const out: EntityFact[] = [];
  for (const f of files) {
    const base = path.basename(f.rel);
    if (base === "schema.prisma" || f.ext === ".prisma") { prisma(f, readTextSafe(f.abs), out); continue; }
    if (f.ext === ".py") {
      const text = readTextSafe(f.abs);
      if (!text) continue;
      if (/models\.Model/.test(text)) django(f, text, out);
      if (/Column\s*\(|mapped_column\s*\(/.test(text)) sqlalchemy(f, text, out);
      continue;
    }
    if (f.ext === ".ts" || f.ext === ".js") {
      const text = readTextSafe(f.abs);
      if (/@Entity\s*\(/.test(text)) typeorm(f, text, out);
      continue;
    }
    if (f.ext === ".sql") rawSql(f, readTextSafe(f.abs), out);
  }
  // Deduplicate by entity name, keeping the first (richest source order above).
  const byName = new Map<string, EntityFact>();
  for (const e of out) if (!byName.has(e.name) || (byName.get(e.name)!.fields.length < e.fields.length)) byName.set(e.name, e);
  return [...byName.values()].filter((e) => e.fields.length > 0);
}

export function detectMigrations(root: string, files: DiscoveredFile[]): MigrationInfo[] {
  const groups: { tool: MigrationInfo["tool"]; test: (rel: string) => boolean }[] = [
    { tool: "alembic", test: (r) => /(^|\/)migrations\/versions\/.+\.py$/.test(r) },
    { tool: "prisma", test: (r) => /(^|\/)prisma\/migrations\/.+\/migration\.sql$/.test(r) },
    { tool: "django", test: (r) => /(^|\/)migrations\/\d{4}_.+\.py$/.test(r) },
    { tool: "knex", test: (r) => /(^|\/)migrations\/.+\.(js|ts)$/.test(r) && !/node_modules/.test(r) },
  ];
  const out: MigrationInfo[] = [];
  for (const g of groups) {
    const matched = files.filter((f) => g.test(f.rel));
    if (matched.length) {
      const dir = path.dirname(matched[0]!.rel);
      out.push({ tool: g.tool, dir, count: matched.length, evidence: { path: dir, relationship: `${matched.length} ${g.tool} migration(s)` } });
    }
  }
  return out;
}
