#!/usr/bin/env node
// change-capsules: install capsule rules into a repository and check capsule files.
// Local only: no network, no account, no telemetry.
import { resolve, relative, join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { init, InitError, KIT_VERSION, CAPSULES_DIR } from "../lib/init.mjs";
import {
  collectTargets, checkAll, openCapsules, UsageError,
  repoRootFor, repoPath, gitRoot, checkEvidence, stagedChanges, checkStaged,
} from "../lib/capsules.mjs";

const HELP = `change-capsules ${KIT_VERSION}: one change capsule per finished agent task, kept in your repo.

Usage:
  change-capsules init  [--dir <repo>] [--agents codex,claude] [--dry-run] [--refresh]
      Add .capsules/ (manifest, schema, template) and the agent rules to AGENTS.md
      and CLAUDE.md, between change-capsules markers. Safe to run again: text outside
      the markers and your existing capsules are never changed.

  change-capsules check [paths...] [--evidence] [--staged] [--strict] [--json]
      Validate capsules (default: .capsules/ in the current folder). Exit 1 on errors;
      with --strict, warnings fail too. Optional checks for a task's closeout:
        --evidence  local evidence paths in the capsule exist (warns if Git ignores them)
        --staged    the capsule's changes.files matches the files staged in Git;
                    applies to the capsules that are themselves staged
      Typical closeout: git add the work, its evidence and the capsule, then
        change-capsules check --evidence --staged .capsules/<id>.md

  change-capsules open  [paths...] [--json]
      List capsules that still need attention: outcome not completed, or follow-ups
      that no later capsule resolves. A failed capsule, or one dated before the
      capsule it names, does not resolve it.

  change-capsules --version | --help
`;

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir" || a === "--agents") {
      if (argv[i + 1] === undefined) throw new UsageError(`${a} needs a value`);
      opts[a.slice(2)] = argv[++i];
    } else if (a.startsWith("--dir=") || a.startsWith("--agents=")) {
      const [k, v] = a.slice(2).split(/=(.*)/s);
      opts[k] = v;
    } else if (["--dry-run", "--refresh", "--strict", "--json", "--evidence", "--staged", "--help", "-h", "--version", "-v"].includes(a)) {
      opts[a.replace(/^-+/, "")] = true;
    } else if (a.startsWith("-")) {
      throw new UsageError(`unknown option ${a}`);
    } else {
      opts._.push(a);
    }
  }
  return opts;
}

const rel = (p) => relative(process.cwd(), p) || p;

function cmdInit(opts) {
  const root = resolve(opts.dir ?? ".");
  const agents = (opts.agents ?? "codex,claude")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => (s === "both" ? ["codex", "claude"] : [s]))
    .flat();
  const steps = init({ root, agents: [...new Set(agents)], dryRun: !!opts["dry-run"], refresh: !!opts.refresh });
  if (opts.json) {
    console.log(JSON.stringify({ root, dryRun: !!opts["dry-run"], steps }, null, 2));
    return 0;
  }
  const changed = steps.some((s) => s.action === "created" || s.action === "updated");
  const verb = opts["dry-run"] ? "Would install" : changed ? "Installed" : "Already up to date:";
  console.log(`${verb} change-capsules ${KIT_VERSION} in ${root}`);
  for (const s of steps) console.log(`  ${s.action.padEnd(9)} ${s.path}${s.note ? `  (${s.note})` : ""}`);
  if (!opts["dry-run"] && changed) {
    console.log(`\nNext: commit these files. Your agent will now write a capsule in ${CAPSULES_DIR}/ after each task.`);
  }
  return 0;
}

function defaultTargets(opts) {
  if (opts._.length) return opts._;
  const dir = join(process.cwd(), CAPSULES_DIR);
  if (!existsSync(dir)) throw new UsageError(`no ${CAPSULES_DIR}/ folder here; run "change-capsules init" or pass paths`);
  return [dir];
}

function selected(opts) {
  const { files, context, skipped } = collectTargets(defaultTargets(opts));
  const wanted = new Set(files.map((f) => resolve(f)));
  const all = checkAll(context);
  return { all, skipped, results: all.filter((r) => wanted.has(resolve(r.file))) };
}

