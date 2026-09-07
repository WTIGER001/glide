import { testActivationAndCommands, testConfigurationDefaults } from "./extension.test";

export async function run(): Promise<void> {
  await testActivationAndCommands();
  testConfigurationDefaults();
}
