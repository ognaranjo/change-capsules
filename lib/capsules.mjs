import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from "node:fs";
import { basename, join, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
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

export class UsageError extends Error {}

const isCapsuleName = (name) => name.endsWith(".md") && !NON_CAPSULE_FILES.has(name) && !name.startsWith("_");
const capsulesIn = (dir) => readdirSync(dir).sort().filter(isCapsuleName).map((name) => join(dir, name));

/**
 * Resolve check targets. Returns { files, context }: `files` are reported on; `context` also
 * includes the other capsules in the same folders, so `resolves` can be checked when a single
 * capsule is named on the command line.
 */
export function collectTargets(targets) {
  const files = [];
  const dirs = new Set();
  for (const t of targets) {
    if (!existsSync(t)) throw new UsageError(`not found: ${t}`);
    if (statSync(t).isDirectory()) {
      files.push(...capsulesIn(t));
      dirs.add(resolve(t));
    } else {
      files.push(t);
      dirs.add(resolve(dirname(t)));
    }
  }
  const seen = new Set(files.map((f) => resolve(f)));
  const context = [...files];
  for (const d of dirs) for (const f of capsulesIn(d)) if (!seen.has(resolve(f))) {
    seen.add(resolve(f));
    context.push(f);
  }
  return { files, context };
}

/** Back-compatible helper: every capsule file in the given folders or file paths. */
export function collectFiles(targets) {
  return collectTargets(targets).files;
}

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

/**
 * Why `resolver` cannot close `target`, or null when it can. A failed task finishes nothing,
 * and a capsule cannot finish work that was recorded after it.
 */
export function resolutionProblem(resolver, target) {
  if (resolver.data?.outcome === "failed") return `${resolver.data.id} has outcome failed`;
  const a = Date.parse(resolver.data?.date);
  const b = Date.parse(target.data?.date);
  if (!Number.isNaN(a) && !Number.isNaN(b) && a < b) {
    return `${resolver.data.id} (${resolver.data.date}) is dated before ${target.data.id} (${target.data.date})`;
  }
  return null;
}

const idOf = (r) => (r.data && typeof r.data.id === "string" ? r.data.id : null);
const refsOf = (r) => (Array.isArray(r.data?.resolves) ? r.data.resolves.filter((x) => typeof x === "string") : []);

/** Validate many capsules, including cross-capsule rules (unique ids, resolves). */
export function checkAll(files) {
  const results = files.map(readCapsule);
  const byId = new Map();
  for (const r of results) {
    const id = idOf(r);
    if (!id) continue;
    if (byId.has(id)) r.errors.push(`duplicate id ${id} (also in ${byId.get(id).file})`);
    else byId.set(id, r);
  }
  for (const r of results) {
    for (const ref of refsOf(r)) {
      if (ref === idOf(r)) {
        r.errors.push("a capsule cannot resolve itself");
        continue;
      }
      const target = byId.get(ref);
      if (!target) {
        r.warnings.push(`resolves ${ref}, which is not among the checked capsules`);
        continue;
      }
      const problem = resolutionProblem(r, target);
      if (problem) r.warnings.push(`resolves ${ref}, but ${problem}, so ${ref} stays open`);
    }
  }
  return results;
}

/**
 * Capsules that still need attention: not completed, or with follow-ups that no valid later
 * capsule resolves. Each returned result carries `ignoredResolutions` ([{ by, reason }]) for
 * claims that did not count.
 */
export function openCapsules(results) {
  const byId = new Map();
  for (const r of results) if (idOf(r) && !byId.has(idOf(r))) byId.set(idOf(r), r);
  const closedBy = new Map();
  const ignored = new Map();
  for (const r of results) {
    for (const ref of refsOf(r)) {
      const target = byId.get(ref);
      if (!target || ref === idOf(r)) continue;
      const problem = resolutionProblem(r, target);
      if (problem) {
        if (!ignored.has(ref)) ignored.set(ref, []);
        ignored.get(ref).push({ by: idOf(r), reason: problem });
      } else {
        closedBy.set(ref, idOf(r));
      }
    }
  }
  return results
    .filter((r) => idOf(r) && !closedBy.has(idOf(r)))
    .filter((r) => r.data.outcome !== "completed" || (Array.isArray(r.data.follow_ups) && r.data.follow_ups.length > 0))
    .map((r) => Object.assign(r, { ignoredResolutions: ignored.get(idOf(r)) ?? [] }))
    .sort((a, b) => idOf(a).localeCompare(idOf(b)));
}

// ---------- optional checks against the working copy and Git ----------

const toPosix = (p) => p.split("\\").join("/");

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
}

