import { chmod, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SecretStore, userApiKeyFilePath } from "./secretStore";
import { API_KEY_FILE_STATE } from "./constants";

class MemoryState {
  public readonly values = new Map<string, unknown>();
  public get<T>(key: string, fallback?: T): T | undefined { return (this.values.get(key) as T | undefined) ?? fallback; }
  public update(key: string, value: unknown): Promise<void> {
    if (value === undefined) this.values.delete(key);
    else this.values.set(key, value);
    return Promise.resolve();
  }
}

class MemorySecretStorage {
  private readonly values = new Map<string, string>();

  public get(key: string): Promise<string | undefined> {
    return Promise.resolve(this.values.get(key));
  }

  public store(key: string, value: string): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }

  public delete(key: string): Promise<void> {
    this.values.delete(key);
    return Promise.resolve();
  }
}

const originalConfigHome = process.env.XDG_CONFIG_HOME;
const originalEnvironmentKey = process.env.OPENAI_API_KEY;
let temporaryDirectory: string | undefined;

afterEach(async () => {
  if (originalConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalConfigHome;
  if (originalEnvironmentKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalEnvironmentKey;
  if (temporaryDirectory !== undefined) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = undefined;
  }
});

async function useTemporaryConfigHome(): Promise<string> {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), "glide-key-file-"));
  process.env.XDG_CONFIG_HOME = temporaryDirectory;
  const directory = path.dirname(userApiKeyFilePath());
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return directory;
}

