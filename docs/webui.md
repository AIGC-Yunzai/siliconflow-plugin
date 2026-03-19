# SF-Plugin WebUI 配置与使用指南

## 简介

SF-Plugin WebUI 是一个面向用户的 AI 对话界面，支持：
- **SS 对话**: OpenAI 格式对话
- **GG 对话**: Google Gemini 对话
- **DD 绘图**: 文生图功能
- **历史记录**: 多轮对话上下文记忆

与 Guoba-Plugin（管理后台）不同，WebUI 是一个**聊天平台**，可面向所有用户开放。

---

## 快速开始

### 1. 启用 WebUI

**方式一：通过 Guoba-Plugin 配置（推荐）**
1. 发送 `#锅巴` 打开 Guoba 面板
2. 找到 SF-Plugin 配置 → WebUI 设置
3. 启用并配置相关参数
4. 重启 Bot

**方式二：手动配置**
编辑 `config/config/config.yaml`：

```yaml
webUI:
  enable: true
  host: "0.0.0.0"
  port: 8082
  auth:
    type: "password"
    password: "your_password"
```

重启 Bot 后生效。

### 2. 访问 WebUI

查看 Bot 启动日志，找到类似输出：
```
[sf插件] WebUI 已启动
[sf插件] 本机访问: http://127.0.0.1:8082/
[sf插件] 局域网访问: http://192.168.x.x:8082/
```

在浏览器打开对应地址即可使用。

### 3. 登录方式

#### 密码登录（HTTPS 推荐）
1. 在设置面板选择"密码登录"
2. 输入配置的密码
3. 点击连接

#### 验证码登录（HTTP 推荐，最安全）
1. 在 QQ 向 Bot 发送 `#sf登录`
2. 查看 Bot 后台日志，获取 16 位验证码
3. 在 WebUI 选择"验证码登录"
4. 输入验证码，点击连接

---

## 配置选项详解

### 基础配置

#### `webUI.enable`
- **类型**: 布尔值
- **默认值**: `false`
- **说明**: 是否启用 WebUI 服务
- **生效**: 重启 Bot 或执行 `#sf设置webui开/关`

#### `webUI.host`
- **类型**: 字符串
- **默认值**: `"0.0.0.0"`
- **选项**:
  - `"0.0.0.0"` - 允许所有网络接口访问（公网/局域网）
  - `"127.0.0.1"` - 仅允许本机访问
- **生效**: 重启 Bot

#### `webUI.port`
- **类型**: 数字
- **默认值**: `8082`
- **说明**: WebUI 服务端口
- **生效**: 重启 Bot
- **注意**: 确保服务器防火墙开放此端口

#### `webUI.basePath`
- **类型**: 字符串
- **默认值**: `"/"`
- **说明**: 服务的挂载路径
- **示例**: `"/sf"` 则访问地址为 `http://host:port/sf`
- **生效**: 重启 Bot

### 认证配置

#### `webUI.auth.type`
- **类型**: 字符串
- **默认值**: `"password"`
- **选项**:
  - `"password"` - 密码登录（支持密码或验证码辅助）
  - `"code"` - 仅验证码登录（**最安全，推荐公网使用**）
  - `"none"` - 无需认证（**不推荐公网使用**）
- **生效**: 重启 Bot

#### `webUI.auth.password`
- **类型**: 字符串
- **默认值**: `""` (空)
- **说明**: 访问密码（明文存储）
- **建议**: 使用哈希存储更安全
- **生效**: 实时生效

#### `webUI.auth.passwordHash`
- **类型**: 字符串
- **默认值**: 未设置
- **说明**: 密码的 SHA-256 哈希值
- **生成方式**: 执行 `#sf生成密码哈希 your_password`
- **优先级**: 高于 `password` 字段
- **生效**: 实时生效

### HTTPS/TLS 配置

#### `webUI.tls.enable`
- **类型**: 布尔值
- **默认值**: `false`
- **说明**: 是否启用 HTTPS 加密
- **建议**: 公网访问**强烈建议**启用
- **生效**: 重启 Bot

