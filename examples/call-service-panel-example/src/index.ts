import { ExtensionContext } from "@coscene/extension";

import { initCallServicePanel } from "./CallServicePanel";

export function activate(extensionContext: ExtensionContext): void {
  extensionContext.registerPanel({ name: "call-service", initPanel: initCallServicePanel });
}
