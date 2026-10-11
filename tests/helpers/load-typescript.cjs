const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
module.exports = function load(path, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, process: { env: {} }, console, URL, require: name => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unmocked dependency: ${name}`);
  } });
  return module.exports;
};