#### `webUI.tls.cert`
- **类型**: 字符串
- **默认值**: `""`
- **说明**: SSL 证书文件路径（**绝对路径**）
- **示例**: `"/etc/letsencrypt/live/yourdomain.com/fullchain.pem"`
- **生效**: 重启 Bot

#### `webUI.tls.key`
- **类型**: 字符串
- **默认值**: `""`
- **说明**: SSL 私钥文件路径（**绝对路径**）
- **示例**: `"/etc/letsencrypt/live/yourdomain.com/privkey.pem"`
- **生效**: 重启 Bot

**HTTPS 证书获取方式：**
1. **Let's Encrypt**（免费，推荐）:
   ```bash
   certbot certonly --standalone -d yourdomain.com
   ```
2. **自签名证书**（本地测试）:
   ```bash
   openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem
   ```
3. **购买商业证书**: 从 SSL 证书提供商购买

### 安全配置

#### `webUI.security.allowedHosts`
- **类型**: 字符串数组
- **默认值**: `[]`
- **说明**: 允许的域名列表，空数组表示允许所有
- **示例**: `["chat.example.com", "ai.example.com"]`
- **生效**: 重启 Bot
- **用途**: 防止通过 IP 直接访问，强制使用域名

#### `webUI.security.blacklist`
- **类型**: 字符串数组
- **默认值**: `[]`
- **说明**: IP 黑名单，禁止访问的 IP 地址
- **示例**: `["192.168.1.100", "10.0.0.50"]`
- **生效**: 实时生效

#### `webUI.security.maxAuthAttempts`
- **类型**: 数字
- **默认值**: `5`
- **说明**: 最大认证失败次数，超过后锁定
- **设置**: `0` 表示不限制
- **生效**: 实时生效

#### `webUI.security.lockoutDuration`
- **类型**: 数字
- **默认值**: `300000` (5分钟，单位：毫秒)
- **说明**: 认证锁定时间
- **生效**: 实时生效

#### `webUI.security.cors.enable`
- **类型**: 布尔值
- **默认值**: `false`
- **说明**: 是否启用跨域支持
- **生效**: 重启 Bot

#### `webUI.security.cors.origins`
- **类型**: 字符串数组
- **默认值**: `[]`
- **说明**: 允许的跨域源域名
- **示例**: `["https://example.com"]`
- **生效**: 重启 Bot

### 日志配置

#### `webUI.logLevel`
- **类型**: 字符串
- **默认值**: `"info"`
- **选项**: `"debug"`, `"info"`, `"error"`
- **说明**: 日志记录级别
- **生效**: 实时生效

#### `webUI.security.accessLog`
- **类型**: 布尔值
- **默认值**: `true`
- **说明**: 是否启用访问日志
- **日志位置**: `data/sf-plugin/logs/webui-access.log`
- **生效**: 重启 Bot

---

## 配置示例

### 场景一：本地测试（无需认证）

适合仅在本地开发测试使用：

```yaml
webUI:
  enable: true
  host: "127.0.0.1"  # 仅本地访问
  port: 8082
  auth:
    type: "none"     # 无需认证
```

访问地址: `http://127.0.0.1:8082`

### 场景二：局域网共享（密码认证）

适合家庭/团队局域网共享：

```yaml
webUI:
  enable: true
  host: "0.0.0.0"    # 允许外部访问
  port: 8082
  auth:
    type: "password"
    passwordHash: "a3f5c8..."  # 使用 #sf生成密码哈希 生成
  security:
    maxAuthAttempts: 5
    lockoutDuration: 300000
```

访问地址: `http://192.168.x.x:8082` (局域网 IP)

### 场景三：公网生产环境（HTTPS + 验证码）

适合公网部署，最高安全性：

```yaml
webUI:
  enable: true
  host: "0.0.0.0"
  port: 443          # HTTPS 标准端口
  auth:
    type: "code"     # 仅验证码登录，最安全
  tls:
    enable: true
    cert: "/etc/letsencrypt/live/yourdomain.com/fullchain.pem"
    key: "/etc/letsencrypt/live/yourdomain.com/privkey.pem"
  security:
    allowedHosts: ["yourdomain.com"]
    maxAuthAttempts: 3
    lockoutDuration: 600000  # 10分钟
    accessLog: true
    cors:
      enable: true
      origins: ["https://yourdomain.com"]
```

