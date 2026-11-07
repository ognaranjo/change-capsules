import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { parseYaml, parseFrontMatter } from "../lib/yaml.mjs";
import { checkAll, collectFiles, openCapsules, readCapsule } from "../lib/capsules.mjs";
import { init, upsertSection, BEGIN, END } from "../lib/init.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "bin", "change-capsules.mjs");
const tmp = () => mkdtempSync(join(tmpdir(), "change-capsules-"));
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });

// ---------- YAML subset ----------

test("parses mappings, sequences, quoting and scalar types", () => {
  const y = parseYaml(
    [
      "a: plain text",
      'b: "quoted: with colon"',
      "c: 'it''s'",
      "d: 42",
      "e: true",
      "f: ~",
      'g: ["x", y, 3]',
      "h: []",
      "i:",
      "  - one",
      "  - k: v",
      "    n: 2",
      "j:",
      "- top-level dash",
      "k: {}",
      "l: value # comment",
    ].join("\n"),
  );
  assert.deepEqual(y, {
    a: "plain text", b: "quoted: with colon", c: "it's", d: 42, e: true, f: null,
    g: ["x", "y", 3], h: [], i: ["one", { k: "v", n: 2 }], j: ["top-level dash"], k: {}, l: "value",
  });
});

test("block scalars and multi-line plain scalars", () => {
  const y = parseYaml("a: >\n  one\n  two\n\n  three\nb: |\n  x\n  y\nc: |-\n  z\nd: first\n  second\n");
  assert.equal(y.a, "one two\nthree\n");
  assert.equal(y.b, "x\ny\n");
  assert.equal(y.c, "z");
  assert.equal(y.d, "first second");
});

test("refuses constructs other parsers would read differently", () => {
  for (const [src, re] of [
    ["a: x\na: y", /duplicate key/],
    ["a: Fix: thing", /contains ": "/],
    ["a: &anchor x", /not supported/],
    ["a:\n\t- x", /tab/],
    ['a: "unclosed', /same line/],
    ["a: [x, [y]]", /nested flow/],
    ["a: {b: c}", /flow mappings/],
    ["a: x\n  b: y", /contains ": "|unexpected/],
  ]) {
    assert.throws(() => parseYaml(src), re, src);
  }
});

test("CRLF files and a byte-order mark read the same", () => {
  const lf = readFileSync(join(ROOT, "examples/capsules/20261103-1610-retry-on-sync-timeout.md"), "utf8");
  const crlf = "\uFEFF" + lf.replace(/\n/g, "\r\n");
  assert.deepEqual(parseFrontMatter(crlf).data, parseFrontMatter(lf).data);
});

// ---------- check ----------

test("check passes on the examples", () => {
  const results = checkAll(collectFiles([join(ROOT, "examples/capsules")]));
  assert.equal(results.length, 2);
  for (const r of results) assert.deepEqual(r.errors, [], r.file);
  const cli = run(["check", "examples/capsules"], ROOT);
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
});

test("check fails on a broken capsule and names each problem", () => {
  const [r] = checkAll(collectFiles([join(ROOT, "test/fixtures/broken")]));
  const all = r.errors.join("\n");
  for (const needle of ["id:", "date:", '"model"', "outcome:", "commits[0]", "files[0].path", "files[0].status", "tests[0].result", '"reviewer"', "file name"]) {
    assert.ok(all.includes(needle), `expected an error mentioning ${needle}\n${all}`);
  }
  const cli = run(["check", "test/fixtures/broken"], ROOT);
  assert.equal(cli.status, 1);
  assert.match(cli.stdout, /FAIL/);
});

