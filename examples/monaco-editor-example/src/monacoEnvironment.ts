import type { Environment } from "monaco-editor";

import EditorWorker from "./editor.worker";
import TypeScriptWorker from "./typescript.worker";

const environment: Environment = {
  getWorker(_workerId, label) {
    return label === "typescript" || label === "javascript"
      ? new TypeScriptWorker()
      : new EditorWorker();
  },
};

export default environment;