访问地址: `https://yourdomain.com`
登录方式: QQ 发送 `#sf登录` 获取验证码

### 场景四：Nginx 反向代理

如果已有 Nginx，推荐此配置：

**Nginx 配置:**
```nginx
server {
    listen 443 ssl http2;
    server_name ai.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8082;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**SF-Plugin 配置:**
```yaml
webUI:
  enable: true
  host: "127.0.0.1"  # 仅允许本地访问，由 Nginx 代理
  port: 8082
  auth:
    type: "code"
```

---

## 命令参考

### #sf登录
- **权限**: 主人
- **说明**: 生成 WebUI 登录验证码
- **使用**: 在 QQ 发送 `#sf登录`，查看 Bot 后台日志获取验证码
- **有效期**: 5分钟
- **注意**: 有效期内重复发送命令不会生成新验证码

### #sf生成密码哈希 [密码]
- **权限**: 主人
- **说明**: 将明文密码转换为 SHA-256 哈希值
- **示例**: `#sf生成密码哈希 mypassword123`
- **用途**: 将输出的哈希值配置到 `webUI.auth.passwordHash`

### #sf设置webui开 / #sf设置webui关
- **权限**: 主人
- **说明**: 快速启用/关闭 WebUI 服务
- **注意**: 重启后失效，永久生效需修改配置

---

## 常见问题

**Q: 如何查看 WebUI 是否启动成功？**
A: 查看 Bot 启动日志，搜索 `[sf插件] WebUI 已启动`。

**Q: 启动失败，提示端口被占用？**
A: 修改 `webUI.port` 为其他端口，如 `8083`。

**Q: 无法从外网访问？**
A: 检查：
1. `webUI.host` 是否为 `"0.0.0.0"`
2. 服务器防火墙是否开放端口
3. 云服务器安全组是否放行端口

**Q: HTTPS 证书配置后无法启动？**
A: 检查：
1. 证书路径是否为绝对路径
2. 证书和私钥是否匹配
3. Bot 是否有权限读取证书文件

**Q: 验证码登录失败？**
A: 验证码5分钟过期，请在 QQ 重新发送 `#sf登录` 获取新验证码。

**Q: 如何查看访问日志？**
A: 日志文件位于 `data/sf-plugin/logs/webui-access.log`。

**Q: JWT token 有效期多久？**
A: 默认 24 小时，过期后需要重新登录。

**Q: 重启 Bot 后是否需要重新登录？**
A: 不需要，JWT Secret 已持久化保存到配置，token 继续有效。

---

## 安全建议

1. **公网使用必须启用认证**: 使用 `password` 或 `code` 模式
2. **优先使用 HTTPS**: 防止密码/Token 被中间人窃取
3. **使用验证码登录**: 相比密码登录更安全，无密码泄露风险
4. **配置域名白名单**: 防止通过 IP 直接访问
5. **启用访问日志**: 便于审计和排查安全问题
6. **定期更换密码**: 建议定期使用 `#sf生成密码哈希` 生成新密码

---

## 与 Guoba-Plugin 的区别

| 特性 | SF-Plugin WebUI | Guoba-Plugin |
|------|-----------------|--------------|
| **定位** | AI 对话平台 | Bot 管理后台 |
| **目标用户** | 所有用户 | 仅主人 |
| **功能** | 对话、绘图 | 插件配置、系统管理 |
| **认证** | 可配置 | 必须主人认证 |
| **界面** | 聊天界面 | 配置表单 |
| **实时性** | WebSocket 实时流式 | HTTP 请求响应 |

**总结**: 
- **Guoba-Plugin** 是用来**管理 Bot** 的（仅限主人）
- **SF-Plugin WebUI** 是用来**使用 AI** 的（可面向所有用户）