/** The Git work tree containing `dir`, or null. */
export function gitRoot(dir) {
  try {
    return realpathSync(git(["rev-parse", "--show-toplevel"], dir).trim());
  } catch {
    return null;
  }
}

/** Repository root for a capsule: its Git work tree, else the folder above the capsules folder. */
export function repoRootFor(file) {
  return gitRoot(dirname(resolve(file))) ?? realpathSync(dirname(dirname(resolve(file))));
}

/** Repository-relative, forward-slash path of a file. */
export function repoPath(root, file) {
  return toPosix(relative(root, realpathSync(resolve(file))));
}

/** --evidence: every local evidence path exists; warn when Git ignores it (only this machine has it). */
export function checkEvidence(result, root) {
  const inGit = gitRoot(root) !== null;
  for (const item of Array.isArray(result.data?.evidence) ? result.data.evidence : []) {
    if (typeof item !== "string" || /^https:\/\//.test(item)) continue;
    if (!existsSync(join(root, item))) {
      result.errors.push(`evidence ${item} not found in the repository`);
      continue;
    }
    if (inGit) {
      try {
        git(["check-ignore", "-q", "--", item], root);
        result.warnings.push(`evidence ${item} is ignored by Git, so only this machine has it`);
      } catch {
        // exit 1: not ignored
      }
    }
  }
}

const STAGED_STATUS = { A: "added", M: "modified", D: "deleted", R: "renamed", C: "copied", T: "modified" };

/** Files staged in the index: Map(path → { status, from? }). */
export function stagedChanges(root) {
  const out = git(["-c", "core.quotepath=false", "diff", "--cached", "--name-status", "-z", "--find-renames"], root);
  const parts = out.split("\0");
  const staged = new Map();
  for (let i = 0; i < parts.length && parts[i]; ) {
    const code = parts[i++];
    const letter = code[0];
    if (letter === "R" || letter === "C") {
      const from = parts[i++];
      const path = parts[i++];
      staged.set(path, { status: STAGED_STATUS[letter], from });
    } else {
      const path = parts[i++];
      staged.set(path, { status: STAGED_STATUS[letter] ?? `unknown (${code})` });
    }
  }
  return staged;
}

/** --staged: changes.files must list exactly the staged files, with matching statuses. */
export function checkStaged(result, staged) {
  const listed = new Map();
  for (const f of Array.isArray(result.data?.changes?.files) ? result.data.changes.files : []) {
    if (f && typeof f.path === "string") listed.set(toPosix(f.path), f);
  }
  const missing = [...staged.keys()].filter((p) => !listed.has(p)).sort();
  const extra = [...listed.keys()].filter((p) => !staged.has(p)).sort();
  for (const p of missing) result.errors.push(`staged but not in changes.files: ${p} (${staged.get(p).status})`);
  for (const p of extra) result.errors.push(`in changes.files but not staged: ${p}`);
  for (const [p, f] of listed) {
    const s = staged.get(p);
    if (s && f.status !== s.status) result.warnings.push(`${p} is listed as ${f.status} but staged as ${s.status}`);
    if (s && s.from && f.from && toPosix(f.from) !== s.from) result.warnings.push(`${p} is listed as from ${f.from} but Git sees ${s.from}`);
  }
}
