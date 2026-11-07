// A small, strict YAML subset parser for capsule front matter. Zero dependencies.
//
// Supported: block mappings, block sequences (of scalars or mappings), plain and quoted
// scalars, single-line flow sequences of scalars ([a, "b"]), empty flow mapping ({}),
// literal (|) and folded (>) block scalars with - / + chomping, comments, multi-line
// plain scalars. Plain scalars resolve like YAML 1.2 core (null, booleans, numbers).
//
// Anything else (anchors, aliases, tags, multi-line quoted or flow values, nested flow
// collections, tabs in indentation, duplicate keys) is refused with a line number, so a
// capsule that passes here reads the same in any full YAML parser.

export class YamlError extends Error {
  constructor(message, line) {
    super(line ? `line ${line}: ${message}` : message);
    this.line = line;
  }
}

const KEY_PLAIN = /^([A-Za-z0-9_][A-Za-z0-9_.\-]*)[ \t]*:(?:[ \t]+(.*))?$/;
const KEY_QUOTED = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')[ \t]*:(?:[ \t]+(.*))?$/;

export function parseYaml(src, lineOffset = 0) {
  const lines = src.replace(/\r\n?/g, "\n").split("\n").map((raw, i) => ({ raw, no: i + 1 + lineOffset }));
  let pos = 0;

  const isBlank = (l) => /^[ \t]*(#.*)?$/.test(l.raw);
  const indentOf = (l) => {
    const lead = /^[ \t]*/.exec(l.raw)[0];
    if (lead.includes("\t")) throw new YamlError("tab used for indentation; use spaces", l.no);
    return lead.length;
  };
  const skipBlank = () => {
    while (pos < lines.length && isBlank(lines[pos])) pos++;
  };
  const isSeqContent = (c) => c === "-" || c.startsWith("- ");

  function parseNode(indent) {
    skipBlank();
    if (pos >= lines.length) return null;
    const l = lines[pos];
    const i = indentOf(l);
    if (i < indent) return null;
    const content = l.raw.slice(i);
    return isSeqContent(content) ? parseSeq(i) : parseMap(i);
  }

  function parseKey(content, l) {
    let m = KEY_PLAIN.exec(content);
    if (m) return { key: m[1], rest: m[2] ?? "" };
    m = KEY_QUOTED.exec(content);
    if (m) return { key: parseQuoted(m[1], l), rest: m[2] ?? "" };
    return null;
  }

  function parseMap(indent, first) {
    const out = {};
    const add = (key, value, l) => {
      if (Object.prototype.hasOwnProperty.call(out, key)) throw new YamlError(`duplicate key "${key}"`, l.no);
      out[key] = value;
    };
    if (first) {
      const kv = parseKey(first.content, first.line);
      add(kv.key, parseValue(kv.rest, first.line, indent, true), first.line);
    }
    for (;;) {
      skipBlank();
      if (pos >= lines.length) break;
      const l = lines[pos];
      const i = indentOf(l);
      if (i < indent) break;
      if (i > indent) throw new YamlError("unexpected indentation", l.no);
      const content = l.raw.slice(i);
      if (isSeqContent(content)) {
        if (first) break; // a sibling item of the sequence this mapping sits in
        throw new YamlError('unexpected "- " item here; check the indentation', l.no);
      }
      const kv = parseKey(content, l);
      if (!kv) throw new YamlError(`expected "key: value", got "${content.trim()}"`, l.no);
      pos++;
      add(kv.key, parseValue(kv.rest, l, indent, true), l);
    }
    return out;
  }

  function parseSeq(indent) {
    const out = [];
    for (;;) {
      skipBlank();
      if (pos >= lines.length) break;
      const l = lines[pos];
      const i = indentOf(l);
      if (i < indent) break;
      if (i > indent) throw new YamlError("unexpected indentation", l.no);
      const content = l.raw.slice(i);
      if (!isSeqContent(content)) break;
      pos++;
      const after = content.slice(1);
      const inner = after.replace(/^ +/, "");
      const innerCol = i + 1 + (after.length - inner.length);
      if (inner === "" || inner.startsWith("#")) {
        skipBlank();
        const next = lines[pos];
        out.push(next && indentOf(next) > indent ? parseNode(indentOf(next)) : null);
      } else if (isSeqContent(inner)) {
        throw new YamlError("nested sequence on one line (- - x) is not supported", l.no);
      } else if (parseKey(inner, l)) {
        out.push(parseMap(innerCol, { content: inner, line: l }));
      } else {
        out.push(parseValue(inner, l, i, false));
      }
    }
    return out;
  }

  // rest: text after "key:" or "- ". parentIndent: indentation of the key or dash.
  function parseValue(rest, l, parentIndent, isMapValue) {
    const text = rest.replace(/^[ \t]+/, "");
    if (text === "" || text.startsWith("#")) {
      skipBlank();
      if (pos >= lines.length) return null;
      const next = lines[pos];
      const ni = indentOf(next);
      if (ni > parentIndent) return parseNode(ni);
      if (isMapValue && ni === parentIndent && isSeqContent(next.raw.slice(ni))) return parseSeq(ni);
      return null;
    }
    const c = text[0];
    if (c === "|" || c === ">") return parseBlockScalar(text, l, parentIndent);
    if (c === '"' || c === "'") {
      const end = quotedEnd(text, l);
      const tail = text.slice(end).trim();
      if (tail !== "" && !tail.startsWith("#")) throw new YamlError("unexpected text after quoted value", l.no);
      return parseQuoted(text.slice(0, end), l);
    }
    if (c === "[") return parseFlowSeq(text, l);
    if (c === "{") {
      if (/^\{\s*\}\s*(#.*)?$/.test(text)) return {};
      throw new YamlError("flow mappings ({...}) are not supported; use an indented block", l.no);
    }
    if (text.startsWith("- ")) throw new YamlError('a "- " item must start on its own line', l.no);
    if ("&*!%@`".includes(c)) throw new YamlError(`"${c}" (anchor, alias, tag or reserved) is not supported`, l.no);
    return parsePlain(text, l, parentIndent);
  }

  function parsePlain(text, l, parentIndent) {
    let first = stripComment(text).trimEnd();
    checkPlain(first, l);
    const parts = [first];
    // Continuation lines: more indented than the parent, until a less-indented line.
    let pendingBreaks = 0;
    while (pos < lines.length) {
      const nl = lines[pos];
      if (/^[ \t]*$/.test(nl.raw)) {
        pendingBreaks++;
        pos++;
        continue;
      }
      const ni = indentOf(nl);
      if (ni <= parentIndent) break;
      const t = nl.raw.slice(ni);
      if (t.startsWith("#")) break;
      const piece = stripComment(t).trimEnd();
      checkPlain(piece, nl);
      parts.push(pendingBreaks ? "\n".repeat(pendingBreaks) : " ", piece);
      pendingBreaks = 0;
      pos++;
    }
    if (pendingBreaks) {
      // Blank lines after the scalar belong to nobody; step back so the caller sees them.
      pos -= pendingBreaks;
    }
    if (parts.length === 1) return resolvePlain(first);
    return parts.join("");
  }

  function checkPlain(s, l) {
    if (/:( |$)/.test(s)) throw new YamlError(`plain value contains ": "; put the value in quotes`, l.no);
  }

  function parseBlockScalar(header, l, parentIndent) {
    const m = /^([|>])([+-]?)[ \t]*(#.*)?$/.exec(header);
    if (!m) throw new YamlError(`unsupported block scalar header "${header}"`, l.no);
    const [, style, chomp] = m;
    const body = [];
    let blockIndent = -1;
    while (pos < lines.length) {
      const nl = lines[pos];
      if (/^[ \t]*$/.test(nl.raw)) {
        body.push("");
        pos++;
        continue;
      }
      const ni = indentOf(nl);
      if (ni <= parentIndent) break;
      if (blockIndent < 0) blockIndent = ni;
      if (ni < blockIndent) throw new YamlError("block text is less indented than its first line", nl.no);
      body.push(nl.raw.slice(blockIndent));
      pos++;
    }
    // Trailing blank lines: keep for "+", otherwise they are not content.
    let trailing = 0;
    while (body.length && body[body.length - 1] === "") {
      body.pop();
      trailing++;
    }
    let text;
    if (style === "|") {
      text = body.join("\n");
    } else {
      text = "";
      for (let i = 0; i < body.length; i++) {
        const line = body[i];
        if (i === 0) {
          text = line;
          continue;
        }
        const prev = body[i - 1];
        const moreIndented = /^\s/.test(line) || /^\s/.test(prev);
        if (line === "") text += "\n";
        else if (prev === "" || moreIndented) text += (prev === "" ? "" : "\n") + line;
        else text += " " + line;
      }
    }
    if (body.length === 0) return chomp === "+" ? "\n".repeat(trailing) : "";
    if (chomp === "-") return text;
    if (chomp === "+") return text + "\n" + "\n".repeat(trailing);
    return text + "\n";
  }

  function parseFlowSeq(text, l) {
    const out = [];
    let i = 1;
    const n = text.length;
    const skipWs = () => {
      while (i < n && (text[i] === " " || text[i] === "\t")) i++;
    };
    skipWs();
    if (text[i] === "]") {
      i++;
    } else {
      for (;;) {
        skipWs();
        if (i >= n) throw new YamlError('flow sequence must close with "]" on the same line', l.no);
        const c = text[i];
        if (c === "[" || c === "{") throw new YamlError("nested flow collections are not supported", l.no);
        if (c === '"' || c === "'") {
          const end = i + quotedEnd(text.slice(i), l);
          out.push(parseQuoted(text.slice(i, end), l));
          i = end;
        } else {
          let j = i;
          while (j < n && text[j] !== "," && text[j] !== "]") j++;
          const raw = text.slice(i, j).trim();
          if (raw === "") throw new YamlError("empty item in flow sequence", l.no);
          if ("&*!%@`#".includes(raw[0])) throw new YamlError(`unsupported item "${raw}" in flow sequence`, l.no);
          if (/:( |$)/.test(raw)) throw new YamlError("flow sequence item contains \": \"; quote it", l.no);
          out.push(resolvePlain(raw));
          i = j;
        }
        skipWs();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "]") {
          i++;
          break;
        }
        throw new YamlError('expected "," or "]" in flow sequence', l.no);
      }
    }
    const tail = text.slice(i).trim();
    if (tail !== "" && !tail.startsWith("#")) throw new YamlError("unexpected text after flow sequence", l.no);
    return out;
  }

  const result = parseNode(0);
  skipBlank();
  if (pos < lines.length) throw new YamlError("unexpected content; check the indentation", lines[pos].no);
  return result;
}

function stripComment(s) {
  const m = /[ \t]#/.exec(s);
  return m ? s.slice(0, m.index) : s;
}

function quotedEnd(text, l) {
  const q = text[0];
  for (let i = 1; i < text.length; i++) {
    if (q === '"' && text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === q) {
      if (q === "'" && text[i + 1] === "'") {
        i++;
        continue;
      }
      return i + 1;
    }
  }
  throw new YamlError("quoted value must close on the same line", l.no);
}

const ESCAPES = { '"': '"', "\\": "\\", "/": "/", n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", "0": "\0", " ": " " };

function parseQuoted(token, l) {
  const q = token[0];
  const inner = token.slice(1, -1);
  if (q === "'") return inner.replace(/''/g, "'");
  let out = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const e = inner[++i];
    if (e === "u" || e === "x" || e === "U") {
      const len = e === "x" ? 2 : e === "u" ? 4 : 8;
      const hex = inner.slice(i + 1, i + 1 + len);
      if (!new RegExp(`^[0-9A-Fa-f]{${len}}$`).test(hex)) throw new YamlError(`bad \\${e} escape`, l?.no);
      out += String.fromCodePoint(parseInt(hex, 16));
      i += len;
    } else if (e in ESCAPES) {
      out += ESCAPES[e];
    } else {
      throw new YamlError(`unknown escape "\\${e}" in double-quoted value`, l?.no);
    }
  }
  return out;
}

// YAML 1.2 core schema resolution for plain scalars.
export function resolvePlain(s) {
  if (s === "" || s === "~" || /^(null|Null|NULL)$/.test(s)) return null;
  if (/^(true|True|TRUE)$/.test(s)) return true;
  if (/^(false|False|FALSE)$/.test(s)) return false;
  if (/^[-+]?[0-9]+$/.test(s)) return Number(s);
  if (/^0o[0-7]+$/.test(s)) return parseInt(s.slice(2), 8);
  if (/^0x[0-9a-fA-F]+$/.test(s)) return parseInt(s.slice(2), 16);
  if (/^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/.test(s)) return Number(s);
  if (/^[-+]?\.(inf|Inf|INF)$/.test(s)) return s.startsWith("-") ? -Infinity : Infinity;
  if (/^\.(nan|NaN|NAN)$/.test(s)) return NaN;
  return s;
}

// Split "---\n<yaml>\n---\n<body>" into its parts.
export function splitFrontMatter(text) {
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = src.split("\n");
  if (lines[0].trimEnd() !== "---") throw new YamlError('file must start with a "---" front matter line', 1);
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trimEnd();
    if (t === "---" || t === "...") {
      return { yaml: lines.slice(1, i).join("\n"), body: lines.slice(i + 1).join("\n"), yamlFirstLine: 2 };
    }
  }
  throw new YamlError('front matter is not closed with a "---" line', 1);
}

export function parseFrontMatter(text) {
  const { yaml, body, yamlFirstLine } = splitFrontMatter(text);
  const data = parseYaml(yaml, yamlFirstLine - 1);
  return { data, body };
}
