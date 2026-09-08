/* Rewrites <style> blocks that were pasted inside content widgets so they
   cannot leak out and restyle the whole page.

   - selectors are prefixed with the widget wrapper class
   - `body` / `html` / `:root` selectors are retargeted at that wrapper
   - font-family declarations are dropped so everything inherits Assistant
   - page-level background/margin/padding resets on body are dropped
*/

const DROP_DECL = /^(font-family|font)$/i;

function splitTop(str, sep) {
  const out = [];
  let depth = 0, buf = '', inStr = null;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (inStr) { buf += c; if (c === inStr && str[i - 1] !== '\\') inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; buf += c; continue; }
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === sep && depth === 0) { out.push(buf); buf = ''; continue; }
    buf += c;
  }
  out.push(buf);
  return out;
}

function scopeSelector(sel, scope) {
  return splitTop(sel, ',').map(s => {
    s = s.trim();
    if (!s) return '';
    if (/^(from|to|\d+%)$/i.test(s)) return s;                 // keyframe stops
    if (/^(html|body|:root)\b/i.test(s)) {
      const rest = s.replace(/^(html|body|:root)\b/i, '').trim();
      return rest ? scope + ' ' + rest : scope;
    }
    if (s.startsWith('&')) return scope + s.slice(1);
    return scope + ' ' + s;
  }).filter(Boolean).join(', ');
}

function cleanDeclarations(body, opts) {
  return splitTop(body, ';').map(d => {
    const i = d.indexOf(':');
    if (i < 0) return d.trim() ? d.trim() : '';
    const prop = d.slice(0, i).trim();
    if (DROP_DECL.test(prop)) return '';
    if (opts && opts.wasBody && /^(background|background-color|margin|padding|min-height|height|width|max-width|display|color)$/i.test(prop)) return '';
    return d.trim();
  }).filter(Boolean).join('; ');
}

/**
 * @param {string} css raw stylesheet text
 * @param {string} scope selector to scope everything under, e.g. '.embed-1'
 */
function scopeCss(css, scope) {
  let out = '';
  let i = 0;

  function parseBlock(end) {
    let res = '';
    while (i < css.length) {
      // skip whitespace & comments
      while (i < css.length && /\s/.test(css[i])) i++;
      if (css.startsWith('/*', i)) { const e = css.indexOf('*/', i); i = e < 0 ? css.length : e + 2; continue; }
      if (end && css[i] === '}') { i++; return res; }
      if (i >= css.length) return res;

      // read the prelude up to { or ;
      let start = i, depth = 0;
      while (i < css.length) {
        const c = css[i];
        if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (c === '{' && depth === 0) break;
        else if (c === ';' && depth === 0) break;
        else if (c === '}' && depth === 0) break;
        i++;
      }
      const prelude = css.slice(start, i).trim();

      if (css[i] === ';' || css[i] === '}' || i >= css.length) {
        // at-rule without a block (@import, @charset) - drop it
        if (css[i] === ';') i++;
        continue;
      }
      i++; // consume '{'

      if (prelude.startsWith('@')) {
        const name = prelude.split(/\s+/)[0].toLowerCase();
        if (name === '@keyframes' || name === '@-webkit-keyframes' || name === '@font-face') {
          // copy through untouched (keyframe stops must not be scoped)
          const inner = readRaw();
          if (name !== '@font-face') res += prelude + '{' + inner + '}\n';
          continue;
        }
        // @media / @supports / @container - recurse
        const inner = parseBlock(true);
        if (inner.trim()) res += prelude + '{\n' + inner + '}\n';
        continue;
      }

      const bodyText = readRaw();
      const wasBody = /^\s*(html|body|:root)\s*$/i.test(prelude);
      const decls = cleanDeclarations(bodyText, { wasBody });
      if (decls) res += scopeSelector(prelude, scope) + ' { ' + decls + ' }\n';
    }
    return res;
  }

  function readRaw() {
    let depth = 1, start = i;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    return css.slice(start, i - 1);
  }

  out = parseBlock(false);
  return out.trim();
}

module.exports = { scopeCss };
