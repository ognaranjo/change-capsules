import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { parseYaml, parseFrontMatter } from "../lib/yaml.mjs";
import { checkAll, collectFiles, openCapsules, readCapsule } from "../lib/capsules.mjs";
import { init, upsertSection, BEGIN, END, toLf } from "../lib/init.mjs";

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
  // Normalize first: a Windows checkout with core.autocrlf=true already has CRLF.
  const lf = toLf(readFileSync(join(ROOT, "examples/capsules/20261103-1610-retry-on-sync-timeout.md"), "utf8"));
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
  const readme = toLf(readFileSync(join(ROOT, "README.md"), "utf8"));
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

// ---------- 0.1.2: line endings ----------

test("a CRLF rules text does not double carriage returns and a second upsert is unchanged", () => {
  const crlfSection = "## Rules\r\n\r\nLine one.\r\n";
  const first = upsertSection("# Notes\r\n", crlfSection);
  assert.ok(!first.text.includes("\r\r"), JSON.stringify(first.text));
  assert.equal(upsertSection(first.text, crlfSection).action, "unchanged");
  assert.equal(upsertSection(first.text, "## Rules\n\nLine one.\n").action, "unchanged");
});

test("init is unchanged when the installed files were checked out with CRLF", () => {
  const repo = tmp();
  init({ root: repo });
  const files = ["AGENTS.md", "CLAUDE.md", ".capsules/kit.json", ".capsules/capsule.schema.json", ".capsules/TEMPLATE.md", ".capsules/README.md"];
  for (const f of files) {
    const p = join(repo, f);
    writeFileSync(p, toLf(readFileSync(p, "utf8")).replace(/\n/g, "\r\n"));
  }
  const before = files.map((f) => readFileSync(join(repo, f), "utf8"));
  const steps = init({ root: repo });
  assert.ok(steps.every((s) => s.action === "unchanged"), JSON.stringify(steps));
  assert.deepEqual(files.map((f) => readFileSync(join(repo, f), "utf8")), before);
});

// ---------- 0.1.2: resolves must be credible ----------

function capsule(id, { date, outcome = "completed", resolves = [], follow_ups = [], evidence = [], files = [{ path: "src/a.js", status: "modified" }] }) {
  return [
    "---",
    "format: change-capsule/v1",
    `id: ${id}`,
    `date: "${date}"`,
    `title: Capsule ${id}`,
    "agent:",
    "  client: codex",
    "  model: unknown",
    `outcome: ${outcome}`,
    "why: Test fixture.",
    "changes:",
    "  files:",
    ...files.flatMap((f) => [`    - path: ${f.path}`, `      status: ${f.status}`, ...(f.from ? [`      from: ${f.from}`] : [])]),
    "tests:",
    "  - name: Unit tests",
    "    result: passed",
    `evidence: [${evidence.map((e) => JSON.stringify(e)).join(", ")}]`,
    `risks: ["fixture"]`,
    `follow_ups: [${follow_ups.map((e) => JSON.stringify(e)).join(", ")}]`,
    `resolves: [${resolves.join(", ")}]`,
    "---",
    "",
  ].join("\n");
}

test("a failed or earlier capsule does not close what it names in resolves", () => {
  const dir = tmp();
  const target = "20261110-1000-partial-work";
  writeFileSync(join(dir, `${target}.md`), capsule(target, { date: "2026-11-10T10:00:00Z", outcome: "partial", follow_ups: ["finish it"] }));
  writeFileSync(join(dir, "20261110-0900-earlier.md"), capsule("20261110-0900-earlier", { date: "2026-11-10T09:00:00Z", resolves: [target] }));
  writeFileSync(join(dir, "20261110-1100-failed-try.md"), capsule("20261110-1100-failed-try", { date: "2026-11-10T11:00:00Z", outcome: "failed", resolves: [target] }));

  const results = checkAll(collectFiles([dir]));
  const warn = (id) => results.find((r) => r.data.id === id).warnings.join("\n");
  assert.match(warn("20261110-0900-earlier"), /dated before .* stays open/);
  assert.match(warn("20261110-1100-failed-try"), /outcome failed, so 20261110-1000-partial-work stays open/);
  const open = openCapsules(results);
  const t = open.find((r) => r.data.id === target);
  assert.ok(t, "target stays open");
  assert.equal(t.ignoredResolutions.length, 2);
  assert.equal(run(["check", "--strict", dir], ROOT).status, 1, "--strict turns the warning into a failure");
  assert.match(run(["open", dir], ROOT).stdout, /not resolved by 20261110-1100-failed-try: .*outcome failed/);

  writeFileSync(join(dir, "20261110-1200-done.md"), capsule("20261110-1200-done", { date: "2026-11-10T12:00:00Z", resolves: [target] }));
  assert.ok(!openCapsules(checkAll(collectFiles([dir]))).some((r) => r.data.id === target), "a later, non-failed capsule closes it");
});

