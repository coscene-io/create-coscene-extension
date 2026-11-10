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

async function verifyBundle(source, panelKind) {
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
    if (panelKind === "message-converter") {
      const converters = [];
      module.exports.activate({
        registerMessageConverter: (converter) => converters.push(converter),
      });
      assert.equal(converters.length, 1);
      const [converter] = converters;
      assert.equal(converter.fromSchemaName, "My.Gps");
      assert.equal(converter.toSchemaName, "foxglove.LocationFix");
      assert.deepEqual(JSON.parse(JSON.stringify(converter.converter({ lat: 0, lon: -45.5 }))), {
        latitude: 0,
        longitude: -45.5,
      });
    } else if (panelKind === "topic-aliasing") {
      const callbacks = [];
      module.exports.activate({ registerTopicAliases: (callback) => callbacks.push(callback) });
      assert.equal(callbacks.length, 1);
      const [aliases] = callbacks;
      const defaultAliases = aliases({ topics: [], globalVariables: {} });
      assert.deepEqual(JSON.parse(JSON.stringify(defaultAliases)), [
        { sourceTopicName: "/CAM_FRONT/image_rect_compressed", name: "/selected_camera_image" },
        { sourceTopicName: "/imu", name: "/aliased_imu" },
        { sourceTopicName: "/odom", name: "/aliased_odom" },
      ]);
      const selectedAliases = aliases({
        topics: [{ name: "/CAM_REAR/Image" }],
        globalVariables: { camera: "REAR" },
      });
      assert.equal(selectedAliases[0].sourceTopicName, "/CAM_REAR/image_rect_compressed");
      assert.deepEqual(JSON.parse(JSON.stringify(selectedAliases.at(-1))), {
        sourceTopicName: "/CAM_REAR/Image",
        name: "/bulk_aliases/cam_rear/image",
      });
    } else if (panelKind === "webworker") {
      const panels = [];
      module.exports.activate({ registerPanel: (panel) => panels.push(panel) });
      assert.equal(panels.length, 1);
      assert.equal(panels[0].name, "Webworker Demo");
      assert.equal(typeof panels[0].initPanel, "function");
      // Worker creation, messages, and termination are checked in the Honeybee browser harness.
    } else if (panelKind === "template" || panelKind === "settings") {
      let registration;
      module.exports.activate({ registerPanel: (panel) => (registration = panel) });
      assert.ok(registration);
      const watched = [];
      const subscriptions = [];
      const context = {
        panelElement: window.document.getElementById("panel"),
        initialState: {},
        watch: (field) => watched.push(field),
        subscribe: (topics) => subscriptions.push(topics),
        saveState() {},
        updatePanelSettingsEditor() {},
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
            currentFrame:
              panelKind === "settings"
                ? [{ topic: "/one", message: { nested: { value: "react19-json" } } }]
                : [],
          },
          () => completed++,
        );
        await waitFor(() => completed === 1, "render completion");
        if (panelKind === "template") {
          assert.match(context.panelElement.textContent, /\/one/);
          assert.match(context.panelElement.textContent, /\/two/);
        } else {
          assert.match(context.panelElement.textContent, /react19-json/);
          const expanded = context.panelElement.querySelector(".expanded-icon");
          assert.ok(expanded, "The JSON object must be expandable");
          expanded.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
          await waitFor(
            () => !context.panelElement.textContent.includes("react19-json"),
            "JSON object collapse",
          );
          const collapsed = context.panelElement.querySelector(".collapsed-icon");
          assert.ok(collapsed);
          collapsed.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
          await waitFor(
            () => context.panelElement.textContent.includes("react19-json"),
            "JSON object expansion",
          );
        }
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

async function verifyProject(directory, panelKind) {
  run("npm", ["run", "build"], directory);
  if (path.basename(directory) === "monaco-editor-example") {
    assert.deepEqual(
      fs.readdirSync(path.join(directory, "dist")).filter((file) => file.endsWith(".js")),
      ["extension.js"],
      "Monaco workers and lazy language modules must stay in the .coe entry point",
    );
  }
  await verifyBundle(fs.readFileSync(path.join(directory, "dist/extension.js"), "utf8"), panelKind);
  run("npm", ["run", "package"], directory);
  const archives = fs.readdirSync(directory).filter((file) => file.endsWith(".coe"));
  assert.equal(archives.length, 1);
  const archive = await JSZip.loadAsync(fs.readFileSync(path.join(directory, archives[0])));
  const manifest = JSON.parse(await archive.file("package.json").async("string"));
  const entry = archive.file(manifest.main.replace(/^\.\//, ""));
  assert.ok(entry, "The packaged entry point must exist");
  await verifyBundle(await entry.async("string"), panelKind);
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
  await verifyProject(sample, "template");

  if (includeExamples) {
    const examples = path.join(repository, "examples");
    // Exercise the worker compiler first so platform-specific build failures surface early.
    const names = fs.readdirSync(examples).sort();
    const orderedExamples = [
      "monaco-editor-example",
      ...names.filter((name) => name !== "monaco-editor-example"),
    ];
    for (const name of orderedExamples) {
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
      const panelKind =
        name === "panel-settings"
          ? "settings"
          : ["message-converter", "topic-aliasing", "webworker"].includes(name)
            ? name
            : undefined;
      await verifyProject(destination, panelKind);
    }
  }
  console.log(`All package checks passed. Artifacts: ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
