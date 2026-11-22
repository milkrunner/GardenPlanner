// Hilfen, um die klassischen Browser-Skripte aus src/js in jsdom auszuführen.
// Die Skripte laufen per vm.Script im Kontext des Fensters, damit top-level
// const/class-Deklarationen wie im Browser geteilt werden. Mit filename, damit die
// V8-Coverage sie dem Quelltext zuordnet.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');

function createBrowser({ html = '', setup } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    runScripts: 'outside-only',
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  if (setup) setup(window);
  return {
    dom,
    window,
    document: window.document,
    load(...files) {
      for (const file of files) {
        const filename = path.join(ROOT, 'src/js', file);
        new vm.Script(fs.readFileSync(filename, 'utf8'), {
          filename,
        }).runInContext(dom.getInternalVMContext());
      }
    },
    run(code) {
      return new vm.Script(code).runInContext(dom.getInternalVMContext());
    },
    close() {
      window.close();
    },
  };
}

module.exports = { createBrowser };