test("the example capsule in the README is valid", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const m = /`\.capsules\/([^`]+)`:\s*\n\s*```markdown\n([\s\S]*?)\n```/.exec(readme);
  assert.ok(m, "README example block not found");
  const dir = tmp();
  writeFileSync(join(dir, m[1]), m[2] + "\n");
  const r = readCapsule(join(dir, m[1]));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test("the template is a valid capsule once named after its id", () => {
  const dir = tmp();
  const src = readFileSync(join(ROOT, "templates/TEMPLATE.md"), "utf8");
  writeFileSync(join(dir, "20260101-0000-short-slug.md"), src);
  const r = readCapsule(join(dir, "20260101-0000-short-slug.md"));
  assert.deepEqual(r.errors, []);
});

test("secrets are refused, duplicates and self-resolves caught", () => {
  const dir = tmp();
  const base = readFileSync(join(ROOT, "examples/capsules/20261105-1415-iis-cert-renewal-check.md"), "utf8");
  writeFileSync(join(dir, "20261105-1415-iis-cert-renewal-check.md"), base + "\nkey: ghp_" + "a".repeat(36) + "\n");
  const [r] = checkAll(collectFiles([dir]));
  assert.ok(r.errors.some((e) => /GitHub token/.test(e)), r.errors.join("\n"));

  const dir2 = tmp();
  const self = base.replace("risks:", "resolves: [20261105-1415-iis-cert-renewal-check]\nrisks:");
  writeFileSync(join(dir2, "20261105-1415-iis-cert-renewal-check.md"), self);
  const [r2] = checkAll(collectFiles([dir2]));
  assert.ok(r2.errors.some((e) => /resolve itself/.test(e)), r2.errors.join("\n"));
});

test("open lists unresolved follow-ups and drops them once resolved", () => {
  const dir = tmp();
  for (const f of readdirSync(join(ROOT, "examples/capsules"))) copyFileSync(join(ROOT, "examples/capsules", f), join(dir, f));
  let open = openCapsules(checkAll(collectFiles([dir])));
  assert.deepEqual(open.map((r) => r.data.id), ["20261103-1610-retry-on-sync-timeout"]);

  const later = readFileSync(join(ROOT, "examples/capsules/20261105-1415-iis-cert-renewal-check.md"), "utf8")
    .replace(/20261105-1415-iis-cert-renewal-check/g, "20261107-1000-sandbox-sync-run")
    .replace('date: "2026-11-05T09:15:00-05:00"', 'date: "2026-11-07T10:00:00Z"')
    .replace("risks:", "resolves: [20261103-1610-retry-on-sync-timeout]\nrisks:");
  writeFileSync(join(dir, "20261107-1000-sandbox-sync-run.md"), later);
  const results = checkAll(collectFiles([dir]));
  for (const r of results) assert.deepEqual(r.errors, [], r.file);
  open = openCapsules(results);
  assert.deepEqual(open, []);
});

// ---------- init ----------

test("init installs, is idempotent and never touches text outside the markers", () => {
  const repo = tmp();
  execFileSync("git", ["init", "-q"], { cwd: repo });
  const userAgents = "# My project\r\n\r\nUse pnpm, not npm.\r\n";
  writeFileSync(join(repo, "AGENTS.md"), userAgents);

  const first = run(["init"], repo);
  assert.equal(first.status, 0, first.stderr);
  const files = ["AGENTS.md", "CLAUDE.md", ".capsules/kit.json", ".capsules/capsule.schema.json", ".capsules/TEMPLATE.md", ".capsules/README.md"];
  const snapshot = () => Object.fromEntries(files.map((f) => [f, readFileSync(join(repo, f), "utf8")]));
  const after1 = snapshot();

  assert.ok(after1["AGENTS.md"].startsWith(userAgents), "user text kept byte for byte, before the section");
  assert.ok(after1["AGENTS.md"].includes("\r\n" + END.slice(0, 10)) || after1["AGENTS.md"].includes(END), "section added");
  assert.ok(!/[^\r]\n/.test(after1["AGENTS.md"]), "CRLF file stays CRLF");
  const manifest = JSON.parse(after1[".capsules/kit.json"]);
  assert.equal(manifest.kit, "change-capsules");
  assert.equal(manifest.format, "change-capsule/v1");
  assert.equal(manifest.formatVersion, 1);
  assert.deepEqual(manifest.agents, ["claude", "codex"]);

  const second = run(["init", "--json"], repo);
  assert.equal(second.status, 0, second.stderr);
  const steps = JSON.parse(second.stdout).steps;
  assert.ok(steps.every((s) => s.action === "unchanged"), JSON.stringify(steps));
  assert.deepEqual(snapshot(), after1, "second run changes nothing");

  // User edits outside the markers, inside the template, and adds a manifest key: all kept.
  const edited = after1["AGENTS.md"] + "\r\n## Later notes\r\nKeep this.\r\n";
  writeFileSync(join(repo, "AGENTS.md"), edited);
  writeFileSync(join(repo, ".capsules/TEMPLATE.md"), "my template\n");
  writeFileSync(join(repo, ".capsules/kit.json"), JSON.stringify({ ...manifest, team: "ops" }, null, 2) + "\n");
  mkdirSync(join(repo, ".capsules"), { recursive: true });
  const capsule = readFileSync(join(ROOT, "examples/capsules/20261103-1610-retry-on-sync-timeout.md"), "utf8");
  writeFileSync(join(repo, ".capsules/20261103-1610-retry-on-sync-timeout.md"), capsule);

  const third = run(["init"], repo);
  assert.equal(third.status, 0, third.stderr);
  assert.equal(readFileSync(join(repo, "AGENTS.md"), "utf8"), edited);
  assert.equal(readFileSync(join(repo, ".capsules/TEMPLATE.md"), "utf8"), "my template\n");
  assert.equal(JSON.parse(readFileSync(join(repo, ".capsules/kit.json"), "utf8")).team, "ops");
  assert.equal(readFileSync(join(repo, ".capsules/20261103-1610-retry-on-sync-timeout.md"), "utf8"), capsule);
  assert.match(third.stdout, /kept\s+\.capsules\/TEMPLATE\.md/);

  const check = run(["check"], repo);
  assert.equal(check.status, 0, check.stdout);
});

test("a changed managed section is replaced; broken markers are refused", () => {
  const old = `intro\n${BEGIN}\nold rules\n${END}\noutro\n`;
  const { text, action } = upsertSection(old, "new rules\n");
  assert.equal(action, "updated");
  assert.equal(text, `intro\n${BEGIN}\nnew rules\n${END}\noutro\n`);
  assert.throws(() => upsertSection(`${BEGIN}\nno end\n`, "x"), /begin\/end pair/);
  assert.throws(() => upsertSection(`${END}\n${BEGIN}\n`, "x"), /begin\/end pair/);
});

test("init --dry-run writes nothing; --agents limits the adapters", () => {
  const repo = tmp();
  const steps = init({ root: repo, agents: ["codex"], dryRun: true });
  assert.deepEqual(readdirSync(repo), []);
  assert.ok(steps.some((s) => s.path === "AGENTS.md"));
  assert.ok(!steps.some((s) => s.path === "CLAUDE.md"));
});