test("checking one capsule still sees the others in its folder for resolves", () => {
  const dir = tmp();
  writeFileSync(join(dir, "20261110-1000-a.md"), capsule("20261110-1000-a", { date: "2026-11-10T10:00:00Z", outcome: "partial", follow_ups: ["x"] }));
  writeFileSync(join(dir, "20261110-1100-b.md"), capsule("20261110-1100-b", { date: "2026-11-10T11:00:00Z", resolves: ["20261110-1000-a"] }));
  const out = run(["check", "--strict", "--json", join(dir, "20261110-1100-b.md")], ROOT);
  assert.equal(out.status, 0, out.stdout);
  assert.equal(JSON.parse(out.stdout).capsules.length, 1);
});

// ---------- 0.1.2: --evidence and --staged ----------

function gitRepo() {
  const repo = tmp();
  const g = (...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: repo, encoding: "utf8" });
  g("init", "-q");
  mkdirSync(join(repo, "src"));
  mkdirSync(join(repo, ".capsules"));
  writeFileSync(join(repo, "src/a.js"), "export const a = 1;\n");
  writeFileSync(join(repo, "src/old.js"), "export const old = 1;\n");
  writeFileSync(join(repo, ".gitignore"), "tmp-logs/\n");
  g("add", "-A");
  g("commit", "-qm", "base");
  return { repo, g };
}

test("check --evidence finds missing and Git-ignored evidence; https links are skipped", () => {
  const { repo } = gitRepo();
  mkdirSync(join(repo, "logs"));
  mkdirSync(join(repo, "tmp-logs"));
  writeFileSync(join(repo, "logs/test.txt"), "ok\n");
  writeFileSync(join(repo, "tmp-logs/run.txt"), "ok\n");
  const id = "20261110-1000-evidence";
  writeFileSync(join(repo, ".capsules", `${id}.md`), capsule(id, {
    date: "2026-11-10T10:00:00Z",
    evidence: ["logs/test.txt", "tmp-logs/run.txt", "logs/missing.txt", "https://ci.example.com/run/1"],
  }));
  const out = run(["check", "--evidence", "--json", `.capsules/${id}.md`], repo);
  const c = JSON.parse(out.stdout).capsules[0];
  assert.equal(out.status, 1);
  assert.deepEqual(c.errors, ["evidence logs/missing.txt not found in the repository"]);
  assert.ok(c.warnings.some((w) => /tmp-logs\/run\.txt is ignored by Git/.test(w)), c.warnings.join("\n"));
  const plain = run(["check", `.capsules/${id}.md`], repo);
  assert.equal(plain.status, 0, "without --evidence nothing is looked up");
});

