export const EXTENSION_NAME = "Glide";
export const CONFIG_SECTION = "glide";
export const API_KEY_SECRET = "glide.openaiApiKey";
export const PROMPT_VERSION = "completion-v1";
export const ACCEPTANCE_COMMAND = "glide.internal.recordAcceptance";

export const SUPPORTED_MODELS = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"] as const;
export type GlideModel = (typeof SUPPORTED_MODELS)[number];

export const REASONING_EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export function modelLabel(model: GlideModel): string {
  switch (model) {
    case "gpt-5.6-luna":
      return "Luna";
    case "gpt-5.6-terra":
      return "Terra";
    case "gpt-5.6-sol":
      return "Sol";
  }
}
