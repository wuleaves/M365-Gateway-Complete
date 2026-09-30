# M365 Gateway 0.2.0 升级说明

本包可直接替换 0.1.4 源码，Durable Object SQLite 会在首次请求时自动新建会话登记、分维度统计等表，不需要手工执行 SQL。

## 升级前

1. 备份当前代码和部署参数。
2. 保留原 Cloudflare Worker 名称、Account ID、`SENSITIVE_KV` ID、Entra Client ID 和所有 Secret。
3. 不要重新生成 `DATA_ENCRYPTION_KEY`，否则旧 OAuth 密文无法解密。

## 更新步骤

```powershell
npm ci
npm run check
node .\deploy-cloudflare.mjs --update --account-id "原-Cloudflare-Account-ID" --name "原-Worker-名" --client-id "原-Entra-Client-ID" --kv-id "原-SENSITIVE_KV-ID"
```

如使用 R2 冷归档或固定出口 Relay，继续传入原有参数，不要在升级时切换存储或 Relay 密钥。

## 主要新增

- Anthropic thinking、显式会话管理、文件/音频附件和首输出超时。
- OpenAI 兼容生图、编辑和变体端点（需租户支持 `m365-image`）。
- Microsoft 365 云端会话、记忆、自定义指令、插件和 MCP 接口。
- 可持久化的模型别名/tone、账号健康批量操作、API-Key/模型/端点统计与 Relay 健康检查。

## 兼容注意

- `m365-image`、云端会话和个性化端点都取决于 Microsoft 365 租户权限。若返回 `account_reauthorization_required`，请在管理页重新授权该账号；若租户未向自定义 Entra 应用开放相应资源，功能会保持可预期的受限状态。
- 写入记忆、删除云端对话、运行时模型配置和账号批量操作都要求管理员会话。
- 本地自启动、文件系统自更新、任意 HTTP/SOCKS 代理池和完整上游正文日志没有加入 Cloudflare 版。

## 验收

发布包已通过 28 个测试文件、516 项测试、TypeScript 类型检查、管理界面契约检查、功能安全检查和 Cloudflare dry-run 构建。
