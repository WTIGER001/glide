# Privacy

Glide has no external telemetry and no Glide-operated backend.

For an eligible completion, Glide sends the selected model, stable completion instructions, the active file's basename and language identifier, and bounded text immediately before and after the cursor to the configured Responses endpoint. It does not send absolute paths, repository names, Git state, other open files, local statistics, or telemetry identifiers.

API keys are stored in VS Code SecretStorage. Completion results are cached only in memory. Aggregate statistics remain in VS Code local global state and never contain source text, prompts, completion text, filenames, or repository names.
