import MonacoEditor, { loader } from "@monaco-editor/react";
import { ReactElement, useState } from "react";

// Preserve the CDN runtime used by the previous loader instead of upgrading the editor with React.
loader.config({
  paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.33.0/min/vs" },
});

const SourceCode = `
  type MyType = {
    name: string;
    value: number;
  };

  function x() {
    const myValue: MyType = { name: "Hello", value: 1 };
    console.log(myValue);
  }
`;

/**
 * Our main editor component. For now we just wrap the MonacoEditor component.
 */
export function Editor(): ReactElement {
  const [value, setValue] = useState<undefined | string>(SourceCode);

  return (
    <MonacoEditor
      height="100%"
      width="100%"
      theme="vs-dark"
      onChange={(newValue) => {
        setValue(newValue);
      }}
      value={value}
      defaultLanguage="typescript"
    />
  );
}
