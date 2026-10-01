# M365 Gateway 0.2.2 升级说明

本包在 0.2.1 上加固云端会话清理，并提供已登记会话管理与准确的复用统计。Durable Object SQLite 会自动新增所需表和统计列，不需要手工迁移。

## 升级

备份现有部署参数，保留 Worker 名称、Account ID、KV ID、Entra Client ID、R2/Relay 参数和所有 Secret。不要更换 `DATA_ENCRYPTION_KEY`。

```powershell
npm ci
npm run check
node .\deploy-cloudflare.mjs --update --account-id "原-Cloudflare-Account-ID" --name "原-Worker-名" --client-id "原-Entra-Client-ID" --kv-id "原-SENSITIVE_KV-ID"
```

## 变更与边界

- 清理云端对话前会核对最近 30 天登记的客户端会话；仍在使用的对话受保护。无法确认最后活动时间的云端记录会跳过，不会仅凭创建时间自动删除。
- 管理页可查看最近 500 条已登记的显式会话并重置；忙碌会话返回 409。临时会话不在列表中。
- 会话复用统计只计成功请求中真实续用已提交会话的命中与首次使用，不提供猜测的 Token 节省值。
- 趋势统计在当前分钟累计，跨分钟才归档历史桶；升级前的 0.2.1 趋势历史仍可继续读取。
- 若近期会话绑定超出保护检查上限，清理会停止并返回 `cleanup_protection_unavailable`，避免不完整检查后删除。

升级包不包含密钥、凭据、构建缓存或本地日志。发布本包不会自动部署你的线上 Worker。
