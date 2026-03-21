# SF-Plugin WebUI 使用指南

## 简介

SF-Plugin WebUI 是一个面向用户的本地 AI 对话界面，支持：

- **SS 对话**：OpenAI 格式 API 对话（多轮上下文）
- **GG 对话**：Google Gemini 对话
- **DD 绘图**：文生图功能
- **预设系统**：全局预设与个人预设管理
- **用户管理**：审批模式、黑白名单（主人专属）

> 与 Guoba-Plugin（Bot 管理后台）不同，WebUI 是一个**聊天平台**，可面向所有用户开放。

---

## 快速开始

### 1. 启用 WebUI

**方式一：通过 Guoba-Plugin 配置（推荐）**

1. 发送 `#锅巴` 打开 Guoba 面板
2. 找到 SF-Plugin 配置 → WebUI 设置
3. 将 `webUI.enable` 设为 `true` 并配置端口等参数
4. 重启 Bot

**方式二：手动编辑配置**

编辑 `config/config/config.yaml`：

```yaml
webUI:
  enable: true
  host: "0.0.0.0"
  http:
    enable: true
    port: 8082
  auth:
    type: "code"   # 推荐：验证码登录
```

重启 Bot 后生效。

### 2. 访问地址

Bot 启动时日志会打印访问地址：

```
[sf插件] 本机访问: http://127.0.0.1:8082/
[sf插件] 局域网访问: http://192.168.x.x:8082/
[sf插件] IPv6 访问: http://[::1]:8082/
```

在浏览器打开对应地址即可。

### 3. 登录

#### 验证码登录（推荐）

1. 在 QQ 向 Bot 发送 `#sf登录`
2. Bot 会通过**私聊**发送 16 位一次性验证码（5 分钟有效）
3. 在 WebUI 输入 QQ 号和验证码，点击登录

#### 密码登录

1. 先用验证码登录后，在设置中配置个人密码
2. 以后可直接用 QQ 号 + 密码登录

---

## 用户权限与审批

WebUI 支持三种权限模式，通过 `webUI.security.approvalMode` 配置：

| 模式 | 说明 |
|------|------|
| `auto`（默认） | 所有人可直接使用，无需申请 |
| `approval` | 用户需申请，等待主人批准后方可使用 |
| `master_only` | 仅主人可使用 |

### 用户申请流程（`approval` 模式）

1. 用户发送 `#sf申请webui` 提交申请
2. Bot 自动私聊通知主人
3. 主人发送 `#sf批准 QQ号` 批准，或 `#sf拒绝 QQ号` 拒绝
4. 用户收到结果通知后即可使用 `#sf登录` 登录

### QQ 命令速查

发送 `#sfweb帮助` 查看完整的 WebUI 相关命令列表，主要命令如下：

**用户命令：**

| 命令 | 说明 |
|------|------|
| `#sf登录` | 获取一次性登录验证码（5 分钟有效） |
| `#sf申请webui` | 申请 WebUI 使用权限（审批模式下） |
| `#sf我的webui状态` | 查看自己的权限状态 |
| `#sf登录历史` | 查看最近登录记录 |

**主人命令：**

| 命令 | 说明 |
|------|------|
| `#sf批准列表` | 查看待审批申请（带序号） |
| `#sf批准 序号/QQ号` | 批准指定用户，支持逗号分隔批量操作 |
| `#sf批准 全部` | 一键批准所有待审批申请 |
| `#sf拒绝 序号/QQ号` | 拒绝申请，支持批量 |
| `#sf拉黑 QQ号` | 拉黑用户，禁止其使用 WebUI |
| `#sf解封 QQ号` | 解除黑名单 |
| `#sf白名单` | 查看已批准用户列表 |
| `#sf黑名单` | 查看黑名单列表 |
| `#sf在线用户` | 查看当前在线用户 |
| `#sf强制下线 QQ号` | 踢出指定用户，Token 立即失效 |
| `#sf轮换webui密钥` | 强制刷新 JWT Secret，所有人需重新登录 |

---

## 配置项详解

### 基础配置

```yaml
webUI:
  enable: false        # 是否启用
  host: "0.0.0.0"     # 监听地址（0.0.0.0=所有接口，127.0.0.1=仅本机）
  basePath: "/"        # 挂载路径，如 "/sf" 则访问地址为 host:port/sf
  logLevel: "info"     # 日志级别：debug / info / error
```

### HTTP 配置

```yaml
webUI:
  http:
    enable: true            # 是否启用 HTTP
    port: 8082              # HTTP 端口
    redirectToHttps: false  # 是否将 HTTP 请求自动跳转到 HTTPS
```

### HTTPS/TLS 配置

```yaml
webUI:
  tls:
    enable: false      # 是否启用 HTTPS
    port: 8443         # HTTPS 端口（与 HTTP 端口不同）
    cert: ""           # SSL 证书文件绝对路径
    key: ""            # SSL 私钥文件绝对路径
    autoGenerate: false  # 自动生成自签名证书（保存到 data/sf-plugin/certs/）
```

**证书获取方式：**

- **Let's Encrypt**（免费，推荐）：`certbot certonly --standalone -d yourdomain.com`
- **自动生成自签名**：设置 `autoGenerate: true`，无需手动操作，浏览器会提示"不安全"需手动信任
- **商业证书**：从 SSL 提供商购买后填写路径

