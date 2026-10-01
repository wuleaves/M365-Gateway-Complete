# M365 Gateway 0.2.1 升级说明

本包在 0.2.0 上增加图片模型校验和真实用量趋势。Durable Object SQLite 会在首次访问时创建分钟统计表，无需手工执行 SQL；原有账号、密钥和会话保持不变。

## 更新步骤

保留当前 Cloudflare Worker 名称、Account ID、KV ID、Entra Client ID 和 Secret。尤其不要更换 `DATA_ENCRYPTION_KEY`。备份现有部署参数后运行：

```powershell
npm ci
npm run check
node .\deploy-cloudflare.mjs --update --account-id "原-Cloudflare-Account-ID" --name "原-Worker-名" --client-id "原-Entra-Client-ID" --kv-id "原-SENSITIVE_KV-ID"
```

如使用 R2 冷归档或固定出口 Relay，继续传入原来的参数。

## 变更

- 图片生成、编辑、变体端点只接受省略 `model` 或明确指定 `m365-image`；其他模型返回 `invalid_image_model`，不再静默改用图片模型。
- 管理页趋势图显示真实请求数，支持 24 小时和 7 天视图，按管理页所选时区分桶；短于一小时的记录按分钟显示。
- 新趋势仅统计部署 0.2.1 后的请求，不会用旧版的抽样诊断记录伪造历史数据；数据保留 7 天。
- 仪表盘提供添加账号、创建密钥、查看会话和近期诊断快捷入口。
- 上游 HTTP 503 明确标记为服务过载，仍可触发已有的账号故障转移。

升级包不包含密钥、凭据、构建缓存或本地日志。常驻 WebSocket 连接预热属于 Go 服务器生命周期，不在 Cloudflare Worker 中启用。
