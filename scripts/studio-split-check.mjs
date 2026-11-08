// The Studio's script is five classic scripts sharing one global scope (src/lab-studio-core.js, -layers, -io, -open, -workspace, loaded in that
// order). A script sees what an earlier one declared, never a later one's, while it runs; so code that RUNS while a part loads (its top-level
// statements, and the bodies of the functions they call there and then) may use only names from its own part or an earlier one. This finds any
// that does not. Run: node scripts/studio-split-check.mjs (it needs the TypeScript compiler, for its parser: npm i -g typescript, or set TS_PATH).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let ts; for (const p of [process.env.TS_PATH, 'typescript', '/opt/node22/lib/node_modules/typescript', '/usr/local/lib/node_modules/typescript', '/usr/lib/node_modules/typescript'].filter(Boolean)) { try { ts = require(p); break; } catch { /* the next */ } }
if (!ts) { console.log('studio-split-check: the TypeScript compiler was not found (npm i -g typescript); not checked'); process.exit(0); }
const PARTS = ['core', 'layers', 'io', 'open', 'workspace'].map(p => ({ name: `lab-studio-${p}.js`, src: readFileSync(new URL(`../src/lab-studio-${p}.js`, import.meta.url), 'utf8') }));
const files = PARTS.map(p => ts.createSourceFile(p.name, p.src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS));
const decl = new Map(), fnBody = new Map();
files.forEach((sf, part) => { for (const st of sf.statements) {
  const put = (n, body) => { if (!decl.has(n)) decl.set(n, part); if (body) fnBody.set(n, body); };
  if (ts.isFunctionDeclaration(st) && st.name) put(st.name.text, st.body);
  else if (ts.isClassDeclaration(st) && st.name) put(st.name.text);
  else if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) {
    const fn = d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) ? d.initializer.body : null;
    const names = []; const collect = b => { if (ts.isIdentifier(b)) names.push(b.text); else b.elements?.forEach(e => e.name && collect(e.name)); }; collect(d.name); names.forEach(n => put(n, fn));
  } } });
const isName = n => { const p = n.parent; return !(p && ((ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n) || (ts.isVariableDeclaration(p) && p.name === n))); };
const isFn = n => ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n);
const calledHere = n => (ts.isCallExpression(n.parent) && n.parent.expression === n) || (ts.isParenthesizedExpression(n.parent) && ts.isCallExpression(n.parent.parent) && n.parent.parent.expression === n.parent);
function eager(node, out, calls) { const v = n => { if (isFn(n)) { if (calledHere(n) && n.body) v(n.body); return; } if (ts.isIdentifier(n) && isName(n)) out.add(n.text); if ((ts.isCallExpression(n) || ts.isNewExpression(n)) && n.expression && ts.isIdentifier(n.expression)) calls.add(n.expression.text); ts.forEachChild(n, v); }; v(node); }
function every(node, out) { const v = n => { if (ts.isIdentifier(n) && isName(n)) out.add(n.text); ts.forEachChild(n, v); }; v(node); }
const found = [];
files.forEach((sf, part) => { for (const st of sf.statements) { if (ts.isFunctionDeclaration(st)) continue;
  const ids = new Set(), calls = new Set(); eager(st, ids, calls); const seen = new Set(), todo = [...calls];
  while (todo.length) { const f = todo.pop(); if (seen.has(f) || !fnBody.has(f)) continue; seen.add(f); const inner = new Set(); every(fnBody.get(f), inner); for (const i of inner) { ids.add(i); if (fnBody.has(i)) todo.push(i); } }
  for (const id of ids) if ((decl.get(id) ?? -1) > part) found.push(`${PARTS[part].name}:${sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1} uses ${id} from ${PARTS[decl.get(id)].name} while it loads`);
} });
const uniq = [...new Set(found)];
console.log(uniq.length ? uniq.join('\n') : `studio-split-check: the ${PARTS.length} parts load in order with nothing used before it is declared`);
process.exit(uniq.length ? 1 : 0);
