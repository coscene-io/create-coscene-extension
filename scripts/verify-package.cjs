// Test the packed CLI and its consumers before this version exists on npm.
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const JSZip = require("jszip");
const { JSDOM, VirtualConsole } = require("jsdom");

const repository = path.resolve(__dirname, "..");
const tarball = path.resolve(process.argv[2] ?? "package.tgz");
const includeExamples = process.argv.includes("--examples");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "coscene-react19-"));
const version = require("../package.json").version;
const reactDependencies = {
  react: "19.3.1",
  "react-dom": "19.3.1",
  "@types/react": "19.3.0",
  "@types/react-dom": "19.3.0",
};

function run(command, args, cwd) {
  // Calling npm's JS entry point avoids cmd.exe argument quoting for paths with spaces.
  const windowsNpm = command === "npm" && process.platform === "win32";
  const result = spawnSync(
    windowsNpm ? process.execPath : command,
    windowsNpm
      ? [path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"), ...args]
      : args,
    {
      cwd,
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed in ${cwd}`);
}

function installCurrentCli(directory) {
  const manifestPath = path.join(directory, "package.json");
  const lockPath = path.join(directory, "package-lock.json");
  const manifest = fs.readFileSync(manifestPath);
  const lock = fs.readFileSync(lockPath);
  run("npm", ["install", "--no-save", tarball], directory);
  assert.deepEqual(fs.readFileSync(manifestPath), manifest);
  assert.deepEqual(fs.readFileSync(lockPath), lock);
  const installed = JSON.parse(
    fs.readFileSync(path.join(directory, "node_modules/create-coscene-extension/package.json")),
  );
  assert.equal(installed.version, version);
}

async function waitFor(predicate, description) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await delay(10);
  }
  assert.fail(`Timed out waiting for ${description}`);
}

async function verifyBundle(source, mountTemplate) {
  const errors = [];
  const rendererVersions = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error.message));
  const dom = new JSDOM("<!doctype html><div id='panel'></div>", {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "http://localhost/",
    virtualConsole,
  });
  const { window } = dom;
  window.console.error = (...args) => errors.push(args.map(String).join(" "));
  window.console.warn = (...args) => errors.push(args.map(String).join(" "));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    inject(renderer) {
      rendererVersions.push(renderer.version);
      return rendererVersions.length;
    },
    onCommitFiberRoot() {},
    onCommitFiberUnmount() {},
  };
  try {
    const module = { exports: {} };
    // No React, ReactDOM, or JSX runtime is supplied by the host.
    new window.Function("module", "require", source)(module, (name) => {
      throw new Error(`Unexpected external module: ${name}`);
    });
    assert.equal(typeof module.exports.activate, "function");
    if (mountTemplate) {
      let registration;
      module.exports.activate({ registerPanel: (panel) => (registration = panel) });
      assert.ok(registration);
      const watched = [];
      const subscriptions = [];
      const context = {
        panelElement: window.document.getElementById("panel"),
        watch: (field) => watched.push(field),
        subscribe: (topics) => subscriptions.push(topics),
      };
      for (let mount = 0; mount < 2; mount++) {
        const cleanup = registration.initPanel(context);
        assert.equal(typeof cleanup, "function");
        await waitFor(() => typeof context.onRender === "function", "panel initialization");
        let completed = 0;
        context.onRender(
          {
            topics: [
              { name: "/one", schemaName: "Example" },
              { name: "/two", schemaName: "Example" },
            ],
            currentFrame: [],
          },
          () => completed++,
        );
        await waitFor(() => completed === 1, "render completion");
        assert.match(context.panelElement.textContent, /\/one/);
        assert.match(context.panelElement.textContent, /\/two/);
        cleanup();
        assert.equal(context.onRender, undefined);
        assert.equal(context.panelElement.childElementCount, 0);
        await delay(20);
        assert.equal(completed, 1);
      }
      assert.ok(watched.includes("topics") && watched.includes("currentFrame"));
      assert.equal(subscriptions.length, 2);
      assert.ok(rendererVersions.includes("19.3.1"), "Expected a bundled React 19.3.1 renderer");
    }
    assert.deepEqual(errors, []);
  } finally {
    window.close();
  }
}

async function verifyProject(directory, mountTemplate) {
  run("npm", ["run", "build"], directory);
  await verifyBundle(
    fs.readFileSync(path.join(directory, "dist/extension.js"), "utf8"),
    mountTemplate,
  );
  run("npm", ["run", "package"], directory);
  const archives = fs.readdirSync(directory).filter((file) => file.endsWith(".coe"));
  assert.equal(archives.length, 1);
  const archive = await JSZip.loadAsync(fs.readFileSync(path.join(directory, archives[0])));
  const manifest = JSON.parse(await archive.file("package.json").async("string"));
  const entry = archive.file(manifest.main.replace(/^\.\//, ""));
  assert.ok(entry, "The packaged entry point must exist");
  await verifyBundle(await entry.async("string"), mountTemplate);
  console.log(`Verified ${path.basename(directory)}: ${path.join(directory, archives[0])}`);
}

async function main() {
  assert.ok(fs.existsSync(tarball), `Pack the current branch first: yarn pack --out ${tarball}`);
  console.log(`Keeping verification artifacts in ${output}`);
  const runner = path.join(output, "runner");
  fs.mkdirSync(runner);
  run("npm", ["install", "--ignore-scripts", "--no-package-lock", tarball], runner);
  run(
    process.execPath,
    [
      path.join(
        runner,
        "node_modules/create-coscene-extension/dist/bin/create-coscene-extension.js",
      ),
      "sample",
    ],
    output,
  );
  const sample = path.join(output, "sample");
  const manifest = JSON.parse(fs.readFileSync(path.join(sample, "package.json")));
  for (const [name, expected] of Object.entries(reactDependencies)) {
    assert.equal(manifest.devDependencies[name], expected);
  }
  assert.ok(manifest.devDependencies["@coscene/extension"]);
  installCurrentCli(sample);
  run("npm", ["run", "lint:ci"], sample);
  await verifyProject(sample, true);

  if (includeExamples) {
    const examples = path.join(repository, "examples");
    for (const name of fs.readdirSync(examples).sort()) {
      const source = path.join(examples, name);
      if (!fs.statSync(source).isDirectory()) continue;
      const destination = path.join(output, name);
      fs.cpSync(source, destination, {
        recursive: true,
        filter: (file) =>
          !["node_modules", "dist"].includes(path.basename(file)) &&
          !file.endsWith(".coe") &&
          !file.endsWith(".tsbuildinfo"),
      });
      run("npm", ["ci"], destination);
      installCurrentCli(destination);
      await verifyProject(destination, false);
    }
  }
  console.log(`All package checks passed. Artifacts: ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
