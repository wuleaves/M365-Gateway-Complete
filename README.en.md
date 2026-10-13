# M365 Gateway Complete

Version: **0.2.4**. Compatibility reference: [M365-Copilot2API v0.7.3](https://github.com/HEXUXIU/M365-Copilot2API/releases/tag/v0.7.3), commit `c6181d263849b2071731d3be6209a023ff62ca7f`.

[中文文档](README.md) · [v0.7.3 upgrade and compatibility matrix](UPGRADE-0.2.4.md)

This gateway adapts Microsoft 365 ChatHub to OpenAI and Anthropic compatible HTTP APIs. It runs on Cloudflare Workers, or on a Node.js/Docker host using the same local Worker runtime. Optional Go relays provide fixed-target Microsoft ChatHub egress.

The TypeScript implementation adapts upstream behavior independently. It does not replace this project with the upstream Go server. The source package preserves its existing license notices; public availability does not imply a new license grant.

## Architecture

- `src/index.ts`: lightweight Worker ingress. Most `/v1/*` requests are streamed unchanged to a request-scoped `InferenceGateway` Durable Object; the model catalog stays at ingress.
- `src/gateway-handler.ts`: administration, OAuth, API authorization and routing.
- `TenantState` (SQLite): authoritative encrypted OAuth credentials, password hashes, API key hashes, administrator sessions, account routing generations, usage counters and bounded redacted diagnostics.
- `ChatSession` (SQLite): isolated conversation coordinates, concurrent-request leases, pending client tools, bounded portable history and response aliases.
- `SENSITIVE_KV`: encrypted credential mirror and backup. Account reads use authoritative DO state; KV eventual consistency cannot determine account health.
- `R2_ARCHIVE` (optional): bounded encrypted cold archives. This resource is not required in the request path.
- `web-v2/`: current responsive administration assets. `web/` retains the compatibility UI.
- `optional-egress-relay/`: restricted fixed-target Go relays. The service is not a general-purpose proxy.

Credentials are encrypted with AES-256-GCM. Administrator passwords use PBKDF2; API keys are stored as SHA-256 hashes and displayed in full only once when created. `DATA_ENCRYPTION_KEY` must remain a deployment secret. Never store OAuth tokens, API keys, administrator passwords or production configuration in source files or logs.

## API compatibility

| Endpoint | Behavior |
| --- | --- |
| `GET /v1/models` | Public model catalog; Codex catalog when a `client_version` query is supplied |
| `POST /v1/chat/completions` | OpenAI Chat Completions, streaming or buffered; function calls and public reasoning summaries |
| `POST /v1/responses` | Responses lifecycle events, previous response IDs, session continuation and caller-local tools |
| `POST /v1/responses/compact` | Bounded compaction with encrypted caller-scoped recovery state |
| `POST /v1/messages` | Anthropic Messages, including tool blocks and public-summary thinking blocks |
| `/v1/sessions` | API-key-scoped explicit session creation, listing, inspection and deletion |
| `/v1/images/generations`, `/edits`, `/variations` | Bounded image request preflight; actual upstream support is tenant-dependent |
| `/v1/memory/*` | Microsoft personalization memory; writes require administrator authorization |
| `/v1/mcp/*` | Bounded MCP compatibility for memory, custom instructions and plugin discovery |
| `GET /api/metrics` | Administrator-only SLA metrics; `/api/admin/metrics` is an alias |

Clients supply `Authorization: Bearer <key>` or `X-API-Key: <key>`. Ordinary custom tools must be declared on continuation requests. Codex `additional_tools` in the `functions` namespace is normalized with explicit caller permissions and schema checks. Custom-tool input is delivered once through its delta event, with an empty input in `output_item.added`.

The gateway forwards local tool calls; the calling client executes them. Cloudflare does not provide a Windows filesystem, desktop, shell or container. Runtime headers identify the Worker relay boundary. A missing client execution contract produces an explicit bounded failure instead of silently switching to a hosted execution environment.

## Models and capability limits

The public catalog includes GPT-5.2, GPT-5.3, GPT-5.4, GPT-5.5 and GPT-5.6 routes, applicable reasoning variants, Claude Sonnet routes, and tenant-dependent `flux-3` / `flux-4` image labels. Legacy names remain request aliases where supported and are not advertised as separate upstream models.

Image labels use the Microsoft image route; different labels do not prove different underlying model weights. Images, file/audio attachments and candidate models require actual tenant validation. Realtime and live voice are not implemented. Only Microsoft-designated public reasoning summaries are forwarded; hidden reasoning is not inferred or exposed.

## Routing, recovery and bounds

- Global ordered single-active account routing. Standby accounts do not refresh credentials or open upstream connections.
- Account-scoped upstream serialization with a durable FIFO and a minimum one-second invocation interval.
- At most two accounts per logical request on reliable failures before Microsoft submission; no automatic replay after Microsoft accepted the invocation.
- Imminent cooldown recovery waits up to 12 seconds, with jitter and cancellation. A longer cooldown returns a retryable response.
- First real output defaults to 40 seconds. A saved administrator override remains unchanged. SignalR pings do not count as model output.
- Five-second SSE heartbeats and a shared ten-minute request deadline, including queueing and retry budgets. Account queueing remains bounded at 120 seconds.
- Failure before the Chat stream opens retains its HTTP status. Fast Responses preflight errors also retain their status; errors after stream commitment use explicit SSE failure terminals.
- `Retry-After` is retained as a bounded numeric duration through DO RPC, account cooldown and protocol error mapping.
- Explicit caps apply to request bodies, socket queues, frames, total output, tool definitions, history, aliases and diagnostic records. See the Chinese README and source constants for exact endpoint-specific bounds.

The project maintains stronger submission and session boundaries than a direct copy of upstream failover. [The upgrade matrix](UPGRADE-0.2.4.md) records every reviewed commit and every runtime-specific difference.

## Monitoring and language

Both administration asset bundles support Chinese and English. Use the language button in the lower right. The `m365_locale` preference stays in the current browser and applies across console, sign-in, MFA and diagnostic compatibility pages. User input, credentials, account labels and tool payloads are not generically translated.

`GET /api/metrics` requires an administrator session. It reports request and error counts, success/error rates, latency percentiles, endpoint breakdown and account health. All requests are counted, including semantic SSE failures with HTTP 200. Latency percentiles use bounded histogram bucket upper estimates; `latency_method` and `latency_bucket_bounds_ms` disclose the algorithm. The maximum recorded duration is exact. The window starts at upgrade or statistics reset. Serverless uptime is `null`, not a fabricated process lifetime.

The settings page can fetch these metrics. Diagnostic details remain bounded and sampled independently of exact aggregate counters. Sensitive request bodies, arbitrary exceptions, emails, credentials and tool results are excluded from diagnostic records.

## Deployment

Use **Node.js 22 or newer** for local tooling and the standalone server. Docker already uses Node 22.

```powershell
npm ci
npm run check
```

For Cloudflare, use `deploy-cloudflare.mjs`, `wrangler.jsonc` and `.dev.vars.example`. Keep production credentials in secrets and use existing account/KV identifiers when updating. See [production guidance](PRODUCTION.md) and [MFA deployment](MFA-DEPLOYMENT.md).

For Node/Docker, follow [server deployment](SERVER-DEPLOYMENT.md), using `.env.example`, `server.mjs`, `Dockerfile` or `docker-compose.yml`. Preserve the data directory, encryption key and tenant identity during upgrades.

R2 archives are optional. The deployment helper verifies a specified existing bucket; it does not create buckets or switch Cloudflare accounts. Arbitrary proxy pools, filesystem self-update, forced IPv4 and desktop autostart are outside this implementation.

## Validation

`npm run check` validates deployment helpers, functional-safety contracts, generated Worker types, TypeScript, both UI language contracts, the Worker regression suite and dry-run deployment. If optional relay source changes, run its Go tests separately.

For an explicitly configured candidate environment:

```powershell
$env:M365_GATEWAY_URL = "https://your-candidate-worker.workers.dev"
$env:M365_API_KEY = "your-candidate-api-key"
npm run probe:upstream
```

This serial probe checks the three SSE protocols for valid terminals, nonempty text, consecutive code fences and a final marker. Its report omits prompt, response and credential contents. Existing `scripts/full-functional.mjs` and `scripts/client-compat-functional.mjs` cover broader candidate and client checks. Run Codex, OpenCode and Hermes separately. Concurrency probes remain opt-in.

Local test success does not establish live tenant availability. Version 0.2.4 was prepared without deployment, production credentials or live upstream acceptance tests.
