import type * as vscode from "vscode";
import { readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { API_KEY_SECRET } from "./constants";

export class SecretStore {
  private savedKey: string | undefined;
  private fileKey: string | undefined;
  private readonly credentialPaths = new Set<string>();
  private resolvedCredentialTarget: string | undefined;

  public constructor(private readonly secrets: vscode.SecretStorage) {}

  public async initialize(): Promise<void> {
    const filePath = userApiKeyFilePath();
    this.credentialPaths.add(pathIdentity(filePath));
    const [savedKey, fileKey] = await Promise.all([
      this.secrets.get(API_KEY_SECRET),
      readUserApiKeyFile(filePath, (target) => {
        this.resolvedCredentialTarget = pathIdentity(target);
        this.credentialPaths.add(this.resolvedCredentialTarget);
      })
    ]);
    this.savedKey = cleanKey(savedKey);
    this.fileKey = fileKey;
  }

  public hasApiKey(): boolean {
    return this.getApiKey() !== undefined;
  }

  public getApiKey(): string | undefined {
    return this.savedKey ?? this.fileKey ?? cleanKey(process.env.OPENAI_API_KEY);
  }

  public async isCredentialFile(filePath: string): Promise<boolean> {
    if (this.credentialPaths.has(pathIdentity(filePath))) return true;
    if (this.resolvedCredentialTarget === undefined) return false;
    // Resolve aliases only when a user key file exists; never read source content here.
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

async function readUserApiKeyFile(filePath: string, protectTarget: (target: string) => void): Promise<string | undefined> {
  try {
    // Protect the resolved target even if its permissions prevent using the key.
    const target = await realpath(filePath);
    protectTarget(target);
    const details = await stat(target);
    if (!details.isFile() || (process.platform !== "win32" && (details.mode & 0o077) !== 0)) {
      return undefined;
    }
    const firstNonEmptyLine = (await readFile(target, "utf8"))
      .split(/\r?\n/u)
      .find((line) => line.trim() !== "");
    return cleanKey(firstNonEmptyLine);
  } catch {
    // A missing, unreadable, or invalid user-level fallback must not block activation.
    return undefined;
  }
}
