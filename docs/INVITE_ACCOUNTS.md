# 邀请码账号模式

本分支在 LibreTV v2.16.12 上加入单机邀请码注册。默认 `AUTH_MODE=password` 沿用原全站密码；设置 `AUTH_MODE=accounts` 后使用个人账号，并拒绝旧 `/api/auth` 密码登录。账号模式必须通过 HTTPS 域名访问。

## 部署变量

```dotenv
AUTH_MODE=accounts
PUBLIC_ORIGIN=https://tv.luoxiaoji-task.top
BOOTSTRAP_TOKEN=<服务器上生成的 32 字节随机值，十六进制为 64 位>
BOOTSTRAP_TOKEN_EXPIRES_AT=<初始化凭证到期的 Unix 毫秒时间戳>
LIBRETV_DB_PATH=/app/data/accounts.sqlite
```

`BOOTSTRAP_TOKEN` 在服务器上用 `openssl rand -hex 32` 生成，切勿写入 Git 或聊天记录。`BOOTSTRAP_TOKEN_EXPIRES_AT` 可用 `date -u -d '+30 minutes' +%s000` 生成。首次访问站点时，所有者在“初始化管理员”表单中自行填写用户名、新密码和该凭证。创建成功后，删除 `.env` 中的两个初始化变量并重建容器；已有管理员时初始化接口始终拒绝第二次使用。

账号数据库保存在 `/app/data/accounts.sqlite`。Docker Compose 提供 `libretv-data` 命名卷；正式环境升级前备份现有 Compose 和卷，再执行镜像切换。SQLite WAL 会生成 `accounts.sqlite-wal` 与 `accounts.sqlite-shm`，备份时应使用 SQLite 在线备份或停止容器后复制整个数据目录，不能只复制主数据库文件。

当前 Dockerfile 运行用户是 `nextjs`。自定义 Compose 或 bind mount 须确保 `/app/data` 对该用户可写。Caddy 仍将外部 HTTPS 转发到容器内部 8080；生产环境的端口映射宜绑定 `127.0.0.1`。

中国内地服务器若访问 Alpine 官方仓库较慢，可在构建时传入 `--build-arg APK_MIRROR=mirrors.aliyun.com`，仅替换构建阶段的 Alpine 包仓库；默认仍使用官方仓库。

## 使用

- 管理员登录后从页面顶部“管理”进入 `/admin`，可批量生成最多 20 个邀请码，设置 1–30 天有效期。邀请码只显示一次，数据库仅存哈希。
- 注册人填写用户名、至少 12 位的个人密码和邀请码。邀请码一旦使用便不可重复注册。
- 管理员可撤销未使用的邀请码、停用/启用账号、生成 30 分钟内有效的一次性密码重置凭证。密码重置由用户本人在登录弹窗完成。
- 停用账号或完成密码重置会撤销该账号全部旧会话。已登录用户的当前会话最长 14 天。
- 观看进度和个人源设置仍保存在各设备浏览器中，不跨设备同步。

## 切换核对

1. 源码检查、类型检查、Lint、测试与构建通过；生产镜像在 Linux/Alpine 构建并启动，能实际写入数据库。
2. 隔离测试地址先完成管理员初始化、创建邀请码、注册普通用户、登录和搜索/播放。
3. 普通用户访问 `/api/admin/invites` 返回 403；未登录访问受保护 API 返回 401；原 `/api/auth` POST 返回 410。
4. 注销、停用、密码重置后的旧会话立即失效；容器重建后用户和邀请码仍在。
5. 正式域名状态接口显示 `authMode=accounts`，三个预置点播源保持原样；随后移除旧 `PASSWORD` 和初始化凭证。

回滚时需同时恢复旧镜像和 Compose。新账号数据库应保留供后续恢复，不可把旧共享密码模式长期与账号模式同时对外开放。
