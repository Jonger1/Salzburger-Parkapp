// Prüft, ob alle im Code verwendeten Übersetzungsschlüssel in beiden Sprachen existieren.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync('src/lib/i18n.ts', 'utf8');
const block = (name) => {
  const m = src.match(new RegExp(`const ${name}: Dict = \\{([\\s\\S]*?)\\n\\};`));
  return new Set([...m[1].matchAll(/^\s*'([^']+)':/gm)].map((x) => x[1]));
};
const de = block('de');
const en = block('en');

const files = [];
const walk = (dir) => readdirSync(dir).forEach((f) => {
  const p = join(dir, f);
  if (statSync(p).isDirectory()) walk(p);
  else if (/\.tsx?$/.test(p) && !p.endsWith('i18n.ts')) files.push(p);
});
walk('src');

const used = new Set();
const prefixes = new Set();
for (const f of files) {
  const code = readFileSync(f, 'utf8');
  for (const m of code.matchAll(/(?:\bt|translate)\(\s*(?:[\w.]+,\s*)?'([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
  for (const m of code.matchAll(/labelKey: '([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
  for (const m of code.matchAll(/`([a-z]+)\.\$\{/g)) prefixes.add(m[1]);
}
// ternäre Schlüssel wie t(cond ? 'a.b' : 'c.d')
for (const f of files) {
  for (const m of readFileSync(f, 'utf8').matchAll(/'((?:now|notif|session|settings|map|legend|status|desc|info|pay|drive|history|common|rule|tab|day)\.[a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
}

let ok = true;
for (const k of used) {
  if (!de.has(k)) { console.log(`fehlt in de: ${k}`); ok = false; }
  if (!en.has(k)) { console.log(`fehlt in en: ${k}`); ok = false; }
}
for (const k of de) if (!en.has(k)) { console.log(`nur in de: ${k}`); ok = false; }
for (const k of en) if (!de.has(k)) { console.log(`nur in en: ${k}`); ok = false; }
const unused = [...de].filter((k) => !used.has(k) && ![...prefixes].some((p) => k.startsWith(p + '.')));
if (unused.length) console.log(`unbenutzt: ${unused.join(', ')}`);
console.log(ok ? `i18n ok (${de.size} Schlüssel)` : 'i18n FEHLER');
process.exit(ok ? 0 : 1);
