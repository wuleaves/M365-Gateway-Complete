# 管理后台 MFA 升级说明

本升级包把管理后台登录改为：管理员密码 → 选择 Google Authenticator TOTP 或 Passkey/WebAuthn → 成功后签发 HttpOnly 管理员 Cookie。

## Cloudflare Secret

在目标 Worker 中设置：

```text
ADMIN_TOTP_SECRET=<Google Authenticator 使用的 Base32 密钥>
```

同一个 TOTP 密钥不要复用于其他系统。升级前应在离线密码库保存备份；丢失后只能按受控恢复流程重新配置。

## WebAuthn 域名

固定配置如下：

```text
Origin: https://m365.gongyikeyanapi.com
RP ID:  m365.gongyikeyanapi.com
```

推荐在管理员后台“系统设置 → 通行密钥 Passkey”中注册设备。注册时需要已有的管理员会话（密码 + Google Authenticator），浏览器完成 Touch ID、iCloud Keychain 或硬件密钥确认后，Worker 只保存公钥。

`ADMIN_PASSKEY_CREDENTIALS` 仍支持首次部署时预置已有公钥，格式为 JSON 数组：

```json
[
  {
    "id": "base64url-credential-id",
    "publicKey": {
      "kty": "EC",
      "crv": "P-256",
      "x": "base64url-x",
      "y": "base64url-y",
      "ext": true
    },
    "signCount": 0,
    "label": "管理员 MacBook"
  }
]
```

如果暂时没有配置 Passkey，登录页只显示 Google Authenticator 选项。不要把私钥或完整 Passkey 导出数据放进 Worker Secret；这里只保存公钥。

## 登录限制

- 密码错误达到 10 次：同一 IP 锁定 30 分钟。
- 连续累计错误达到 20 次：同一 IP 加入长期黑名单。
- TOTP/Passkey 验证失败也必须由客户端重新开始密码登录流程。
- 密码验证成功后只生成 5 分钟 MFA challenge，不创建管理员会话。
- 二次验证成功后才生成 24 小时 HttpOnly 会话 Cookie。

## 部署前检查

1. 确认 DNS 已将 `m365.gongyikeyanapi.com` 指向目标 Worker。
2. 确认自定义域名使用 HTTPS。
3. 设置 `ADMIN_TOTP_SECRET`，不要写入 `wrangler.jsonc` 或 Git。
4. 首次部署先只启用 TOTP，完成登录验证后再加入 Passkey 公钥。
5. 连续测试错误 10 次、30 分钟锁定、20 次黑名单和正确 TOTP 登录。
6. 生产环境可再用 Cloudflare Access 作为外层保护，但它与本包的应用内 MFA 是两层独立认证。

本包不包含真实 TOTP 密钥、Passkey 私钥、管理员密码或 Cloudflare 账号信息。

## 更新已有 Cloudflare Worker

部署器兼容以下变量和参数。请先在当前终端填入真实的 32 字节 base64url 密钥；部署器只会把它写入一次性临时 Secret 文件，完成后删除：

```bash
export M365_COMPACTION_ENCRYPTION_KEY='由你自行填入的密钥'

node deploy-cloudflare.mjs \
  --update \
  --sync-compaction-key \
  --yes \
  --account-id "d28c99323306403f017b357da494b1ec" \
  --name "m365-gateway-cloudflare" \
  --client-id "c0ab8ce9-e9a0-42e7-b064-33d422df41f1" \
  --kv-id "2c6b07e8a09e484ab24c27556fce7d86"
```

`M365_COMPACTION_ENCRYPTION_KEY` 只作为部署器输入名，Worker 内部 Secret 名称是 `COMPACTION_ENCRYPTION_KEY`。更新前确认原 Worker 的 `DATA_ENCRYPTION_KEY`、KV 和 `ADMIN_TOTP_SECRET` 均保留。
