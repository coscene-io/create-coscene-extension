# monaco-editor-example

This is a simple [coScene](https://www.coscene.cn/) [extension panel](https://docs.coscene.cn/docs/viz/extensions/guides/create-custom-panel) that demonstrates
embedding the [Monaco Editor](https://microsoft.github.io/monaco-editor/) in a custom panel.

The React wrapper uses the bundled `monaco-editor@0.33.0` instance. The editor, TypeScript
language worker, editor worker, CSS, and font are included in the `.coe`, so opening the panel does
not require a CDN or a change to the host's content security policy.

`config.ts` keeps lazy modules in one entry point and uses inline workers, as in the webworker
example. `monacoEnvironmentLoader.cjs` binds Monaco's worker settings to this extension's module
instead of overwriting the host's `MonacoEnvironment`. The loader deliberately fails if the pinned
Monaco sources change; review it when upgrading the editor. This makes the extension archive larger
than the CDN-based example. The editor's existing DOMPurify 2.3.1 is unchanged by the React upgrade.

Each panel owns and disposes its editor and model. Monaco shares its language worker across panels
from this extension module for the lifetime of the module; closing one panel does not
terminate that shared worker. Reopening the panel reuses it.
