const { createRequire } = require("module");

const requireFromHere = createRequire(__filename);

const nodeRequire = typeof require === "function" ? require : null;
const extensions = nodeRequire ? nodeRequire.extensions : undefined;

if (extensions && !extensions[".ts"]) {
  const fs = require("fs");
  const ts = requireFromHere("typescript");

  extensions[".ts"] = (module, filename) => {
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

const baseRequire = nodeRequire || requireFromHere;

let tsModule;

try {
  tsModule = baseRequire("./index.ts");
} catch (error) {
  if (
    baseRequire !== requireFromHere &&
    error &&
    (error.code === "MODULE_NOT_FOUND" || /Cannot find module/.test(error.message || ""))
  ) {
    tsModule = requireFromHere("./index.ts");
  } else {
    throw error;
  }
}

Object.assign(exports, tsModule);
exports.default = tsModule;
