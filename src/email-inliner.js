// Email-safe HTML post-processor.
//
// Walks a rendered htmd document and produces a self-contained HTML string
// suitable for pasting into Gmail / Outlook / Apple Mail compose windows:
//
//   1. Parse <style> blocks into rules.
//   2. Resolve :root CSS custom properties (light mode only).
//   3. Inline matching rules onto each element as a style="…" attribute.
//   4. Strip <script>, <link>, <style> tags entirely.
//   5. Drop any remaining var(--…) references with their resolved literal.
//
// Hand-rolled to keep htmd's dependency tree minimal (see PHASE3_NOTES.md
// §v0.10.0-alpha for the juice / linkedom tradeoff). Supports the selector
// subset htmd templates actually use: tag / class / id / multi-class, with
// descendant and child combinators, comma lists, and a handful of pseudo-
// classes (:first-child, :last-child, :nth-child(N), :first-of-type,
// :last-of-type). Pseudo-elements, sibling combinators, and @-rules are
// dropped silently.
//
// Not a general-purpose HTML5 parser; trusts htmd's html`` output shape.

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);
const RAW_TEXT = new Set(['script', 'style']);

const STRIP_TAGS = new Set(['script', 'style', 'link']);

// Tags where inlining styles is wasteful (head elements don't render).
const SKIP_INLINE = new Set(['html', 'head', 'meta', 'title', 'base']);

// CSS properties that almost never survive an email client; emit them
// anyway (they're harmless if ignored). We don't strip — clients vary
// and the rendered HTML stays a closer match to the web version when we
// trust the client to ignore what it can't handle.

export function inlineEmailCss(htmlText) {
  const root = parseHtml(htmlText);
  const styleBlocks = collectStyleText(root);
  const rules = parseCss(styleBlocks);
  const vars = collectRootVars(rules);
  const usable = rules
    .map((r, idx) => expandSelectors(r, idx))
    .flat()
    .filter(Boolean);

  walkElements(root, (el) => {
    if (STRIP_TAGS.has(el.name)) {
      el._skip = true;
      return;
    }
    // Inline SVG attributes (fill, stroke, etc.) sometimes carry var(--…)
    // expressions; resolve those against the same token map.
    for (const an of el.attrsOrder) {
      const v = el.attrs[an];
      if (typeof v === 'string' && v.includes('var(')) {
        el.attrs[an] = resolveVarChain(v, vars);
      }
    }
    if (SKIP_INLINE.has(el.name)) return;
    const matched = [];
    for (const r of usable) {
      if (matchSelectorChain(r.tokens, el)) {
        matched.push(r);
      }
    }
    if (!matched.length) return;
    matched.sort((a, b) => (a.specificity - b.specificity) || (a.order - b.order));
    const props = {};
    for (const r of matched) {
      for (const { prop, value } of r.declarations) {
        if (prop.startsWith('--')) continue;
        props[prop] = value;
      }
    }
    if (!Object.keys(props).length) return;
    const styleParts = [];
    for (const [prop, value] of Object.entries(props)) {
      const resolved = resolveVarChain(value, vars);
      styleParts.push(`${prop}: ${normalizeValue(resolved)}`);
    }
    const existing = el.attrs.style ? el.attrs.style.replace(/;\s*$/, '') + '; ' : '';
    const combined = existing + styleParts.join('; ');
    setAttr(el, 'style', combined);
  });

  return serializeHtml(root);
}

function normalizeValue(v) {
  return String(v).replace(/\s+/g, ' ').trim();
}

// ---------- CSS ----------

function parseCss(text) {
  if (!text) return [];
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) break;
    if (text[i] === '@') {
      // skip the whole at-rule
      let p = i;
      while (p < text.length && text[p] !== '{' && text[p] !== ';') p++;
      if (p >= text.length) break;
      if (text[p] === ';') { i = p + 1; continue; }
      let depth = 1;
      let q = p + 1;
      while (q < text.length && depth > 0) {
        if (text[q] === '{') depth++;
        else if (text[q] === '}') depth--;
        if (depth === 0) break;
        q++;
      }
      i = q + 1;
      continue;
    }
    const braceAt = text.indexOf('{', i);
    if (braceAt === -1) break;
    const selectorText = text.slice(i, braceAt).trim();
    let depth = 1;
    let q = braceAt + 1;
    while (q < text.length && depth > 0) {
      if (text[q] === '{') depth++;
      else if (text[q] === '}') depth--;
      if (depth === 0) break;
      q++;
    }
    const declText = text.slice(braceAt + 1, q);
    const selectors = selectorText.split(',').map((s) => s.trim()).filter(Boolean);
    const declarations = parseDeclarations(declText);
    rules.push({ selectors, declarations });
    i = q + 1;
  }
  return rules;
}

