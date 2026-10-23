# Privacy

Glide has no external telemetry and no Glide-operated backend.

For an eligible completion, Glide sends the selected model, stable completion instructions, the active file's basename and language identifier, and bounded text immediately before and after the cursor to the configured Responses endpoint. If the disabled-by-default `glide.sameFileContext` experiment is enabled, it may also send up to 2,000 characters of selected imports or declarations from that same active file. It does not send absolute paths, repository names, Git state, other open files, local statistics, or telemetry identifiers.

The Set API Key command writes only to VS Code SecretStorage. At activation, Glide may also read a private `$XDG_CONFIG_HOME/glide/apikey` (or `~/.config/glide/apikey`) file; SecretStorage takes priority, then the user file, then `OPENAI_API_KEY`. It never reads workspace dotenv files. The configured credential path and its target resolved at activation are always excluded from completion context; aliases to that target are checked using filesystem metadata only. Common credential filenames and directories are protected by default. No filename denylist can identify every secret embedded in ordinary source; additional exclusions are available through `glide.excludePatterns`.

HTTP redirects are rejected; Glide never replays a credential or completion request to a redirect target. Completion results are cached only in memory. OpenAI may automatically cache eligible prompt prefixes under its API prompt-caching policy; `store:false` does not disable that provider cache. Glide does not send a prompt-cache key or a stable user/repository identifier.

Aggregate statistics remain in VS Code local global state. They contain counters, bounded latency buckets, language/model buckets, and rejection categories. They never contain source text, prompts, completion text, filenames, repository names, or durable source hashes. A “returned” suggestion means the inline provider produced an item; Glide does not claim that VS Code visibly rendered every returned item.
