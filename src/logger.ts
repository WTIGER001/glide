import type * as vscode from "vscode";

type LogValue = string | number | boolean | null | undefined;
type LogMetadata = Readonly<Record<string, LogValue>>;

const FORBIDDEN_FIELD = /(code|content|completion|filename|path|prefix|prompt|response|secret|suffix|text|token|uri|api.?key|credential|authorization|header)/i;

export class DiagnosticLogger {
  public constructor(
    private readonly output: vscode.OutputChannel,
    private readonly isEnabled: () => boolean,
    private readonly now: () => number = () => Date.now()
  ) {}

  private readonly importantErrorTimes = new Map<string, number>();

  public event(name: string, metadata: LogMetadata = {}): void {
    if (!this.isEnabled()) {
      return;
    }
    this.write(name, metadata);
  }

  public importantError(name: string, metadata: LogMetadata = {}): void {
    const signature = `${name}:${JSON.stringify(metadata)}`;
    const last = this.importantErrorTimes.get(signature);
    if (last !== undefined && this.now() - last < 30_000) {
      return;
    }
    this.importantErrorTimes.set(signature, this.now());
    this.write(name, metadata);
  }

  private write(name: string, metadata: LogMetadata): void {
    const safe: Record<string, Exclude<LogValue, undefined>> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (FORBIDDEN_FIELD.test(key) || value === undefined) {
        continue;
      }
      safe[key] =
        typeof value === "string"
          ? (key === "endpoint" ? value : value.slice(0, 80)).replace(/[\r\n]/g, " ")
          : value;
    }
    const detail = Object.keys(safe).length === 0 ? "" : ` ${JSON.stringify(safe)}`;
    this.output.appendLine(`${new Date().toISOString()} ${name}${detail}`);
  }

  public show(): void {
    this.output.show(true);
  }
}
