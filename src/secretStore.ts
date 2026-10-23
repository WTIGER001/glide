import type * as vscode from "vscode";
import { readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { API_KEY_FILE_STATE, API_KEY_SECRET } from "./constants";

export class ApiKeyFileError extends Error {}

export class SecretStore {
  private savedKey: string | undefined;
  private fileKey: string | undefined;
  private selectedFilePath: string | undefined;
  private readonly credentialPaths = new Set<string>();
  private hasResolvedCredentialTarget = false;
  private fileChanges: Promise<void> = Promise.resolve();
  private pendingFileChanges = 0;

  public constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly state?: Pick<vscode.Memento, "get" | "update">
  ) {}

  public async initialize(): Promise<void> {
    const storedPath = this.state?.get<unknown>(API_KEY_FILE_STATE);
    this.selectedFilePath = typeof storedPath === "string" && path.isAbsolute(storedPath) ? storedPath : undefined;
    // The conventional location can still hold a secret when another file is selected.
    await this.protectFile(userApiKeyFilePath());
    const [savedKey, fileKey] = await Promise.all([
      this.secrets.get(API_KEY_SECRET),
      this.readFileKey(this.getApiKeyFilePath()).catch(() => undefined)
    ]);
    this.savedKey = cleanKey(savedKey);
    this.fileKey = fileKey;
  }

  public hasApiKey(): boolean {
    return this.getApiKey() !== undefined;
  }

  public getApiKey(): string | undefined {
    if (this.pendingFileChanges > 0) return undefined;
    return this.savedKey ?? this.fileKey ?? cleanKey(process.env.OPENAI_API_KEY);
  }

  public hasSavedApiKey(): boolean {
    return this.savedKey !== undefined;
  }

  public getApiKeyFilePath(): string {
    return this.selectedFilePath ?? userApiKeyFilePath();
  }

  public selectApiKeyFile(filePath: string): Promise<void> {
    return this.changeFile(async () => {
      if (!path.isAbsolute(filePath)) throw new ApiKeyFileError("Choose an API-key file using an absolute path.");
      const key = await this.readFileKey(filePath);
      if (this.state === undefined) throw new ApiKeyFileError("Glide cannot save the API-key file selection.");
      await this.state.update(API_KEY_FILE_STATE, filePath);
      this.selectedFilePath = filePath;
      this.fileKey = key;
    });
  }

  public clearApiKeyFile(): Promise<void> {
    return this.changeFile(async () => {
      const key = await this.readFileKey(userApiKeyFilePath()).catch(() => undefined);
      if (this.state === undefined) throw new ApiKeyFileError("Glide cannot clear the API-key file selection.");
      await this.state.update(API_KEY_FILE_STATE, undefined);
      this.selectedFilePath = undefined;
      this.fileKey = key;
    });
  }

  private changeFile(change: () => Promise<void>): Promise<void> {
    // Serialize selections and withhold credentials while their protection/contents change.
    this.pendingFileChanges += 1;
    const operation = this.fileChanges.then(change);
    this.fileChanges = operation.catch(() => undefined);
    return operation.finally(() => { this.pendingFileChanges -= 1; });
  }

  private async protectFile(filePath: string): Promise<string | undefined> {
    this.credentialPaths.add(pathIdentity(filePath));
    try {
      const target = await realpath(filePath);
      this.credentialPaths.add(pathIdentity(target));
      this.hasResolvedCredentialTarget = true;
      return target;
    } catch {
      return undefined;
    }
  }

  private async readFileKey(filePath: string): Promise<string> {
    const target = await this.protectFile(filePath);
    if (target === undefined) throw new ApiKeyFileError("Glide could not read the API-key file. Check that it exists and is readable.");
    return readUserApiKeyFile(target);
  }

  public async isCredentialFile(filePath: string): Promise<boolean> {
    if (this.credentialPaths.has(pathIdentity(filePath))) return true;
    if (!this.hasResolvedCredentialTarget) return false;
    // Resolve aliases to current or previously selected credentials; never read source content here.
    try {
      return this.credentialPaths.has(pathIdentity(await realpath(filePath)));
    } catch {
      return false;
    }
  }

  public async setApiKey(value: string): Promise<void> {
    const key = cleanKey(value);
    if (key === undefined) {
      throw new Error("An API key cannot be empty.");
    }
    await this.secrets.store(API_KEY_SECRET, key);
    this.savedKey = key;
  }

  public async removeApiKey(): Promise<void> {
    await this.secrets.delete(API_KEY_SECRET);
    this.savedKey = undefined;
  }
}

function cleanKey(value: string | undefined): string | undefined {
  const key = value?.trim();
  return key ? key : undefined;
}

export function userApiKeyFilePath(environment: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const configuredDirectory = cleanKey(environment.XDG_CONFIG_HOME);
  const directory = configuredDirectory !== undefined && path.isAbsolute(configuredDirectory)
    ? configuredDirectory : path.join(home, ".config");
  return path.join(directory, "glide", "apikey");
}

function pathIdentity(filePath: string): string {
  const normalized = path.resolve(filePath);
  return process.platform === "win32" || process.platform === "darwin" ? normalized.toLowerCase() : normalized;
}

async function readUserApiKeyFile(target: string): Promise<string> {
  try {
    const details = await stat(target);
    if (!details.isFile()) throw new ApiKeyFileError("Choose a file containing the API key, not a folder.");
    if (process.platform !== "win32" && (details.mode & 0o077) !== 0) {
      throw new ApiKeyFileError("The API-key file must be private. Set its permissions to 0600 or 0400, then select it again.");
    }
    if (details.size > 65_536) throw new ApiKeyFileError("The API-key file is too large. Choose a file containing only the key.");
    const firstNonEmptyLine = (await readFile(target, "utf8"))
      .split(/\r?\n/u)
      .find((line) => line.trim() !== "");
    const key = cleanKey(firstNonEmptyLine);
    if (key === undefined || key.includes("\0")) throw new ApiKeyFileError("The API-key file must contain a key on its first non-empty line.");
    return key;
  } catch (error) {
    if (error instanceof ApiKeyFileError) throw error;
    throw new ApiKeyFileError("Glide could not read the API-key file. Check that it exists and is readable.");
  }
}
