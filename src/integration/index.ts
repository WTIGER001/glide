import {
  testActivationAndCommands,
  testConfigurationDefaults,
  testNativeInlineCompletionAndAcceptance
} from "./extension.test";

export async function run(): Promise<void> {
  await testActivationAndCommands();
  testConfigurationDefaults();
  await testNativeInlineCompletionAndAcceptance();
}
