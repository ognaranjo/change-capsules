import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontMatter } from "./yaml.mjs";
import { validate, assertSupported } from "./schema.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const KIT_ROOT = join(here, "..");
export const SCHEMA = JSON.parse(readFileSync(join(KIT_ROOT, "schema", "capsule.schema.json"), "utf8"));
assertSupported(SCHEMA);

// Files in the capsules folder that are not capsules.
export const NON_CAPSULE_FILES = new Set(["README.md", "TEMPLATE.md"]);

const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key id"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, "a GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{30,}\b/, "a GitHub token"],
  [/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}\b/, "an API secret key"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, "a Slack token"],
  [/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@/, "a connection string with a password"],
];
const LOCAL_PATH = /(?:^|[\s"'(`])(?:\/Users\/[^\s/]+|\/home\/[^\s/]+|[A-Za-z]:\\Users\\[^\s\\]+)/;

/** Find capsule files: explicit .md files, or every .md file in the given folders. */
export function collectFiles(targets) {
  const files = [];
  for (const t of targets) {
    if (!existsSync(t)) throw new UsageError(`not found: ${t}`);
    if (statSync(t).isDirectory()) {
      for (const name of readdirSync(t).sort()) {
        if (!name.endsWith(".md") || NON_CAPSULE_FILES.has(name) || name.startsWith("_")) continue;
        files.push(join(t, name));
      }
    } else {
      files.push(t);
    }
  }
  return files;
}

export class UsageError extends Error {}

/** Read and validate one capsule file. Returns { file, data, body, errors, warnings }. */
export function readCapsule(file) {
  const result = { file, data: null, body: "", errors: [], warnings: [] };
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    result.errors.push(`cannot read file: ${e.code ?? e.message}`);
    return result;
  }
  try {
    const parsed = parseFrontMatter(text);
    result.data = parsed.data;
    result.body = parsed.body;
  } catch (e) {
    result.errors.push(`front matter: ${e.message}`);
  }
  for (const [re, what] of SECRET_PATTERNS) {
    if (re.test(text)) result.errors.push(`looks like it contains ${what}; remove it (capsules are committed)`);
  }
  if (LOCAL_PATH.test(text)) result.warnings.push("contains a machine-local path (/Users/…, /home/…, C:\\Users\\…); use repository-relative paths");
  if (!result.data) return result;

  for (const e of validate(SCHEMA, result.data)) result.errors.push(`${e.path}: ${e.message}`);
  const d = result.data;
  if (d === null || typeof d !== "object" || Array.isArray(d)) return result;

  if (typeof d.id === "string" && basename(file) !== `${d.id}.md`) {
    result.errors.push(`file name must be ${d.id}.md (the capsule id)`);
  }
  if (typeof d.id === "string" && typeof d.date === "string") {
    const t = Date.parse(d.date);
    if (!Number.isNaN(t)) {
      const utc = new Date(t).toISOString();
      const stamp = utc.slice(0, 10).replace(/-/g, "");
      if (!d.id.startsWith(stamp)) result.warnings.push(`id starts with ${d.id.slice(0, 8)} but date is ${stamp} in UTC`);
    }
  }
  if ((d.outcome === "partial" || d.outcome === "failed") && !(d.follow_ups?.length || d.risks?.length)) {
    result.warnings.push(`outcome is ${d.outcome}: say what is left in follow_ups or what went wrong in risks`);
  }
  if (Array.isArray(d.tests) && d.tests.length === 0 && !d.risks?.length) {
    result.warnings.push("no tests recorded and no risks: say in risks why nothing was tested");
  }
  if (Array.isArray(d.changes?.files) && d.changes.files.length === 0 && !d.operations?.length) {
    result.warnings.push("no files changed and no operations: is this capsule needed?");
  }
  if (Array.isArray(d.changes?.files)) {
    d.changes.files.forEach((f, i) => {
      if (f && (f.status === "renamed" || f.status === "copied") && !f.from) {
        result.warnings.push(`changes.files[${i}]: ${f.status} file without "from"`);
      }
    });
  }
  return result;
}

/** Validate many capsules, including cross-capsule rules (unique ids, resolves). */
export function checkAll(files) {
  const results = files.map(readCapsule);
  const byId = new Map();
  for (const r of results) {
    const id = r.data?.id;
    if (typeof id !== "string") continue;
    if (byId.has(id)) r.errors.push(`duplicate id ${id} (also in ${byId.get(id).file})`);
    else byId.set(id, r);
  }
  for (const r of results) {
    for (const ref of Array.isArray(r.data?.resolves) ? r.data.resolves : []) {
      if (typeof ref === "string" && !byId.has(ref)) r.warnings.push(`resolves ${ref}, which is not among the checked capsules`);
      if (ref === r.data?.id) r.errors.push("a capsule cannot resolve itself");
    }
  }
  return results;
}

/** Capsules that still need attention: not completed, or with follow-ups no later capsule resolves. */
export function openCapsules(results) {
  const resolved = new Set();
  for (const r of results) for (const ref of Array.isArray(r.data?.resolves) ? r.data.resolves : []) resolved.add(ref);
  return results
    .filter((r) => r.data && typeof r.data.id === "string")
    .filter((r) => !resolved.has(r.data.id))
    .filter((r) => r.data.outcome !== "completed" || (Array.isArray(r.data.follow_ups) && r.data.follow_ups.length > 0))
    .sort((a, b) => String(a.data.id).localeCompare(String(b.data.id)));
}