function parseDeclarations(text) {
  const decls = [];
  const parts = [];
  let buf = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    if (c === ';' && depth === 0) {
      parts.push(buf);
      buf = '';
    } else {
      buf += c;
    }
  }
  if (buf.trim()) parts.push(buf);
  for (const p of parts) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    const prop = trimmed.slice(0, colon).trim();
    let value = trimmed.slice(colon + 1).trim();
    if (!prop) continue;
    // drop !important marker; inline styles trump anyway
    value = value.replace(/!\s*important\s*$/i, '').trim();
    decls.push({ prop, value });
  }
  return decls;
}

function collectRootVars(rules) {
  const raw = {};
  for (const r of rules) {
    if (!r.selectors.includes(':root')) continue;
    for (const { prop, value } of r.declarations) {
      if (prop.startsWith('--')) raw[prop] = value;
    }
  }
  // resolve nested var() chains within the var map itself
  const resolved = {};
  for (const k of Object.keys(raw)) {
    resolved[k] = resolveVarChain(raw[k], raw, new Set());
  }
  return resolved;
}

function resolveVarChain(value, vars, seen) {
  if (!value || value.indexOf('var(') === -1) return value;
  let out = '';
  let i = 0;
  while (i < value.length) {
    if (value.startsWith('var(', i)) {
      let depth = 1;
      let j = i + 4;
      while (j < value.length && depth > 0) {
        const c = value[j];
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) break; }
        j++;
      }
      const inner = value.slice(i + 4, j);
      const split = splitTopComma(inner);
      const name = (split[0] || '').trim();
      const fallback = split.slice(1).join(',').trim();
      const localSeen = seen ? new Set(seen) : new Set();
      let replacement;
      if (vars[name] !== undefined && !localSeen.has(name)) {
        localSeen.add(name);
        replacement = resolveVarChain(vars[name], vars, localSeen);
      } else if (fallback) {
        replacement = resolveVarChain(fallback, vars, localSeen);
      } else {
        replacement = 'initial';
      }
      out += replacement;
      i = j + 1;
    } else {
      out += value[i];
      i++;
    }
  }
  return out;
}

function splitTopComma(s) {
  const out = [];
  let buf = '';
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    if (c === ',' && depth === 0) { out.push(buf); buf = ''; }
    else buf += c;
  }
  out.push(buf);
  return out;
}

// ---------- Selectors ----------

function expandSelectors(rule, order) {
  const out = [];
  for (const sel of rule.selectors) {
    const tokens = parseSelector(sel);
    if (!tokens) continue;
    out.push({
      selector: sel,
      tokens,
      declarations: rule.declarations,
      specificity: specificity(tokens),
      order
    });
  }
  return out;
}

function specificity(tokens) {
  let ids = 0, classes = 0, tags = 0;
  for (const { compound } of tokens) {
    if (compound.id) ids++;
    classes += compound.classes.length;
    if (compound.attrs) classes += compound.attrs.length;
    if (compound.pseudos) classes += compound.pseudos.length;
    if (compound.tag && compound.tag !== '*') tags++;
  }
  return ids * 10000 + classes * 100 + tags;
}

const SUPPORTED_PSEUDOS = new Set([
  'first-child', 'last-child', 'nth-child',
  'first-of-type', 'last-of-type', 'nth-of-type',
  'only-child', 'only-of-type'
]);

