// A minimal JSON Schema validator for the keywords capsule.schema.json uses. Zero dependencies.
// Unknown keywords throw, so the schema can never silently rely on something this file ignores.

const ANNOTATIONS = new Set(["$schema", "$id", "title", "description"]);
const SUPPORTED = new Set([
  "type", "const", "enum", "required", "properties", "additionalProperties",
  "items", "minItems", "uniqueItems", "minLength", "maxLength", "pattern", "minimum",
]);

export function assertSupported(schema, path = "#") {
  for (const k of Object.keys(schema)) {
    if (!ANNOTATIONS.has(k) && !SUPPORTED.has(k)) throw new Error(`schema keyword "${k}" at ${path} is not supported by this validator`);
  }
  if (schema.properties) for (const [k, s] of Object.entries(schema.properties)) assertSupported(s, `${path}/properties/${k}`);
  if (schema.items) assertSupported(schema.items, `${path}/items`);
}

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function typeMatches(expected, v) {
  const t = typeOf(v);
  if (expected === "number") return t === "number" || t === "integer";
  return expected === t;
}

const show = (v) => (typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v) ?? String(v));
const join = (path, key) => (typeof key === "number" ? `${path}[${key}]` : path ? `${path}.${key}` : key);

export function validate(schema, value, path = "") {
  const errors = [];
  const fail = (message) => errors.push({ path: path || "(front matter)", message });

  if (schema.type && !typeMatches(schema.type, value)) {
    let hint = "";
    if (schema.type === "string" && typeOf(value) === "object" && Object.keys(value).length === 1) {
      hint = ' (a value containing ": " reads as a key; put it in quotes)';
    } else if (schema.type === "string" && (typeOf(value) === "integer" || typeOf(value) === "number")) {
      hint = " (put it in quotes)";
    }
    fail(`expected ${schema.type}, got ${typeOf(value)}${hint}`);
    return errors;
  }
  if ("const" in schema && value !== schema.const) fail(`must be ${show(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) fail(`must be one of ${schema.enum.join(", ")}; got ${show(value)}`);

  if (typeOf(value) === "object") {
    for (const key of schema.required ?? []) if (!(key in value)) fail(`missing required field "${key}"`);
    const props = schema.properties ?? {};
    for (const [key, v] of Object.entries(value)) {
      if (props[key]) errors.push(...validate(props[key], v, join(path, key)));
      else if (schema.additionalProperties === false) {
        const known = Object.keys(props);
        fail(`unknown field "${key}"${known.length ? `; allowed: ${known.join(", ")}` : ""}`);
      }
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(`needs at least ${schema.minItems} item(s)`);
    if (schema.uniqueItems) {
      const seen = new Set();
      value.forEach((item, i) => {
        const k = JSON.stringify(item);
        if (seen.has(k)) errors.push({ path: join(path, i), message: `duplicate item ${show(item)}` });
        seen.add(k);
      });
    }
    if (schema.items) value.forEach((item, i) => errors.push(...validate(schema.items, item, join(path, i))));
  }
  if (typeof value === "string") {
    const len = [...value].length;
    if (schema.minLength !== undefined && value.trim().length === 0 && schema.minLength > 0) fail("must not be empty");
    else if (schema.minLength !== undefined && len < schema.minLength) fail(`must be at least ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && len > schema.maxLength) fail(`must be at most ${schema.maxLength} characters (has ${len})`);
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) fail(`${show(value)} does not match the expected form${patternHint(path)}`);
  }
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) fail(`must be at least ${schema.minimum}`);
  return errors;
}

function patternHint(path) {
  if (/^id$|resolves\[/.test(path)) return " YYYYMMDD-HHMM-short-slug (lowercase letters, digits, dashes)";
  if (path === "date") return ' ISO 8601 with time zone, e.g. "2026-11-07T14:32:00Z"';
  if (/commits\[/.test(path)) return " (a lowercase hex commit SHA, quoted)";
  if (/agent\.client/.test(path)) return " (lowercase, e.g. claude-code or codex)";
  if (/\.(path|from)$/.test(path)) return " (a repository-relative path, no leading / or drive letter, no ..)";
  if (/operations\[\d+\]\.target$/.test(path)) return " <environment>:<service>[:<database>], e.g. staging:web-farm";
  if (/evidence\[/.test(path)) return " (a repository-relative path or an https URL)";
  return "";
}
