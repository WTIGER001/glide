# Glide five-session dogfood record

Use one stable release-candidate configuration for five real coding sessions, primarily Go. Do not record source, completion text, filenames, repository names, credentials, or durable source hashes.

Recommended baseline: Luna, reasoning `none`, P0/fixed96, 175 ms debounce, `glide.sameFileContext: false`. Reset local stats once before session 1, then use `Glide: Show Stats` after each session and record only aggregate deltas.

| Session | Language | Active minutes | Auto / explicit opportunities | Requests / cancelled | Returned / accepted | Accepted chars / active min | Distraction 1–5 | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | Go | | | | | | | |
| 2 | Go | | | | | | | |
| 3 | Go | | | | | | | |
| 4 | | | | | | | | |
| 5 | | | | | | | | |

Across the five sessions, exercise physical Tab acceptance, multiline insertion, partial type-through, Escape, editing while a request is pending, another inline-completion provider, credential setup/removal, disable/enable, and a restricted file/workspace. Record whether each scenario passed without including source details.

After session 5, compare the observed last-edit-to-return distribution and distraction notes with the product targets in the action plan. Decide among: publish the current default, narrow automatic eligibility while keeping explicit invocation, or defer publication because Luna latency/quality is not usable.
