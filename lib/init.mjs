import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { KIT_ROOT } from "./capsules.mjs";

export const KIT_NAME = "change-capsules";
export const KIT_VERSION = JSON.parse(readFileSync(join(KIT_ROOT, "package.json"), "utf8")).version;
export const FORMAT = "change-capsule/v1";
export const FORMAT_VERSION = 1;
export const CAPSULES_DIR = ".capsules";

export const BEGIN = "<!-- change-capsules:begin (managed by `change-capsules init`; edit outside these markers) -->";
export const END = "<!-- change-capsules:end -->";
const BEGIN_RE = /<!-- change-capsules:begin\b[^>]*-->/g;
const END_RE = /<!-- change-capsules:end\b[^>]*-->/g;

const ADAPTERS = {
  codex: { file: "AGENTS.md" },
  claude: { file: "CLAUDE.md" },
};

// Kit files may arrive with CRLF (a Windows checkout with core.autocrlf=true). Everything the kit
// writes is built from LF text, and files are compared without regard to line endings.
export const toLf = (s) => s.replace(/\r\n?/g, "\n");
const eolOf = (s) => (s && s.includes("\r\n") ? "\r\n" : "\n");
const withEol = (lfText, eol) => (eol === "\n" ? lfText : lfText.replace(/\n/g, eol));
const sameText = (a, b) => toLf(a) === toLf(b);

const kitFile = (...parts) => toLf(readFileSync(join(KIT_ROOT, ...parts), "utf8"));
const template = (name) => kitFile("templates", name);

export class InitError extends Error {}

/**
 * Insert or replace the managed section in `existing` (null when the file does not exist).
 * Text outside the markers is never changed. Returns { text, action }.
 */
export function upsertSection(existing, section) {
  const eol = eolOf(existing);
  const block = withEol([BEGIN, toLf(section).trimEnd(), END].join("\n"), eol);
  if (existing === null) return { text: block + eol, action: "created" };
  const begins = [...existing.matchAll(BEGIN_RE)];
  const ends = [...existing.matchAll(END_RE)];
  if (begins.length === 0 && ends.length === 0) {
    let sep = "";
    if (existing.length > 0) sep = existing.endsWith(eol + eol) ? "" : existing.endsWith(eol) ? eol : eol + eol;
    return { text: existing + sep + block + eol, action: "updated" };
  }
  if (begins.length !== 1 || ends.length !== 1 || ends[0].index < begins[0].index) {
    throw new InitError("found change-capsules markers that do not form one begin/end pair; fix them by hand and run init again");
  }
  const start = begins[0].index;
  const stop = ends[0].index + ends[0][0].length;
  const current = existing.slice(start, stop);
  if (sameText(current, block)) return { text: existing, action: "unchanged" };
  return { text: existing.slice(0, start) + block + existing.slice(stop), action: "updated" };
}

/** Plan and (unless dryRun) apply the install. Returns a list of { path, action, note? }. */
export function init({ root, agents = ["codex", "claude"], dryRun = false, refresh = false }) {
  if (!existsSync(root)) throw new InitError(`folder not found: ${root}`);
  for (const a of agents) if (!ADAPTERS[a]) throw new InitError(`unknown agent "${a}"; use codex, claude or both`);
  const steps = [];
  const writes = [];
  const plan = (rel, text, action, note) => {
    steps.push({ path: rel, action, ...(note ? { note } : {}) });
    if (action === "created" || action === "updated") writes.push([join(root, rel), text]);
  };
  const read = (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : null);

  // 1. Manifest: kit-owned keys are set, any other keys are kept.
  const manifestRel = `${CAPSULES_DIR}/kit.json`;
  const manifestText = read(manifestRel);
  let manifest = {};
  if (manifestText !== null) {
    try {
      manifest = JSON.parse(manifestText.replace(/^﻿/, ""));
    } catch {
      throw new InitError(`${manifestRel} is not valid JSON; fix or remove it and run init again`);
    }
    if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
      throw new InitError(`${manifestRel} must be a JSON object`);
    }
  }
  const installed = new Set([...(Array.isArray(manifest.agents) ? manifest.agents : []), ...agents]);
  const nextManifest = {
    ...manifest,
    kit: KIT_NAME,
    kitVersion: KIT_VERSION,
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    capsules: CAPSULES_DIR,
    schema: `${CAPSULES_DIR}/capsule.schema.json`,
    agents: [...installed].sort(),
  };
  const nextManifestText = JSON.stringify(nextManifest, null, 2) + "\n";
  if (manifestText === null) plan(manifestRel, nextManifestText, "created");
  else if (sameText(manifestText.replace(/^\uFEFF/, ""), nextManifestText)) plan(manifestRel, manifestText, "unchanged");
  else plan(manifestRel, withEol(nextManifestText, eolOf(manifestText)), "updated");

  // 2. Schema: kit-owned, kept identical to the kit's schema.
  const schemaRel = `${CAPSULES_DIR}/capsule.schema.json`;
  const schemaText = kitFile("schema", "capsule.schema.json");
  const currentSchema = read(schemaRel);
  if (currentSchema === null) plan(schemaRel, schemaText, "created");
  else if (sameText(currentSchema, schemaText)) plan(schemaRel, currentSchema, "unchanged");
  else plan(schemaRel, withEol(schemaText, eolOf(currentSchema)), "updated");

  // 3. Template and folder README: created once, then yours (replaced only with --refresh).
  for (const [rel, src] of [[`${CAPSULES_DIR}/TEMPLATE.md`, "TEMPLATE.md"], [`${CAPSULES_DIR}/README.md`, "capsules-README.md"]]) {
    const want = template(src);
    const have = read(rel);
    if (have === null) plan(rel, want, "created");
    else if (sameText(have, want)) plan(rel, have, "unchanged");
    else if (refresh) plan(rel, withEol(want, eolOf(have)), "updated");
    else plan(rel, want, "kept", "differs from the kit's version; --refresh replaces it");
  }

  // 4. Agent rules, between markers only.
  const rules = template("rules.md");
  for (const a of agents) {
    const rel = ADAPTERS[a].file;
    const { text, action } = upsertSection(read(rel), rules);
    plan(rel, text, action);
  }

  if (!dryRun) {
    mkdirSync(join(root, CAPSULES_DIR), { recursive: true });
    for (const [abs, text] of writes) writeFileSync(abs, text);
  }
  return steps;
}
