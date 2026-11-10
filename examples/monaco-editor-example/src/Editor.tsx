import MonacoEditor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution";
import "monaco-editor/esm/vs/language/typescript/monaco.contribution";
import { ReactElement, useState } from "react";

// Use the bundled editor; the host's content security policy does not permit the default CDN.
loader.config({ monaco });

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
