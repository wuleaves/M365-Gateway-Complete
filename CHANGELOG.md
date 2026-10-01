# Changelog

## 0.2.2 — 2026-10-01

- Protected recent client-bound cloud conversations during administrator cleanup and deletion. Conversations without a reliable last-activity timestamp are skipped instead of being deleted by creation age alone.
- Added an administrator list/reset UI for registered explicit sessions; reset refuses active sessions.
- Counted successful committed-session reuse and first-use requests exactly, without claiming estimated token savings.
- Rolled current-minute usage into the existing totals row and archived it only on minute change, eliminating the extra per-request trend-row write.
- Added focused cleanup and Durable Object accounting tests.

## 0.2.1 — 2026-10-01

- Validated the requested model on image generation, edit and variation routes; only `m365-image` is accepted, so unsupported chat models can no longer be silently substituted.
- Added a bounded seven-day minute usage series and timezone-aware `/api/admin/usage/trend` aggregation. The 24-hour view switches between minute and hour buckets, while the seven-day view uses local calendar days.
- Replaced the admin dashboard's static traffic illustration with a real usage trend and added account, key, session and diagnostic quick actions.
- Distinguished Microsoft ChatHub upstream 503 overload from local connection failures while retaining account failover behavior.
- Reviewed M365-Copilot2API `056c028` and adapted the Cloudflare-compatible behavior independently; process-level WebSocket prewarming remains outside the Worker lifecycle.

## 0.2.0 — 2026-09-30

- Independently reimplemented the portable M365-Copilot2API compatibility set for the Cloudflare-native architecture.
- Added Anthropic `thinking` blocks and streaming `thinking_delta` output sourced only from Microsoft public reasoning summaries.
- Added explicit `X-M365-Session-Id` support plus authenticated `/v1/sessions` create/list/inspect/delete lifecycle with API-key isolation.
- Added bounded OpenAI-compatible image generation, edit and variation endpoints through the tenant-dependent `m365-image` route.
- Added file and audio inputs for Chat Completions and Responses, with request-wide count/size limits, private-address rejection and redacted durable history.
- Added a configurable first-output timeout so heartbeat-only ChatHub connections fail deterministically instead of hanging.
- Added administrator cloud-conversation list/delete/cleanup operations and Microsoft 365 memory flags, instructions and settings routes.
- Added authenticated plugin discovery and MCP initialize/ping/tools/list/tools/call/SSE compatibility routes.
- Added runtime model aliases and ChatHub tone mappings, persisted in TenantState and validated before activation.
- Added account activation, enable/disable, cooldown recovery, token health, fixed egress selection and bounded batch operations.
- Added per-API-key/model/endpoint usage dimensions and fixed-target Relay health checks without exposing relay URLs or secrets.
- Scoped Microsoft cloud-resource token exchange now uses the stored account identity and preserves the primary ChatHub access token, avoiding token-claim-only `accountId` extraction failures.

Local-only process autostart, filesystem self-update, arbitrary HTTP/SOCKS proxy pools, forced IPv4 and unsafe prompt/upstream-body logging remain excluded because they are not portable or safe in Cloudflare Workers.

## 0.1.4 — 2026-09-29

- Independently implemented Cloudflare-compatible behavior informed by M365-Copilot2API v0.7.1.
- Added public `reasoning_content` to streaming and non-streaming Chat Completions responses.
- Added bounded Responses `metadata` passthrough and `metadata.copilot_temp_session` support.
- Made `new_conversation=true` and `copilot_temp_session=true` use isolated temporary conversation state.
- Removed Microsoft-internal citation control markers from non-streaming and cross-chunk streaming output.
- Added regression coverage for reasoning output, metadata validation, temporary sessions and citation cleanup.
- Corrected the README model catalog so stable and tenant-dependent routes match the implementation.

The implementation intentionally does not add local-only features such as process autostart, a general proxy pool or forced IPv4 to the Cloudflare Worker path.
