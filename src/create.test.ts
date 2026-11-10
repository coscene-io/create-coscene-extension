import { readdir, readFile, realpath } from "fs/promises";
import * as path from "path";
import { dirSync, setGracefulCleanup } from "tmp";

import { buildCommand } from "./build";
import { createCommand } from "./create";

let tmpdir: string;

jest.setTimeout(300 * 1000);

jest.mock("./log.ts", () => ({
  info: jest.fn(),
  fatal: jest.fn((msg) => {
    throw new Error(`fatal() called: ${String(msg)}`);
  }),
}));

beforeAll(async () => {
  setGracefulCleanup();
  // macOS exposes its temp directory through /var -> /private/var. Use one path for
  // TypeScript's rootDir and webpack's symlink-resolved module paths.
  tmpdir = await realpath(dirSync({ unsafeCleanup: true }).name);
});

describe("createCommand", () => {
  it("creates a skeleton extension package", async () => {
    await createCommand({ name: "extension-test", cwd: tmpdir });

    const destDir = path.join(tmpdir, "extension-test");
    const contents = await readdir(destDir, { withFileTypes: true });

    const dirs = contents.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    const files = contents.filter((entry) => entry.isFile()).map((entry) => entry.name);

    expect(dirs).toHaveLength(2);
    expect(dirs).toContain("node_modules");
    expect(dirs).toContain("src");

    expect(files).toContain("CHANGELOG.md");
    expect(files).toContain("package.json");
    expect(files).toContain("README.md");
    expect(files).toContain("tsconfig.json");
    expect(files).toContain("package-lock.json");
    expect(files).not.toContain("yarn.lock");

    const packageJsonStr = await readFile(path.join(destDir, "package.json"), { encoding: "utf8" });
    expect(packageJsonStr).not.toContain("${NAME}");
    expect(packageJsonStr).toContain("extension-test");
    const packageJson = JSON.parse(packageJsonStr) as Record<string, unknown>;
    const dependencies = packageJson.devDependencies as Record<string, string>;
    expect(dependencies["@coscene/extension"]).toMatch(/^1\./);
    expect(dependencies).toMatchObject({
      "@types/react": "19.3.0",
      "@types/react-dom": "19.3.0",
      react: "19.3.1",
      "react-dom": "19.3.1",
    });

    // Exercise the current source instead of the CLI downloaded by the generated project.
    await buildCommand({ cwd: destDir, mode: "development" });

    await buildCommand({ cwd: destDir, mode: "production" });

    // make sure we don't generate unneeded .d.ts files
    const builtContents = await readdir(path.join(destDir, "dist"), { withFileTypes: true });
    const builtFiles = builtContents.filter((entry) => entry.isFile()).map((entry) => entry.name);
    expect(builtFiles.some((name) => name.endsWith(".d.ts"))).toBe(false);
  });
});
