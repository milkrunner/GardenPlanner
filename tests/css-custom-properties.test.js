// CSS-Variablen (#387): Jede var(--name)-Verwendung braucht eine Deklaration in :root,
// sonst wird die Deklaration zur Laufzeit ungültig (z. B. transparenter Button).
// Variablen, die nur das Dark Theme setzt, fehlen sonst im hellen Theme.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SOURCES = [
  ...fs.readdirSync(path.join(ROOT, 'src/css')).map((f) => `src/css/${f}`),
  ...fs.readdirSync(path.join(ROOT, 'public')).map((f) => `public/${f}`),
  ...fs.readdirSync(path.join(ROOT, 'src/js')).map((f) => `src/js/${f}`),
].filter((f) => /\.(css|html|js)$/.test(f));

const read = (file) =>
  fs
    .readFileSync(path.join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

function declaredIn(selectorPattern) {
  const names = new Set();
  const rule = new RegExp(
    `(?:^|[\\s}])${selectorPattern}\\s*\\{([^}]*)\\}`,
    'g',
  );
  for (const file of SOURCES) {
    for (const [, body] of read(file).matchAll(rule)) {
      for (const [, name] of body.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) {
        names.add(name);
      }
    }
  }
  return names;
}

const rootDefs = declaredIn(':root');
const darkDefs = declaredIn("\\[data-theme='dark'\\]");

describe('CSS Custom Properties', () => {
  test('Tokens in :root werden gefunden', () => {
    expect(rootDefs.has('--primary')).toBe(true);
    expect(darkDefs.has('--primary')).toBe(true);
  });

  test('jede var(--…)-Verwendung ist in :root definiert', () => {
    const undefinedUses = [];
    for (const file of SOURCES) {
      for (const [, name] of read(file).matchAll(
        /var\(\s*(--[a-zA-Z0-9_-]+)/g,
      )) {
        if (!rootDefs.has(name)) undefinedUses.push(`${file}: ${name}`);
      }
    }
    expect([...new Set(undefinedUses)]).toEqual([]);
  });

  test('das Dark Theme überschreibt nur Tokens, die :root kennt', () => {
    expect([...darkDefs].filter((name) => !rootDefs.has(name))).toEqual([]);
  });
});
