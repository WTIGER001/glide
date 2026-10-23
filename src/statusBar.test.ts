import { beforeEach, expect, it } from "vitest";
import { GlideStatusBar } from "./statusBar";
import type { SecretStore } from "./secretStore";
import { setMockConfiguration, statusBarItems } from "./test/vscodeMock";

beforeEach(() => {
  setMockConfiguration({});
  statusBarItems.length = 0;
});

it("keeps a stable model label while showing an active retry and returning to ready", () => {
  const status = new GlideStatusBar({ hasApiKey: () => true } as SecretStore);
  const item = statusBarItems[0];
  expect(item?.text).toBe("$(sparkle) Glide: Luna");
  status.setError("authentication");
  expect(item?.tooltip).toContain("Automatic requests are paused");
  expect(item?.command).toBe("glide.setApiKey");
  status.setRequesting(true);
  expect(item?.text).toBe("$(loading~spin) Glide: Luna");
  status.setError(false);
  status.setRequesting(false);
  expect(item?.text).toBe("$(sparkle) Glide: Luna");
  status.dispose();
});

it("shows an error after a failed request and respects disable while work ends", () => {
  const status = new GlideStatusBar({ hasApiKey: () => true } as SecretStore);
  const item = statusBarItems[0];
  status.setRequesting(true);
  status.setError(true);
  status.setRequesting(false);
  expect(item?.command).toBe("glide.openDiagnosticLog");
  setMockConfiguration({ enabled: false });
  status.refresh();
  expect(item?.text).toBe("$(circle-slash) Glide: Off");
  status.dispose();
});
