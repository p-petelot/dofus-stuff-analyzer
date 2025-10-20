const { createRequire } = require("module");
const fs = require("fs");

const requireFromHere = createRequire(__filename);
const ts = requireFromHere("typescript");

if (!require.extensions[".ts"]) {
  require.extensions[".ts"] = (module, filename) => {
    const source = fs.readFileSync(filename, "utf8");
    const { outputText } = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
        jsx: ts.JsxEmit.React,
      },
    });
    module._compile(outputText, filename);
  };
}

const tsModule = requireFromHere("./index.ts");

Object.assign(exports, tsModule);
exports.default = tsModule;