function parseSelector(sel) {
  const tokens = [];
  let i = 0;
  while (i < sel.length) {
    while (i < sel.length && /\s/.test(sel[i])) i++;
    if (i >= sel.length) break;
    let combinator = ' ';
    if (sel[i] === '>') { combinator = '>'; i++; }
    else if (sel[i] === '+' || sel[i] === '~') return null;
    while (i < sel.length && /\s/.test(sel[i])) i++;
    if (tokens.length === 0) combinator = '';
    const compound = { tag: null, id: null, classes: [], pseudos: [], attrs: [] };
    let hasPart = false;
    if (/[a-zA-Z]/.test(sel[i])) {
      let s = '';
      while (i < sel.length && /[a-zA-Z0-9_-]/.test(sel[i])) { s += sel[i]; i++; }
      compound.tag = s.toLowerCase();
      hasPart = true;
    } else if (sel[i] === '*') {
      compound.tag = '*';
      i++;
      hasPart = true;
    }
    while (i < sel.length && (sel[i] === '.' || sel[i] === '#' || sel[i] === ':' || sel[i] === '[')) {
      if (sel[i] === '.') {
        i++;
        let s = '';
        while (i < sel.length && /[a-zA-Z0-9_-]/.test(sel[i])) { s += sel[i]; i++; }
        if (!s) return null;
        compound.classes.push(s);
        hasPart = true;
      } else if (sel[i] === '#') {
        i++;
        let s = '';
        while (i < sel.length && /[a-zA-Z0-9_-]/.test(sel[i])) { s += sel[i]; i++; }
        if (!s) return null;
        compound.id = s;
        hasPart = true;
      } else if (sel[i] === ':') {
        i++;
        if (sel[i] === ':') return null; // pseudo-element
        let s = '';
        while (i < sel.length && /[a-zA-Z0-9_-]/.test(sel[i])) { s += sel[i]; i++; }
        let arg = null;
        if (sel[i] === '(') {
          i++;
          arg = '';
          let depth = 1;
          while (i < sel.length && depth > 0) {
            if (sel[i] === '(') depth++;
            else if (sel[i] === ')') { depth--; if (depth === 0) { i++; break; } }
            arg += sel[i];
            i++;
          }
        }
        if (!SUPPORTED_PSEUDOS.has(s)) return null;
        compound.pseudos.push({ name: s, arg });
        hasPart = true;
      } else if (sel[i] === '[') {
        i++;
        let name = '';
        while (i < sel.length && /[a-zA-Z0-9_:-]/.test(sel[i])) { name += sel[i]; i++; }
        let op = null, value = null;
        while (i < sel.length && /\s/.test(sel[i])) i++;
        if (sel[i] === '=' || sel[i] === '~' || sel[i] === '|' || sel[i] === '^' || sel[i] === '$' || sel[i] === '*') {
          op = sel[i]; i++;
          if (op !== '=' && sel[i] === '=') { op += '='; i++; }
          while (i < sel.length && /\s/.test(sel[i])) i++;
          let q = null;
          if (sel[i] === '"' || sel[i] === "'") { q = sel[i]; i++; }
          let v = '';
          while (i < sel.length && (q ? sel[i] !== q : sel[i] !== ']')) { v += sel[i]; i++; }
          value = v;
          if (q) i++;
        }
        while (i < sel.length && sel[i] !== ']') i++;
        if (sel[i] === ']') i++;
        compound.attrs.push({ name: name.toLowerCase(), op, value });
        hasPart = true;
      }
    }
    if (!hasPart) return null;
    tokens.push({ combinator, compound });
  }
  return tokens.length ? tokens : null;
}

function matchSelectorChain(tokens, el) {
  if (!tokens.length) return false;
  let i = tokens.length - 1;
  let current = el;
  if (!matchCompound(tokens[i].compound, current)) return false;
  i--;
  while (i >= 0) {
    const { combinator, compound } = tokens[i];
    if (combinator === '>') {
      const parent = current.parent;
      if (!parent || parent.type !== 'element') return false;
      if (!matchCompound(compound, parent)) return false;
      current = parent;
    } else {
      let p = current.parent;
      let matched = null;
      while (p && p.type === 'element') {
        if (matchCompound(compound, p)) { matched = p; break; }
        p = p.parent;
      }
      if (!matched) return false;
      current = matched;
    }
    i--;
  }
  return true;
}