async function writePrivateKey(filePath: string, key: string): Promise<void> {
  await writeFile(filePath, `${key}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(filePath, 0o600);
}

describe("SecretStore user key file fallback", () => {
  it("loads a private XDG key file before the environment fallback", async () => {
    const directory = await useTemporaryConfigHome();
    await writePrivateKey(path.join(directory, "apikey"), "\nfile-key");
    process.env.OPENAI_API_KEY = "environment-key";

    const store = new SecretStore(new MemorySecretStorage() as never);
    await store.initialize();

    expect(store.hasApiKey()).toBe(true);
    expect(store.getApiKey()).toBe("file-key");
    expect(await store.isCredentialFile(path.join(directory, "apikey"))).toBe(true);
  });

  it("follows a symbolic link to a private managed key file", async () => {
    const directory = await useTemporaryConfigHome();
    const managedKey = path.join(temporaryDirectory ?? "", "managed-apikey");
    await writePrivateKey(managedKey, "managed-key");
    await symlink(managedKey, path.join(directory, "apikey"));

    const store = new SecretStore(new MemorySecretStorage() as never);
    await store.initialize();

    expect(store.getApiKey()).toBe("managed-key");
    expect(await store.isCredentialFile(path.join(directory, "apikey"))).toBe(true);
    expect(await store.isCredentialFile(managedKey)).toBe(true);
    const alias = path.join(directory, "innocent.go");
    await symlink(managedKey, alias);
    expect(await store.isCredentialFile(alias)).toBe(true);
    expect(await store.isCredentialFile(path.join(directory, "ordinary.go"))).toBe(false);
  });

  it("rejects a key file readable by group or others", async () => {
    const directory = await useTemporaryConfigHome();
    const keyPath = path.join(directory, "apikey");
    await writePrivateKey(keyPath, "unsafe-key");
    await chmod(keyPath, 0o644);
    process.env.OPENAI_API_KEY = "environment-key";

    const store = new SecretStore(new MemorySecretStorage() as never);
    await store.initialize();

    expect(store.getApiKey()).toBe("environment-key");
    expect(await store.isCredentialFile(keyPath)).toBe(true);
  });

  it("protects a missing credential path and ignores relative XDG directories", async () => {
    await useTemporaryConfigHome();
    const store = new SecretStore(new MemorySecretStorage() as never);
    await store.initialize();
    expect(await store.isCredentialFile(userApiKeyFilePath())).toBe(true);
    expect(userApiKeyFilePath({ XDG_CONFIG_HOME: ".config" }, "/users/example"))
      .toBe(path.join("/users/example", ".config", "glide", "apikey"));
  });

  it("prefers SecretStorage and returns to the file fallback when its saved key is removed", async () => {
    const directory = await useTemporaryConfigHome();
    await writePrivateKey(path.join(directory, "apikey"), "file-key");
    process.env.OPENAI_API_KEY = "environment-key";
    const store = new SecretStore(new MemorySecretStorage() as never);
    await store.initialize();
    await store.setApiKey("saved-key");
    expect(store.getApiKey()).toBe("saved-key");
    await store.removeApiKey();
    expect(store.getApiKey()).toBe("file-key");
  });

  it("remembers only the selected path and loads its current contents on the next activation", async () => {
    const directory = await useTemporaryConfigHome();
    const selected = path.join(directory, "chosen-credential");
    await writePrivateKey(selected, "selected-key");
    const storage = new MemorySecretStorage();
    const state = new MemoryState();
    const store = new SecretStore(storage as never, state);
    await store.initialize();
    const selecting = store.selectApiKeyFile(selected);
    expect(store.getApiKey()).toBeUndefined();
    await selecting;
    expect(store.getApiKey()).toBe("selected-key");
    expect([...state.values.entries()]).toEqual([[API_KEY_FILE_STATE, selected]]);

    await writePrivateKey(selected, "rotated-key");
    const reloaded = new SecretStore(storage as never, state);
    await reloaded.initialize();
    expect(reloaded.getApiKeyFilePath()).toBe(selected);
    expect(reloaded.getApiKey()).toBe("rotated-key");
  });

  it("preserves saved-key priority and clears the file selection without deleting any credential", async () => {
    const directory = await useTemporaryConfigHome();
    const defaultFile = path.join(directory, "apikey");
    const selected = path.join(directory, "custom");
    await writePrivateKey(defaultFile, "default-key");
    await writePrivateKey(selected, "selected-key");
    process.env.OPENAI_API_KEY = "environment-key";
    const state = new MemoryState();
    const store = new SecretStore(new MemorySecretStorage() as never, state);
    await store.initialize();
    await store.setApiKey("saved-key");
    await store.selectApiKeyFile(selected);
    expect(store.hasSavedApiKey()).toBe(true);
    expect(store.getApiKey()).toBe("saved-key");
    await store.removeApiKey();
    expect(store.getApiKey()).toBe("selected-key");
    await store.clearApiKeyFile();
    expect(state.get(API_KEY_FILE_STATE)).toBeUndefined();
    expect(store.getApiKeyFilePath()).toBe(defaultFile);
    expect(store.getApiKey()).toBe("default-key");
    expect(await store.isCredentialFile(selected)).toBe(true);
    await store.selectApiKeyFile(selected);
    expect(store.getApiKey()).toBe("selected-key");
  });

  it("protects selected symlinks, their target, other aliases, and the default target", async () => {
    const directory = await useTemporaryConfigHome();
    const target = path.join(directory, "credential.go");
    const selected = path.join(directory, "selected-link");
    const alias = path.join(directory, "alias.go");
    const defaultTarget = path.join(directory, "default.go");
    await writePrivateKey(target, "selected-key");
    await writePrivateKey(defaultTarget, "default-key");
    await symlink(defaultTarget, path.join(directory, "apikey"));
    await symlink(target, selected);
    await symlink(target, alias);
    const state = new MemoryState();
    await state.update(API_KEY_FILE_STATE, selected);
    const store = new SecretStore(new MemorySecretStorage() as never, state);
    await store.initialize();
    for (const file of [selected, target, alias, defaultTarget]) {
      expect(await store.isCredentialFile(file)).toBe(true);
    }
  });

  it("rejects invalid files without replacing the working selection and protects rejected paths", async () => {
    const directory = await useTemporaryConfigHome();
    const selected = path.join(directory, "working");
    await writePrivateKey(selected, "working-key");
    const state = new MemoryState();
    const store = new SecretStore(new MemorySecretStorage() as never, state);
    await store.initialize();
    await store.selectApiKeyFile(selected);
    const invalid = [
      { name: "empty", contents: "\n ", message: "first non-empty line" },
      { name: "binary", contents: "key\0data", message: "first non-empty line" },
      { name: "large", contents: "k".repeat(65_537), message: "too large" },
      { name: "public.go", contents: "exposed-key", message: "0600 or 0400", mode: 0o644 }
    ];
    for (const entry of invalid) {
      const file = path.join(directory, entry.name);
      await writePrivateKey(file, entry.contents);
      if (entry.mode !== undefined) await chmod(file, entry.mode);
      await expect(store.selectApiKeyFile(file)).rejects.toThrow(entry.message);
      expect(await store.isCredentialFile(file)).toBe(true);
      expect(store.getApiKeyFilePath()).toBe(selected);
      expect(store.getApiKey()).toBe("working-key");
      expect(state.get(API_KEY_FILE_STATE)).toBe(selected);
    }
    await expect(store.selectApiKeyFile(directory)).rejects.toThrow("not a folder");
    await expect(store.selectApiKeyFile("relative-key")).rejects.toThrow("absolute path");
    await expect(store.selectApiKeyFile(path.join(directory, "missing"))).rejects.toThrow("exists and is readable");
  });

  it("keeps a missing saved selection protected and uses the environment fallback", async () => {
    const directory = await useTemporaryConfigHome();
    const selected = path.join(directory, "missing.go");
    await writePrivateKey(path.join(directory, "apikey"), "default-key");
    process.env.OPENAI_API_KEY = "environment-key";
    const state = new MemoryState();
    await state.update(API_KEY_FILE_STATE, selected);
    const store = new SecretStore(new MemorySecretStorage() as never, state);
    await store.initialize();
    expect(store.getApiKeyFilePath()).toBe(selected);
    expect(store.getApiKey()).toBe("environment-key");
    expect(await store.isCredentialFile(selected)).toBe(true);
  });

  it("leaves the active credential unchanged if saving the selected path fails", async () => {
    const directory = await useTemporaryConfigHome();
    await writePrivateKey(path.join(directory, "apikey"), "default-key");
    const selected = path.join(directory, "selected");
    await writePrivateKey(selected, "selected-key");
    const state = new MemoryState();
    state.update = () => Promise.reject(new Error("storage unavailable"));
    const store = new SecretStore(new MemorySecretStorage() as never, state);
    await store.initialize();
    await expect(store.selectApiKeyFile(selected)).rejects.toThrow("storage unavailable");
    expect(store.getApiKey()).toBe("default-key");
    expect(store.getApiKeyFilePath()).toBe(userApiKeyFilePath());
    expect(await store.isCredentialFile(selected)).toBe(true);
  });

  it("serializes file changes so the last selection wins", async () => {
    const directory = await useTemporaryConfigHome();
    const first = path.join(directory, "first");
    const last = path.join(directory, "last");
    await writePrivateKey(first, "first-key");
    await writePrivateKey(last, "last-key");
    const state = new MemoryState();
    const store = new SecretStore(new MemorySecretStorage() as never, state);
    await store.initialize();
    const selecting = Promise.all([store.selectApiKeyFile(first), store.clearApiKeyFile(), store.selectApiKeyFile(last)]);
    expect(store.getApiKey()).toBeUndefined();
    await selecting;
    expect(store.getApiKey()).toBe("last-key");
    expect(state.get(API_KEY_FILE_STATE)).toBe(last);
  });
});
