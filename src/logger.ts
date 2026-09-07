import type * as vscode from "vscode";

type LogValue = string | number | boolean | null | undefined;
type LogMetadata = Readonly<Record<string, LogValue>>;

const FORBIDDEN_FIELD = /(code|content|completion|filename|path|prefix|prompt|response|secret|suffix|text|token|uri)/i;

export class DiagnosticLogger {
  public constructor(
    private readonly output: vscode.OutputChannel,
    private readonly isEnabled: () => boolean
  ) {}

  public event(name: string, metadata: LogMetadata = {}): void {
    if (!this.isEnabled()) {
      return;
    }
    const safe: Record<string, Exclude<LogValue, undefined>> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (FORBIDDEN_FIELD.test(key) || value === undefined) {
        continue;
      }
      safe[key] = typeof value === "string" ? value.slice(0, 80).replace(/[\r\n]/g, " ") : value;
    }
    const detail = Object.keys(safe).length === 0 ? "" : ` ${JSON.stringify(safe)}`;
    this.output.appendLine(`${new Date().toISOString()} ${name}${detail}`);
  }

  public show(): void {
    this.output.show(true);
  }
}
