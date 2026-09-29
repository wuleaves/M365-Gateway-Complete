# Changelog

## 0.1.4 — 2026-09-29

- Independently implemented Cloudflare-compatible behavior informed by M365-Copilot2API v0.7.1.
- Added public `reasoning_content` to streaming and non-streaming Chat Completions responses.
- Added bounded Responses `metadata` passthrough and `metadata.copilot_temp_session` support.
- Made `new_conversation=true` and `copilot_temp_session=true` use isolated temporary conversation state.
- Removed Microsoft-internal citation control markers from non-streaming and cross-chunk streaming output.
- Added regression coverage for reasoning output, metadata validation, temporary sessions and citation cleanup.
- Corrected the README model catalog so stable and tenant-dependent routes match the implementation.

The implementation intentionally does not add local-only features such as process autostart, a general proxy pool or forced IPv4 to the Cloudflare Worker path. Image generation remains disabled until it passes independent live-tenant validation.