test("check --staged lists files missing from or extra in the capsule, and passes when they match", () => {
  const { repo, g } = gitRepo();
  writeFileSync(join(repo, "src/a.js"), "export const a = 2;\n");
  writeFileSync(join(repo, "src/b.js"), "export const b = 1;\n");
  g("mv", "src/old.js", "src/new.js");
  const id = "20261110-1000-staged";
  const path = join(repo, ".capsules", `${id}.md`);
  writeFileSync(path, capsule(id, {
    date: "2026-11-10T10:00:00Z",
    files: [{ path: "src/a.js", status: "modified" }, { path: "src/c.js", status: "added" }, { path: `.capsules/${id}.md`, status: "added" }],
  }));
  g("add", "-A");
  let out = run(["check", "--staged", "--json", `.capsules/${id}.md`], repo);
  let c = JSON.parse(out.stdout).capsules[0];
  assert.equal(out.status, 1);
  assert.deepEqual(c.errors.sort(), [
    "in changes.files but not staged: src/c.js",
    "staged but not in changes.files: src/b.js (added)",
    "staged but not in changes.files: src/new.js (renamed)",
  ]);

  writeFileSync(path, capsule(id, {
    date: "2026-11-10T10:00:00Z",
    files: [
      { path: "src/a.js", status: "modified" },
      { path: "src/b.js", status: "added" },
      { path: "src/new.js", status: "renamed", from: "src/old.js" },
      { path: `.capsules/${id}.md`, status: "added" },
    ],
  }));
  g("add", "-A");
  out = run(["check", "--staged", "--strict", `.capsules/${id}.md`], repo);
  assert.equal(out.status, 0, out.stdout);
});

// ---------- 0.1.3: kit files named on the command line, and the README's CI step ----------

test("check skips kit files named on the command line but still checks capsules", () => {
  const repo = tmp();
  init({ root: repo });
  const id = "20261110-1000-real";
  writeFileSync(join(repo, ".capsules", `${id}.md`), capsule(id, { date: "2026-11-10T10:00:00Z" }));
  const kitFiles = [".capsules/kit.json", ".capsules/capsule.schema.json", ".capsules/README.md", ".capsules/TEMPLATE.md"];
  const only = run(["check", "--json", ...kitFiles], repo);
  assert.equal(only.status, 0, only.stdout);
  const j = JSON.parse(only.stdout);
  assert.equal(j.capsules.length, 0);
  assert.equal(j.skipped.length, 4);
  const mixed = run(["check", ...kitFiles, `.capsules/${id}.md`], repo);
  assert.equal(mixed.status, 0, mixed.stdout);
  assert.match(mixed.stdout, /skip \.capsules\/kit\.json \(not a capsule\)/);
  assert.match(mixed.stdout, /ok {3}\.capsules\/20261110-1000-real\.md/);
  writeFileSync(join(repo, ".capsules", "notes.md"), "no front matter\n");
  assert.equal(run(["check", ".capsules/notes.md"], repo).status, 1, "a misnamed .md is still checked");
});

test("the README's CI evidence step passes on the kit-install PR and checks new capsules", (t) => {
  if (spawnSync("bash", ["-c", "true"]).status !== 0) return t.skip("bash not available");
  const readme = toLf(readFileSync(join(ROOT, "README.md"), "utf8"));
  const block = /- name: New capsules have their evidence in the repository\n\s+run: \|\n((?:\s{10}.*\n)+)/.exec(readme);
  assert.ok(block, "CI step not found in README");
  const script = block[1]
    .split("\n").map((l) => l.trim()).join("\n")
    .replace(/"origin\/\$\{\{ github\.base_ref \}\}\.\.\.HEAD"/, '"main...HEAD"')
    .replace(/npx -y change-capsules/g, `"${process.execPath}" "${CLI}"`);

  const repo = tmp();
  const g = (...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: repo, encoding: "utf8" });
  g("init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.js"), "a\n");
  g("add", "-A");
  g("commit", "-qm", "base");
  g("checkout", "-q", "-b", "install");
  init({ root: repo });
  g("add", "-A");
  g("commit", "-qm", "kit");
  const ci = () => spawnSync("bash", ["-eo", "pipefail", "-c", script], { cwd: repo, encoding: "utf8" });
  let r = ci();
  assert.equal(r.status, 0, `install PR: ${r.stdout}${r.stderr}`);

  const id = "20261110-1000-with-evidence";
  writeFileSync(join(repo, ".capsules", `${id}.md`), capsule(id, { date: "2026-11-10T10:00:00Z", evidence: ["logs/missing.txt"] }));
  g("add", "-A");
  g("commit", "-qm", "capsule");
  r = ci();
  assert.equal(r.status, 1, "a new capsule with missing evidence fails the step");
  assert.match(r.stdout, /evidence logs\/missing\.txt not found/);
});