function matchCompound(c, el) {
  if (!el || el.type !== 'element') return false;
  if (c.tag && c.tag !== '*' && c.tag !== el.name) return false;
  if (c.id && c.id !== el.attrs.id) return false;
  if (c.classes.length) {
    const cls = (el.attrs.class || '').split(/\s+/);
    for (const want of c.classes) if (!cls.includes(want)) return false;
  }
  if (c.attrs && c.attrs.length) {
    for (const a of c.attrs) {
      const v = el.attrs[a.name];
      if (v === undefined) return false;
      if (a.op === '=' && v !== a.value) return false;
      if (a.op === '~=' && !v.split(/\s+/).includes(a.value)) return false;
      if (a.op === '^=' && !v.startsWith(a.value)) return false;
      if (a.op === '$=' && !v.endsWith(a.value)) return false;
      if (a.op === '*=' && !v.includes(a.value)) return false;
    }
  }
  if (c.pseudos && c.pseudos.length) {
    for (const p of c.pseudos) if (!matchPseudo(p, el)) return false;
  }
  return true;
}

function matchPseudo({ name, arg }, el) {
  const parent = el.parent;
  if (!parent || parent.type !== 'element') return false;
  const siblings = parent.children.filter((c) => c.type === 'element');
  const idx = siblings.indexOf(el);
  if (idx === -1) return false;
  if (name === 'first-child') return idx === 0;
  if (name === 'last-child') return idx === siblings.length - 1;
  if (name === 'only-child') return siblings.length === 1;
  if (name === 'nth-child') {
    const n = parseInt(String(arg), 10);
    if (!Number.isNaN(n)) return idx + 1 === n;
    return false;
  }
  if (name === 'first-of-type') {
    return siblings.find((s) => s.name === el.name) === el;
  }
  if (name === 'last-of-type') {
    let last = null;
    for (const s of siblings) if (s.name === el.name) last = s;
    return last === el;
  }
  if (name === 'nth-of-type') {
    const sameType = siblings.filter((s) => s.name === el.name);
    const tIdx = sameType.indexOf(el);
    const n = parseInt(String(arg), 10);
    if (!Number.isNaN(n)) return tIdx + 1 === n;
    return false;
  }
  if (name === 'only-of-type') {
    return siblings.filter((s) => s.name === el.name).length === 1;
  }
  return false;
}

// ---------- HTML tree ----------

export function parseHtml(htmlText) {
  const root = { type: 'root', children: [], parent: null };
  const stack = [root];
  let i = 0;
  while (i < htmlText.length) {
    const top = stack[stack.length - 1];
    if (top.type === 'element' && RAW_TEXT.has(top.name)) {
      const closeTag = '</' + top.name;
      const lower = htmlText.toLowerCase();
      const idx = lower.indexOf(closeTag, i);
      if (idx === -1) {
        appendText(top, htmlText.slice(i));
        i = htmlText.length;
        break;
      }
      appendText(top, htmlText.slice(i, idx));
      i = idx;
    }
    if (htmlText.startsWith('<!--', i)) {
      const end = htmlText.indexOf('-->', i + 4);
      if (end === -1) { appendText(stack[stack.length - 1], htmlText.slice(i)); break; }
      stack[stack.length - 1].children.push({
        type: 'comment', text: htmlText.slice(i, end + 3), parent: stack[stack.length - 1]
      });
      i = end + 3;
      continue;
    }
    if (htmlText.startsWith('<!', i)) {
      const end = htmlText.indexOf('>', i);
      if (end === -1) { appendText(stack[stack.length - 1], htmlText.slice(i)); break; }
      stack[stack.length - 1].children.push({
        type: 'doctype', text: htmlText.slice(i, end + 1), parent: stack[stack.length - 1]
      });
      i = end + 1;
      continue;
    }
    if (htmlText.startsWith('</', i)) {
      const end = htmlText.indexOf('>', i);
      if (end === -1) break;
      const name = htmlText.slice(i + 2, end).trim().toLowerCase();
      // pop until matching tag (lenient)
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].type === 'element' && stack[k].name === name) {
          stack.length = k;
          break;
        }
      }
      i = end + 1;
      continue;
    }
    if (htmlText[i] === '<' && i + 1 < htmlText.length && /[a-zA-Z]/.test(htmlText[i + 1])) {
      const tag = parseOpenTag(htmlText, i);
      if (!tag) {
        appendText(stack[stack.length - 1], '<');
        i++;
        continue;
      }
      const el = {
        type: 'element',
        name: tag.name,
        attrs: tag.attrs,
        attrsOrder: tag.attrsOrder,
        children: [],
        parent: stack[stack.length - 1]
      };
      stack[stack.length - 1].children.push(el);
      if (!tag.selfClose && !VOID.has(tag.name)) {
        stack.push(el);
      }
      i = tag.end;
      continue;
    }
    const lt = htmlText.indexOf('<', i);
    const end = lt === -1 ? htmlText.length : lt;
    appendText(stack[stack.length - 1], htmlText.slice(i, end));
    i = end;
  }
  return root;
}

