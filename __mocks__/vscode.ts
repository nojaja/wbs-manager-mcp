// Minimal vscode mock used by tests
export const window = {
  createOutputChannel: (name: string) => ({ appendLine: (_: string) => {}, show: () => {} }),
  showErrorMessage: (_: any) => {},
  showInformationMessage: (_: any) => {},
  showWarningMessage: (_: any) => Promise.resolve(undefined),
  activeTextEditor: undefined
};

export const commands = {
  executeCommand: (_: string, ...__args: any[]) => Promise.resolve()
};

export const workspace = {
  workspaceFolders: []
};

export class ThemeIcon {
  constructor(public id: string) {}
}

export enum ViewColumn { One = 1 }

export const windowForUri = window;

export class EventEmitter<T> {
  private _listeners: ((e: T) => void)[] = [];
  event = (listener: (e: T) => void) => {
    this._listeners.push(listener);
    return { dispose: () => {} };
  };
  fire(e: T) {
    this._listeners.forEach(l => l(e));
  }
}

export const TreeItemCollapsibleState = {
  Collapsed: 1,
  None: 0
};

export class TreeItem {
  tooltip?: string;
  id?: string;
  iconPath?: any;
  constructor(public label: string, public collapsibleState: number) {}
}

export const windowShowInformationMessage = window.showInformationMessage;
