# React 19 extension migration

Version 1.1.0 generates React 19.3.1 panels with `@types/react` and `@types/react-dom` 19.3.0. The SDK remains `@coscene/extension` 1.x and the archive format remains `.coe`.

## Upgrade an existing React panel

```sh
npm install --save-dev --save-exact react@19.3.1 react-dom@19.3.1 @types/react@19.3.0 @types/react-dom@19.3.0
npm install --save-dev create-coscene-extension@^1.1.0
```

Commit the updated package manifest and lockfile together. Keep `react` and `react-dom` on the same version. Upgrade component libraries whose peer ranges exclude React 19; the Monaco example uses `@monaco-editor/react@4.7.0` and explicitly retains its existing `monaco-editor@0.38.0` peer. Both JSON-view examples use `@microlink/react-json-view@1.26.1`; the settings example's older 1.23.4 release pulled in Flux with a React 17 peer restriction.

- Use `createRoot` from `react-dom/client`, render into `context.panelElement`, and return a cleanup function that calls `root.unmount()`.
- Keep the automatic JSX transform (`"jsx": "react-jsx"`), inherited from this package's shared tsconfig.
- Replace global `JSX.Element` annotations with an imported `ReactElement` or `React.JSX.Element`.
- Give `useRef` an initial value and make ref callbacks return nothing unless they intentionally return a cleanup function. Zero-argument `useState` remains supported.
- Replace removed APIs such as `ReactDOM.render`, `unmountComponentAtNode`, and `findDOMNode`. Replace function-component `defaultProps` with parameter defaults.
- Stop calling the panel's render handler after disposal. The template clears `context.onRender` when its component unmounts. Finish each delivered render by calling its `done` callback after the corresponding React commit.

See the [React 19 upgrade guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide) for the remaining API and type changes.

## Keep React inside the extension bundle

The default webpack configuration externalizes only `@coscene/extension`. It bundles React, ReactDOM, and the JSX runtime in the extension. Keep this behavior: do not add `react`, `react-dom`, `react-dom/client`, or the JSX runtimes to `externals` or resolve them from Honeybee globals.

The host/extension interface is the SDK and the panel DOM element. React elements and contexts must stay within the extension's own renderer. There is no requirement to pass React objects across that boundary.

Existing custom bundles that relied on Honeybee-provided React need to remove those externals and rebuild. This release does not add compatibility shims for old React APIs. Upgrade incompatible extensions individually and verify them against the Honeybee release with which they will be deployed.

## Validate before distribution

```sh
npm run lint:ci
npm run build
npm run package
```

Load the resulting `.coe` in the target Honeybee build. Check initialization, continuous message playback and `done` acknowledgments, settings updates, and panel removal, replacement, and reopening. Check the browser console for React errors and confirm subscriptions, workers, and other resources stop when the panel closes. Test any editor, canvas, drag/drop, or third-party components used by your panel.

The message-converter and topic-aliasing examples do not use React. The webworker example renders DOM directly. Those examples no longer declare unused React packages and remain part of the build/package checks.

## Test an unpublished generator change

From the generator repository:

```sh
yarn install --immutable
yarn pack --out package.tgz
yarn test:e2e package.tgz --examples
```

The verification script creates a fresh generated project and temporary copies of all eight examples, installs their dependencies, then overlays the current tarball without changing their manifests or locks. It builds development bundles, packages production `.coe` files, and evaluates them without a host React module. For the generated panel, it also checks message rendering, render completion, and repeated mount/unmount cycles in a DOM harness. It prints the temporary directory containing the artifacts for testing in Honeybee.

Example manifests intentionally retain the published `create-coscene-extension@1.0.3` dependency so `npm ci` works before 1.1.0 is published. CI replaces it with the current tarball for acceptance. Do not change the examples to an unpublished registry version or commit local `file:` tarball references.

## Release

Publish 1.1.0 only after the generator checks and the target Honeybee integration checks pass. A `v1.1.0` GitHub release triggers the existing npm publishing workflow; that workflow now runs CI before publishing and checks that the release tag matches `package.json`. Prerelease versions publish with npm's `next` tag, and stable versions publish with `latest`.

Publishing the generator does not automatically rebuild or distribute existing extension archives. Release each upgraded extension with its own version and validated `.coe`.
