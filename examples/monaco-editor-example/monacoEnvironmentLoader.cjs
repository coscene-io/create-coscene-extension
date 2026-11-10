const path = require("path");

// Monaco 0.33 reads worker settings from the host page. Give this bundled instance its own
// environment instead, without changing another editor's global worker configuration.
module.exports = function monacoEnvironmentLoader(source) {
  const access = "globals.MonacoEnvironment";
  if (!source.includes(access)) {
    throw new Error("Monaco's environment access changed; review this loader when upgrading it");
  }
  const environment = JSON.stringify(path.resolve(__dirname, "src/monacoEnvironment.ts"));
  return `import extensionMonacoEnvironment from ${environment};\n${source.replaceAll(access, "extensionMonacoEnvironment")}`;
};