function cmdCheck(opts) {
  const { results, skipped } = selected(opts);
  const general = { errors: [], warnings: [] };

  if (opts.evidence) {
    for (const r of results) if (r.data) checkEvidence(r, repoRootFor(r.file));
  }
  if (opts.staged) {
    const stagedByRoot = new Map();
    let compared = 0;
    for (const r of results) {
      const root = gitRoot(dirname(resolve(r.file)));
      if (!root) {
        r.errors.push("--staged needs the capsule to be in a Git repository");
        continue;
      }
      if (!stagedByRoot.has(root)) stagedByRoot.set(root, stagedChanges(root));
      const staged = stagedByRoot.get(root);
      if (!staged.has(repoPath(root, r.file))) continue;
      compared++;
      if (r.data) checkStaged(r, staged);
    }
    if (compared === 0) general.errors.push("--staged: no capsule is staged; git add the work, its evidence and the capsule first");
    if (compared > 1) general.warnings.push(`--staged: ${compared} capsules are staged; one task, one capsule per commit`);
  }

  const errors = results.reduce((n, r) => n + r.errors.length, general.errors.length);
  const warnings = results.reduce((n, r) => n + r.warnings.length, general.warnings.length);
  const failed = errors > 0 || (opts.strict && warnings > 0);
  if (opts.json) {
    console.log(JSON.stringify({
      ok: !failed,
      errors: general.errors,
      warnings: general.warnings,
      skipped: skipped.map(rel),
      capsules: results.map((r) => ({ file: rel(r.file), id: r.data?.id ?? null, errors: r.errors, warnings: r.warnings })),
    }, null, 2));
    return failed ? 1 : 0;
  }
  for (const r of results) {
    const mark = r.errors.length ? "FAIL" : r.warnings.length ? "warn" : "ok  ";
    console.log(`${mark} ${rel(r.file)}`);
    for (const e of r.errors) console.log(`     error: ${e}`);
    for (const w of r.warnings) console.log(`     warning: ${w}`);
  }
  for (const f of skipped) console.log(`skip ${rel(f)} (not a capsule)`);
  for (const e of general.errors) console.log(`error: ${e}`);
  for (const w of general.warnings) console.log(`warning: ${w}`);
  console.log(`\n${results.length} capsule(s), ${errors} error(s), ${warnings} warning(s)`);
  return failed ? 1 : 0;
}

function cmdOpen(opts) {
  const { all } = selected(opts);
  const open = openCapsules(all);
  const unreadable = all.filter((r) => !r.data || typeof r.data.id !== "string");
  if (opts.json) {
    console.log(JSON.stringify({
      open: open.map((r) => ({
        id: r.data.id, file: rel(r.file), title: r.data.title ?? null, outcome: r.data.outcome ?? null,
        follow_ups: r.data.follow_ups ?? [], risks: r.data.risks ?? [],
        ignored_resolutions: r.ignoredResolutions,
      })),
      unreadable: unreadable.map((r) => ({ file: rel(r.file), errors: r.errors })),
    }, null, 2));
    return 0;
  }
  if (!open.length) console.log("No open capsules.");
  for (const r of open) {
    console.log(`${r.data.id}  [${r.data.outcome}]  ${r.data.title ?? ""}`);
    console.log(`  ${rel(r.file)}`);
    for (const f of r.data.follow_ups ?? []) console.log(`  - follow-up: ${f}`);
    for (const x of r.ignoredResolutions) console.log(`  ! not resolved by ${x.by}: ${x.reason}`);
  }
  for (const r of unreadable) console.log(`(could not read ${rel(r.file)}: run check)`);
  return 0;
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(HELP);
    return cmd ? 0 : 2;
  }
  if (cmd === "--version" || cmd === "-v") {
    console.log(KIT_VERSION);
    return 0;
  }
  const opts = parseArgs(rest);
  if (opts.help || opts.h) {
    console.log(HELP);
    return 0;
  }
  if (cmd === "init") return cmdInit(opts);
  if (cmd === "check") return cmdCheck(opts);
  if (cmd === "open") return cmdOpen(opts);
  throw new UsageError(`unknown command "${cmd}"`);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  if (e instanceof UsageError || e instanceof InitError) {
    console.error(`change-capsules: ${e.message}`);
    process.exitCode = 2;
  } else {
    throw e;
  }
}
