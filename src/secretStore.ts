import type * as vscode from "vscode";
import { API_KEY_SECRET } from "./constants";

export class SecretStore {
  private savedKey: string | undefined;

  public constructor(private readonly secrets: vscode.SecretStorage) {}

  public async initialize(): Promise<void> {
    this.savedKey = cleanKey(await this.secrets.get(API_KEY_SECRET));
  }

  public hasApiKey(): boolean {
    return this.savedKey !== undefined || cleanKey(process.env.OPENAI_API_KEY) !== undefined;
  }

  public getApiKey(): string | undefined {
    return this.savedKey ?? cleanKey(process.env.OPENAI_API_KEY);
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