### 认证配置

```yaml
webUI:
  auth:
    type: "code"    # password / code / none
    password: ""    # 全局密码（明文，不推荐公网使用）
```

| `type` 值 | 说明 | 适用场景 |
|-----------|------|----------|
| `code` | 仅验证码登录，无固定密码 | 公网，最安全 |
| `password` | 密码或验证码均可登录 | 局域网 |
| `none` | 无需认证 | 仅本机开发测试 |

### 安全配置

```yaml
webUI:
  security:
    approvalMode: "auto"      # auto / approval / master_only
    onlyMaster: false         # true 时等同于 master_only
    maxAuthAttempts: 5        # 最大认证失败次数，超过后锁定 IP
    lockoutDuration: 300000   # 锁定时长（毫秒，默认 5 分钟）
    rateLimit: true           # 是否启用请求频率限制
    maxRequests: 100          # 每分钟最大请求数
    accessLog: true           # 是否记录访问日志
    allowedHosts: []          # WebSocket 域名白名单（空=允许所有）
    blacklist: []             # IP 黑名单
    jwtRotateInterval: 2592000000  # JWT Secret 自动轮换间隔（毫秒，默认 30 天）
    cors:
      enable: false           # 是否启用 CORS 跨域
      origins: []             # 允许的跨域源（空=允许所有）
```

---

## 配置场景示例

### 场景一：本地测试

```yaml
webUI:
  enable: true
  host: "127.0.0.1"
  http:
    port: 8082
  auth:
    type: "none"
  security:
    approvalMode: "auto"
```

### 场景二：局域网共享

```yaml
webUI:
  enable: true
  host: "0.0.0.0"
  http:
    port: 8082
  auth:
    type: "code"
  security:
    approvalMode: "approval"   # 需要主人审批
    maxAuthAttempts: 5
```

### 场景三：公网 HTTPS（有域名）

```yaml
webUI:
  enable: true
  host: "0.0.0.0"
  http:
    enable: true
    port: 80
    redirectToHttps: true      # HTTP 自动跳转 HTTPS
  tls:
    enable: true
    port: 443
    cert: "/etc/letsencrypt/live/yourdomain.com/fullchain.pem"
    key: "/etc/letsencrypt/live/yourdomain.com/privkey.pem"
  auth:
    type: "code"
  security:
    approvalMode: "approval"
    allowedHosts: ["yourdomain.com"]
```

### 场景四：Nginx 反向代理

**Nginx 配置：**

```nginx
server {
    listen 443 ssl http2;
    server_name ai.example.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8082;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**SF-Plugin 配置：**

```yaml
webUI:
  enable: true
  host: "127.0.0.1"    # 仅允许 Nginx 本地代理访问
  http:
    port: 8082
  auth:
    type: "code"
```

---

## 常见问题

**Q: 发送 `#sf登录` 没有收到验证码？**
A: 确认 WebUI 已启用（`webUI.enable: true`），且 Bot 能向你的 QQ 发送私聊消息。

**Q: 验证码登录失败？**
A: 验证码 5 分钟后过期，请重新发送 `#sf登录` 获取新验证码。

**Q: 端口被占用启动失败？**
A: 修改 `webUI.http.port` 为其他端口（如 8083），重启 Bot。

**Q: 无法从外网访问？**
A: 检查 `host` 是否为 `"0.0.0.0"`，以及服务器防火墙/安全组是否开放对应端口。

**Q: HTTPS 启动失败？**
A: 检查证书路径是否为绝对路径，`cert` 和 `key` 是否填写正确（注意不要交换）。也可设置 `tls.autoGenerate: true` 自动生成自签名证书。

**Q: Token 多久失效？**
A: JWT Token 有效期 24 小时。重启 Bot 不会使 Token 失效（Secret 持久化存储）。主人可发送 `#sf轮换webui密钥` 立即使所有 Token 失效。

**Q: 如何查看访问日志？**
A: 日志文件位于 `data/sf-plugin/logs/webui-access.log`，管理员操作日志在 `webui-admin.log`。

---

## 安全建议

1. **公网必须启用认证**：使用 `code` 或 `password` 模式，切勿使用 `none`
2. **优先使用 HTTPS**：防止 Token 被中间人截获；无域名时可配合 Nginx 或开启 `autoGenerate`
3. **使用验证码登录**：相比固定密码，验证码一次性使用，更难被暴力破解
4. **审批模式对外开放**：公开使用建议设置 `approvalMode: "approval"`，防止陌生人直接使用 AI 接口
5. **启用访问日志**：`accessLog: true` 便于审计异常访问
6. **定期轮换密钥**：发送 `#sf轮换webui密钥` 或配置 `jwtRotateInterval` 自动定期轮换

---

## 与 Guoba-Plugin 的区别

| 特性 | SF-Plugin WebUI | Guoba-Plugin |
|------|-----------------|--------------|
| **定位** | AI 对话平台 | Bot 管理后台 |
| **目标用户** | 可面向所有用户 | 仅主人 |
| **功能** | 对话、绘图、预设管理 | 插件配置、系统管理 |
| **认证** | 可配置多种方式 | 必须主人认证 |
| **实时性** | WebSocket 流式响应 | HTTP 请求响应 |
