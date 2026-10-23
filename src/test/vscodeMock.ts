type ConfigurationValues = Readonly<Record<string, unknown>>;

let configurationValues: ConfigurationValues = {};

export function setMockConfiguration(values: ConfigurationValues): void {
  configurationValues = values;
}

export class Disposable {
  public constructor(private readonly callback: () => void = () => undefined) {}

  public dispose(): void {
    this.callback();
  }
}

export class Position {
  public constructor(
    public readonly line: number,
    public readonly character: number
  ) {}
}

export class Range {
  public constructor(
    public readonly start: Position,
    public readonly end: Position
  ) {}
}

export class InlineCompletionItem {
  public constructor(
    public readonly insertText: string,
    public readonly range?: Range,
    public readonly command?: { title: string; command: string; arguments?: unknown[] }
  ) {}
}

export enum InlineCompletionTriggerKind {
  Automatic = 0,
  Invoke = 1
}

export const StatusBarAlignment = { Right: 2 };
export class MockStatusBarItem {
  public name = "";
  public text = "";
  public tooltip = "";
  public command = "";
  public show(): void {}
  public dispose(): void {}
}
export const statusBarItems: MockStatusBarItem[] = [];

export const window: {
  createStatusBarItem: () => MockStatusBarItem;
  activeTextEditor:
    | {
        document: { uri: { toString(): string } };
        selection: { isEmpty: boolean; active: Position };
        options: { insertSpaces: boolean; tabSize: number };
      }
    | undefined;
} = {
  activeTextEditor: undefined,
  createStatusBarItem: () => {
    const item = new MockStatusBarItem();
    statusBarItems.push(item);
    return item;
  }
};

export const workspace = {
  isTrusted: true,
  getWorkspaceFolder: () => undefined,
  getConfiguration: () => ({
    get: <T>(key: string, fallback?: T): T => (key in configurationValues ? configurationValues[key] : fallback) as T,
    inspect: (key: string) =>
      key in configurationValues
        ? { globalValue: configurationValues[key], defaultValue: undefined }
        : undefined
  })
};