function appendText(parent, text) {
  if (!text) return;
  const last = parent.children[parent.children.length - 1];
  if (last && last.type === 'text') {
    last.text += text;
    return;
  }
  parent.children.push({ type: 'text', text, parent });
}

function parseOpenTag(htmlText, start) {
  let i = start + 1;
  let name = '';
  while (i < htmlText.length && /[a-zA-Z0-9-]/.test(htmlText[i])) { name += htmlText[i]; i++; }
  if (!name) return null;
  name = name.toLowerCase();
  const attrs = {};
  const attrsOrder = [];
  let selfClose = false;
  while (i < htmlText.length) {
    while (i < htmlText.length && /\s/.test(htmlText[i])) i++;
    if (i >= htmlText.length) return null;
    if (htmlText[i] === '/') { selfClose = true; i++; continue; }
    if (htmlText[i] === '>') { i++; break; }
    let an = '';
    while (i < htmlText.length && /[a-zA-Z0-9_:.-]/.test(htmlText[i])) { an += htmlText[i]; i++; }
    if (!an) { i++; continue; }
    let av = '';
    while (i < htmlText.length && /\s/.test(htmlText[i])) i++;
    if (htmlText[i] === '=') {
      i++;
      while (i < htmlText.length && /\s/.test(htmlText[i])) i++;
      if (htmlText[i] === '"' || htmlText[i] === "'") {
        const q = htmlText[i];
        i++;
        while (i < htmlText.length && htmlText[i] !== q) { av += htmlText[i]; i++; }
        if (i < htmlText.length) i++;
      } else {
        while (i < htmlText.length && !/[\s>]/.test(htmlText[i])) { av += htmlText[i]; i++; }
      }
    }
    const lname = an.toLowerCase();
    attrs[lname] = av;
    if (!attrsOrder.includes(lname)) attrsOrder.push(lname);
  }
  return { name, attrs, attrsOrder, selfClose, end: i };
}

function collectStyleText(root) {
  const out = [];
  walkElements(root, (el) => {
    if (el.name === 'style') {
      for (const child of el.children) {
        if (child.type === 'text') out.push(child.text);
      }
    }
  });
  return out.join('\n');
}

function walkElements(node, visit) {
  if (node.type === 'element') visit(node);
  if (node.children) {
    for (const c of node.children) walkElements(c, visit);
  }
}

function setAttr(el, name, value) {
  if (!(name in el.attrs)) el.attrsOrder.push(name);
  el.attrs[name] = value;
}

export function serializeHtml(node) {
  if (node.type === 'root') return node.children.map(serializeHtml).join('');
  if (node.type === 'doctype') return node.text;
  if (node.type === 'comment') return node.text;
  if (node.type === 'text') return node.text;
  if (node.type === 'element') {
    if (node._skip) return '';
    let s = '<' + node.name;
    for (const k of node.attrsOrder) {
      const v = node.attrs[k];
      if (v === '') s += ` ${k}=""`;
      else s += ` ${k}="${escAttr(v, k)}"`;
    }
    if (VOID.has(node.name)) {
      s += '>';
      return s;
    }
    s += '>';
    s += node.children.map(serializeHtml).join('');
    s += `</${node.name}>`;
    return s;
  }
  return '';
}

function escAttr(v, name) {
  // Preserve already-encoded entities in attributes parsed from source;
  // only the `style` attribute is one we write fresh and must escape.
  if (name !== 'style') return v;
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
