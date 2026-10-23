import { chmod, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SecretStore, userApiKeyFilePath } from "./secretStore";

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
});
