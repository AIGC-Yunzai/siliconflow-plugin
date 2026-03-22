import express from 'express'
import { createServer as createHttpServer } from 'http'
import { createServer as createHttpsServer } from 'https'
import { WebSocketServer } from 'ws'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'
import crypto, { createHash, randomBytes, generateKeyPairSync } from 'crypto'
import { readFileSync, appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import jwt from 'jsonwebtoken'
import Config from './Config.js'
import * as auth from '../utils/auth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const TOKEN_EXPIRES_IN = '24h'

/**
 * WebUI 服务器管理类
 * 提供 HTTP/HTTPS 服务和 WebSocket 实时通信
 */
class WebUIServer {
  constructor() {
    this.app = null
    this.server = null
    this.httpServer = null  // HTTP 服务器（用于自动跳转）
    this.wss = null
    this.isRunning = false
    // 安全相关
    this.authAttempts = new Map() // IP -> { count, lastAttempt }
    this.authenticatedTokens = new Map() // 已认证的 token -> { ip, createdAt }
    // 证书缓存
    this.autoCertPath = null
    this.autoKeyPath = null
  }

  /**
   * 自动生成自签名证书
   * @returns {{cert: string, key: string}} 证书和密钥路径
   */
  generateSelfSignedCert() {
    const certsDir = path.join(process.cwd(), 'data', 'sf-plugin', 'certs')
    if (!existsSync(certsDir)) {
      mkdirSync(certsDir, { recursive: true })
    }
    
    const certPath = path.join(certsDir, 'webui.crt')
    const keyPath = path.join(certsDir, 'webui.key')
    
    // 如果证书已存在且未过期（30天内），直接返回
    if (existsSync(certPath) && existsSync(keyPath)) {
      try {
        const certStat = readFileSync(certPath)
        const cert = new crypto.X509Certificate(certStat)
        const validTo = new Date(cert.validTo)
        const daysUntilExpire = (validTo - Date.now()) / (1000 * 60 * 60 * 24)
        
        if (daysUntilExpire > 30) {
          logger.mark('[sf插件] 使用现有自签名证书，有效期还剩 ' + Math.floor(daysUntilExpire) + ' 天')
          return { cert: certPath, key: keyPath }
        }
      } catch (e) {
        // 证书读取失败，重新生成
      }
    }
    
    try {
      logger.mark('[sf插件] 正在生成自签名证书...')
      
      // 生成 RSA 密钥对
      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      })
      
      // 获取服务器 IP
      const interfaces = os.networkInterfaces()
      const ips = []
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            ips.push(iface.address)
          }
        }
      }
      
      // 创建证书主题
      const subject = '/CN=SF-WebUI'
      const altNames = ips.map(ip => `IP:${ip}`).join(',')
      
      // 使用 openssl 生成证书（更可靠）
      
      // 先保存私钥
      writeFileSync(keyPath, privateKey)
      
      // 生成证书签名请求和自签名证书
      const subj = altNames ? `/CN=SF-WebUI/subjectAltName=${altNames}` : '/CN=SF-WebUI'
      execSync(`openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days 365 -subj "${subject}" -addext "subjectAltName=${altNames || 'DNS:localhost'}"`, {
        stdio: 'ignore'
      })
      
      logger.mark(`[sf插件] 自签名证书已生成：`)
      logger.mark(`  证书: ${certPath}`)
      logger.mark(`  密钥: ${keyPath}`)
      logger.mark(`[sf插件] 证书指纹查看命令：openssl x509 -in "${certPath}" -noout -fingerprint -sha256`)
      
      return { cert: certPath, key: keyPath }
    } catch (error) {
      logger.error('[sf插件] 生成自签名证书失败:', error.message)
      throw new Error('自动生成证书失败，请手动配置证书或使用 HTTP 模式')
    }
  }

  /**
   * 获取 Bot 主人列表
   * @returns {string[]} 主人 QQ 号列表
   */
  getMasterList() {
    const masters = new Set()

    try {
      // 方式1: 从 Yunzai 运行时配置读取（包括 stdin 插件设置的主人）
      try {
        // TRSS-Yunzai / Yunzai-Bot 的 Bot 配置
        if (typeof Bot !== 'undefined' && Bot.config) {
          logger.mark(`[sf插件][getMasterList] Bot.config 存在: ${JSON.stringify(Bot.config)}`)

          // masterQQ 字段（简单列表）
          const botMastersQQ = Bot.config.masterQQ || Bot.config.master_qq
          if (botMastersQQ) {
            logger.mark(`[sf插件][getMasterList] Bot.config.masterQQ: ${JSON.stringify(botMastersQQ)}`)
            if (Array.isArray(botMastersQQ)) {
              botMastersQQ.forEach(m => masters.add(String(m)))
            } else {
              masters.add(String(botMastersQQ))
            }
          }

          // master 字段（TRSS-Yunzai 格式：BotQQ:主人QQ）
          const botMaster = Bot.config.master
          if (botMaster) {
            logger.mark(`[sf插件][getMasterList] Bot.config.master: ${JSON.stringify(botMaster)}`)
            if (Array.isArray(botMaster)) {
              botMaster.forEach(m => {
                const masterQQ = this.parseMasterEntry(m)
                if (masterQQ) masters.add(masterQQ)
              })
            } else {
              const masterQQ = this.parseMasterEntry(botMaster)
              if (masterQQ) masters.add(masterQQ)
            }
          }
        }

        // 尝试从全局 config 对象读取（Yunzai V3）
        if (typeof config !== 'undefined' && config) {
          logger.mark(`[sf插件][getMasterList] 全局 config 存在`)

          // masterQQ 字段
          const cfgMastersQQ = config.masterQQ || config.master_qq
          if (cfgMastersQQ) {
            logger.mark(`[sf插件][getMasterList] config.masterQQ: ${JSON.stringify(cfgMastersQQ)}`)
            if (Array.isArray(cfgMastersQQ)) {
              cfgMastersQQ.forEach(m => masters.add(String(m)))
            } else {
              masters.add(String(cfgMastersQQ))
            }
          }
          // master 字段（TRSS-Yunzai 格式）
          const cfgMaster = config.master
          if (cfgMaster && !Bot?.config?.master) {  // 避免重复读取
            logger.mark(`[sf插件][getMasterList] config.master: ${JSON.stringify(cfgMaster)}`)
            if (Array.isArray(cfgMaster)) {
              cfgMaster.forEach(m => {
                const masterQQ = this.parseMasterEntry(m)
                if (masterQQ) masters.add(masterQQ)
              })
            } else {
              const masterQQ = this.parseMasterEntry(cfgMaster)
              if (masterQQ) masters.add(masterQQ)
            }
          }
        }
      } catch (e) {
        logger.error('[sf插件][getMasterList] 读取运行时配置出错:', e)
      }

      // 方式2: 从 other.yaml 读取（TRSS-Yunzai 配置）
      const otherConfigPath = path.join(process.cwd(), 'config', 'config', 'other.yaml')
      logger.mark(`[sf插件][getMasterList] 检查 other.yaml: ${otherConfigPath}`)
      if (existsSync(otherConfigPath)) {
        const content = readFileSync(otherConfigPath, 'utf8')
        logger.mark(`[sf插件][getMasterList] other.yaml 内容长度: ${content.length}`)

        // masterQQ 字段
        const masterQQMatch = content.match(/masterQQ:\s*\n((?:\s*-\s*.+\n?)+)/)
        if (masterQQMatch) {
          logger.mark(`[sf插件][getMasterList] other.yaml masterQQ 匹配: ${masterQQMatch[1]}`)
          const lines = masterQQMatch[1].split('\n')
          lines.forEach(line => {
            const match = line.match(/-\s*"?([^"\n]+)"?/)
            if (match) {
              const masterQQ = this.parseMasterEntry(match[1])
              if (masterQQ) masters.add(masterQQ)
            }
          })
        } else {
          logger.mark(`[sf插件][getMasterList] other.yaml 未匹配到 masterQQ`)
        }

        // master 字段（BotQQ:主人QQ 格式）
        const masterMatch = content.match(/master:\s*\n((?:\s*-\s*.+\n?)+)/)
        if (masterMatch) {
          logger.mark(`[sf插件][getMasterList] other.yaml master 匹配: ${masterMatch[1]}`)
          const lines = masterMatch[1].split('\n')
          lines.forEach(line => {
            const match = line.match(/-\s*"?([^"\n]+)"?/)
            if (match) {
              const masterQQ = this.parseMasterEntry(match[1])
              if (masterQQ) masters.add(masterQQ)
            }
          })
        }
      } else {
        logger.mark(`[sf插件][getMasterList] other.yaml 不存在`)
      }

      // 方式3: 从 config.yaml 读取
      const yunzaiConfigPath = path.join(process.cwd(), 'config', 'config.yaml')
      if (existsSync(yunzaiConfigPath)) {
        const content = readFileSync(yunzaiConfigPath, 'utf8')
        // 简单解析 YAML 中的 master 字段
        const masterMatch = content.match(/master:\s*\n((?:\s*-\s*\d+\n?)+)/)
        if (masterMatch) {
          const cfgMasters = masterMatch[1].match(/\d+/g)
          if (cfgMasters) cfgMasters.forEach(m => masters.add(m))
        }
        // 尝试匹配 master_qq 字段
        const masterQQMatch = content.match(/master_qq:\s*\n((?:\s*-\s*\d+\n?)+)/)
        if (masterQQMatch) {
          const cfgMasters = masterQQMatch[1].match(/\d+/g)
          if (cfgMasters) cfgMasters.forEach(m => masters.add(m))
        }
      }

      // 方式4: 从本插件配置读取
      try {
        const config = Config.getConfig()
        if (config.webUI?.masters) {
          if (Array.isArray(config.webUI.masters)) {
            config.webUI.masters.forEach(m => masters.add(String(m)))
          } else {
            masters.add(String(config.webUI.masters))
          }
        }
      } catch (e) {
        // 忽略配置读取错误
      }

      const result = Array.from(masters)
      logger.mark(`[sf插件][getMasterList] 最终主人列表: ${JSON.stringify(result)}`)
      return result
    } catch (error) {
      logger.error('[sf插件] 获取主人列表失败:', error)
      return Array.from(masters)
    }
  }

  /**
   * 解析主人配置条目
   * 支持格式：
   * - "123456" (普通QQ号)
   * - "stdin" (stdin用户)
   * - "botQQ:masterQQ" (TRSS-Yunzai格式，如 "2569963011:2391840453")
   * @param {string} entry 配置条目
   * @returns {string|null} 主人QQ号或null
   */
  parseMasterEntry(entry) {
    if (!entry) return null
    
    const entryStr = String(entry).trim()
    
    // TRSS-Yunzai 格式：BotQQ:主人QQ
    if (entryStr.includes(':')) {
      const parts = entryStr.split(':')
      if (parts.length === 2) {
        // 返回冒号后面的主人QQ
        const masterQQ = parts[1].trim()
        return masterQQ || null
      }
    }
    
    // 普通格式，直接返回
    return entryStr || null
  }

  /**
   * 检查 QQ 号是否是主人
   * @param {string} qq QQ 号
   * @returns {boolean}
   */
  isMaster(qq) {
    if (!qq) {
      logger.debug('[sf插件][isMaster] 传入 qq 为空，返回 false')
      return false
    }

    const qqStr = String(qq).trim()

    // 调试日志 - 始终输出，帮助诊断问题
    logger.mark(`[sf插件][isMaster] 检查 QQ: "${qqStr}"`)

    // 特殊处理 stdin 用户（本地控制台用户）
    if (qqStr === 'stdin' || qqStr === '标准输入') {
      logger.mark(`[sf插件][isMaster] stdin 用户直接识别为主人`)
      return true
    }

    const masters = this.getMasterList()

    // 始终输出主人列表用于调试
    logger.mark(`[sf插件][isMaster] 主人列表: ${JSON.stringify(masters)}`)

    const result = masters.includes(qqStr)
    logger.mark(`[sf插件][isMaster] QQ "${qqStr}" 是否主人: ${result}`)
    return result
  }

  /**
   * 启动 WebUI 服务
   * 支持 HTTP/HTTPS 同时监听、自动证书生成
   */
  async start() {
    const config = Config.getConfig()
    
    // 检查是否启用 WebUI
    if (!config.webUI?.enable) {
      logger.debug('[sf插件] WebUI 未启用，跳过启动')
      return false
    }

    // 如果已经在运行，先停止
    if (this.isRunning) {
      await this.stop()
    }

    // 检查并轮换 JWT Secret
    const { rotateJwtSecret, getJwtSecret } = await import('../utils/auth.js')
    rotateJwtSecret() // 自动轮换（如果到期）
    getJwtSecret() // 确保 Secret 存在

    // 迁移旧版全局预设（从 config.presets 到文件存储）
    try {
      const { migrateGlobalPresets } = await import('../utils/presetManager.js')
      if (config.presets && Array.isArray(config.presets) && config.presets.length > 0) {
        const migrated = migrateGlobalPresets(config.presets)
        if (migrated > 0) {
          // 清空 config.presets 避免重复迁移
          config.presets = []
          Config.setConfig(config)
          logger.mark(`[sf插件] 已将 ${migrated} 个全局预设迁移到文件存储`)
        }
      }
    } catch (migrateError) {
      logger.error('[sf插件] 迁移全局预设失败:', migrateError)
    }

    try {
      const { 
        host = '0.0.0.0', 
        port = 8082, 
        basePath = '/',
        http,
        tls 
      } = config.webUI
      const wsConfig = config.webUI?.websocket || {}
      
      // 解析新配置（兼容旧配置）
      const httpConfig = http || { enable: true, port: port, redirectToHttps: false }
      const httpsConfig = tls || { enable: false, port: 8443, autoGenerate: false }
      
      // 确定监听端口
      const httpPort = httpConfig.port || port
      const httpsPort = httpsConfig.port || 8443
      const enableHttp = httpConfig.enable !== false
      const enableHttps = httpsConfig.enable === true
      const redirectToHttps = enableHttp && enableHttps && httpConfig.redirectToHttps === true

      // 创建 Express 应用
      this.app = express()

      // 安全中间件
      this.setupSecurityMiddleware(config.webUI)

      // 中间件
      this.app.use(express.json())
      this.app.use(express.urlencoded({ extended: true }))

      // 短链接登录路由（必须在静态文件之前，返回 index.html 让前端处理）
      this.app.get('/login/:code', (req, res) => {
        const indexPath = path.join(__dirname, '../server/static/index.html')
        res.sendFile(indexPath)
      })

      // 静态文件服务
      const staticPath = path.join(__dirname, '../server/static')
      this.app.use(basePath, express.static(staticPath))

      // API 路由
      this.setupRoutes()

      // HTTPS 服务器
      if (enableHttps) {
        let key, cert
        let certPath = httpsConfig.cert
        let keyPath = httpsConfig.key
        
        // 自动生成证书
        if (httpsConfig.autoGenerate && (!httpsConfig.key || !httpsConfig.cert)) {
          const generated = this.generateSelfSignedCert()
          certPath = generated.cert
          keyPath = generated.key
          this.autoCertPath = certPath
          this.autoKeyPath = keyPath
        }
        
        try {
          if (certPath && keyPath) {
            key = readFileSync(keyPath)
            cert = readFileSync(certPath)
          } else {
            throw new Error('未配置证书路径且未启用自动生成')
          }
          
          this.server = createHttpsServer({ key, cert }, this.app)
          this.isHttps = true
          logger.mark(`[sf插件] WebUI HTTPS 服务已配置，端口: ${httpsPort}`)
          
          // 如果有 HTTP 且需要跳转，添加跳转中间件
          if (redirectToHttps) {
            logger.mark('[sf插件] HTTP 请求将自动跳转到 HTTPS')
          }
        } catch (error) {
          logger.error('[sf插件] 读取 SSL 证书失败:', error.message)
          logger.error('[sf插件] 如需自动生成证书，请设置 webUI.tls.autoGenerate: true')
          throw new Error(`SSL 证书配置错误: ${error.message}`)
        }
      }
      
      // HTTP 服务器（可能用于跳转或并存）
      if (enableHttp && !redirectToHttps) {
        // 纯 HTTP 模式
        this.httpServer = createHttpServer(this.app)
        this.isHttpMode = true
        logger.mark(`[sf插件] WebUI HTTP 服务已配置，端口: ${httpPort}`)
      } else if (enableHttp && redirectToHttps) {
        // HTTP 仅用于跳转
        const redirectApp = express()
        redirectApp.use((req, res) => {
          const reqHostname = req.headers.host?.split(':')[0] || 'localhost'
          res.redirect(301, `https://${reqHostname}:${httpsPort}${req.url}`)
        })
        this.httpServer = createHttpServer(redirectApp)
        logger.mark(`[sf插件] WebUI HTTP 跳转服务已配置，端口: ${httpPort} -> ${httpsPort}`)
      }

      // WebSocket 服务（绑定到主服务器）
      if (wsConfig.enable !== false) {
        const wsPath = wsConfig.path || '/ws'
        const wsServer = this.server || this.httpServer
        if (wsServer) {
          this.wss = new WebSocketServer({
            server: wsServer,
            path: wsPath,
            maxPayload: 50 * 1024 * 1024, // 50MB，支持图片传输
            verifyClient: (info, cb) => {
              // 域名白名单验证
              const allowedHosts = config.webUI?.security?.allowedHosts || []
              if (allowedHosts.length > 0) {
                const host = info.req.headers.host
                if (!allowedHosts.some(h => host.includes(h))) {
                  logger.warn(`[sf插件] WebUI 拒绝来自 ${host} 的连接`)
                  cb(false, 403, 'Forbidden')
                  return
                }
              }
              cb(true)
            }
          })
          this.setupWebSocket(config)
        }
      }

      // 启动 HTTPS 监听
      if (this.server) {
        await new Promise((resolve, reject) => {
          this.server.listen(httpsPort, host, () => {
            logger.mark(`[sf插件] WebUI HTTPS 已启动: https://${host}:${httpsPort}${basePath}`)
            
            // 输出访问地址
            this.printAccessUrls(host, httpsPort, basePath, 'https')
            resolve(true)
          })

          this.server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
              logger.error(`[sf插件] WebUI HTTPS 端口 ${httpsPort} 已被占用`)
            } else {
              logger.error('[sf插件] WebUI HTTPS 启动失败:', error)
            }
            reject(error)
          })
        })
      }
      
      // 启动 HTTP 监听
      if (this.httpServer) {
        await new Promise((resolve, reject) => {
          this.httpServer.listen(httpPort, host, () => {
            if (redirectToHttps) {
              logger.mark(`[sf插件] WebUI HTTP 跳转服务已启动: http://${host}:${httpPort} -> https://${host}:${httpsPort}`)
            } else {
              logger.mark(`[sf插件] WebUI HTTP 已启动: http://${host}:${httpPort}${basePath}`)
              this.printAccessUrls(host, httpPort, basePath, 'http')
            }
            resolve(true)
          })

          this.httpServer.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
              logger.error(`[sf插件] WebUI HTTP 端口 ${httpPort} 已被占用`)
            } else {
              logger.error('[sf插件] WebUI HTTP 启动失败:', error)
            }
            reject(error)
          })
        })
      }
      
      this.isRunning = true

      return true
    } catch (error) {
      logger.error('[sf插件] WebUI 启动失败:', error)
      this.isRunning = false
      return false
    }
  }

  /**
   * 设置安全中间件
   */
  setupSecurityMiddleware(webUIConfig) {
    const security = webUIConfig?.security || {}

    // 基础安全响应头
    this.app.use((req, res, next) => {
      // 防止点击劫持
      res.setHeader('X-Frame-Options', 'DENY')
      // XSS 保护
      res.setHeader('X-Content-Type-Options', 'nosniff')
      // 内容安全策略
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' ws: wss:")
      // 禁用浏览器特征嗅探
      res.setHeader('X-XSS-Protection', '1; mode=block')
      next()
    })

    // 简单的请求频率限制
    if (security.rateLimit !== false) {
      const requestCounts = new Map()
      const windowMs = security.rateLimitWindow || 60000 // 默认 60 秒
      const maxRequests = security.maxRequests || 100    // 默认 100 请求/分钟

      this.app.use((req, res, next) => {
        const ip = req.ip || req.socket.remoteAddress
        const now = Date.now()
        
        if (!requestCounts.has(ip)) {
          requestCounts.set(ip, { count: 1, startTime: now })
        } else {
          const data = requestCounts.get(ip)
          if (now - data.startTime > windowMs) {
            // 重置窗口
            data.count = 1
            data.startTime = now
          } else {
            data.count++
            if (data.count > maxRequests) {
              logger.warn(`[sf插件] IP ${ip} 请求过于频繁`)
              return res.status(429).json({ error: 'Too Many Requests' })
            }
          }
        }
        next()
      })
    }

    // CORS 跨域支持
    if (security.cors?.enable) {
      this.app.use((req, res, next) => {
        const allowedOrigins = security.cors.origins || []
        const origin = req.headers.origin
        
        if (allowedOrigins.length === 0 || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          res.setHeader('Access-Control-Allow-Origin', origin || '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
          res.setHeader('Access-Control-Allow-Credentials', 'true')
        }
        
        if (req.method === 'OPTIONS') {
          res.status(204).end()
          return
        }
        next()
      })
    }

    // 访问日志中间件
    if (security.accessLog !== false) {
      this.app.use((req, res, next) => {
        const ip = req.ip || req.socket.remoteAddress
        const method = req.method
        const url = req.url
        const userAgent = req.headers['user-agent'] || 'unknown'
        
        // 记录请求开始
        this.logAccess(ip, 'REQUEST', `${method} ${url} | UA: ${userAgent}`)
        
        // 记录响应状态
        res.on('finish', () => {
          const status = res.statusCode
          if (status >= 400) {
            this.logAccess(ip, 'RESPONSE_ERROR', `${method} ${url} | Status: ${status}`)
          }
        })
        
        next()
      })
    }

    // IP 黑名单
    if (security.blacklist?.length > 0) {
      this.app.use((req, res, next) => {
        const ip = req.ip || req.socket.remoteAddress
        if (security.blacklist.includes(ip)) {
          logger.warn(`[sf插件] 黑名单 IP ${ip} 尝试访问`)
          return res.status(403).json({ error: 'Forbidden' })
        }
        next()
      })
    }
  }

  /**
   * 停止 WebUI 服务
   */
  async stop() {
    if (!this.isRunning) {
      return
    }

    try {
      // 清除认证 token
      this.authenticatedTokens.clear()
      this.authAttempts.clear()

      // 关闭 WebSocket 服务器
      if (this.wss) {
        this.wss.close()
        this.wss = null
      }

      // 关闭 HTTPS 服务器
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(() => {
            resolve()
          })
        })
        this.server = null
      }
      
      // 关闭 HTTP 服务器
      if (this.httpServer) {
        await new Promise((resolve) => {
          this.httpServer.close(() => {
            resolve()
          })
        })
        this.httpServer = null
      }

      this.app = null
      this.isRunning = false
      this.isHttps = false
      this.isHttpMode = false
      logger.mark('[sf插件] WebUI 已关闭')
    } catch (error) {
      logger.error('[sf插件] WebUI 关闭失败:', error)
    }
  }

  /**
   * 重启 WebUI 服务
   */
  async restart() {
    await this.stop()
    return await this.start()
  }

  /**
   * 设置 API 路由
   */
  setupRoutes() {
    // 健康检查
    this.app.get('/api/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: Date.now(),
        https: this.isHttps
      })
    })

    // 配置获取（脱敏）
    this.app.get('/api/config', (req, res) => {
      try {
        const config = Config.getConfig()
        const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https'
        const publicConfig = {
          webUI: {
            enable: config.webUI?.enable || false,
            basePath: config.webUI?.basePath || '/',
            https: isSecure,
            auth: {
              type: config.webUI?.auth?.type || 'password'
            },
            security: {
              requirePassword: !!config.webUI?.auth?.password,
              onlyMaster: config.webUI?.security?.onlyMaster ?? false
            }
          }
        }
        res.json({ success: true, data: publicConfig })
      } catch (error) {
        logger.error('[sf插件] 获取配置失败:', error)
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // 获取状态
    this.app.get('/api/status', (req, res) => {
      res.json({
        success: true,
        data: {
          running: this.isRunning,
          wsConnected: this.wss?.clients?.size || 0,
          https: this.server?.encrypted || false,
          timestamp: Date.now()
        }
      })
    })

    // 用户密码登录接口
    this.app.post('/api/login', express.json(), async (req, res) => {
      try {
        const { qq, passwordHash } = req.body
        const clientIp = req.ip || req.socket.remoteAddress
        const config = Config.getConfig()
        
        if (!qq || !passwordHash) {
          res.status(400).json({
            success: false,
            error: '请提供 QQ 号和密码'
          })
          return
        }
        
        // 检查是否仅允许主人登录
        if (config.webUI?.security?.onlyMaster && !this.isMaster(qq)) {
          this.logAccess(req, 'LOGIN_REJECTED', `非主人登录尝试: ${qq}`)
          res.status(403).json({
            success: false,
            error: '当前仅允许主人登录 WebUI'
          })
          return
        }
        
        // 验证用户密码
        const { verifyUserPassword, getUser, updateUserLogin } = await import('../utils/userManager.js')
        
        if (!getUser(qq)) {
          res.status(401).json({
            success: false,
            error: '用户不存在，请先使用验证码登录注册'
          })
          return
        }
        
        if (verifyUserPassword(qq, passwordHash)) {
          // 更新登录信息
          updateUserLogin(qq)
          
          // 生成 JWT
          const token = auth.signToken(clientIp, { qq })
          
          // 访问日志
          this.logAccess(req, 'LOGIN_SUCCESS', `QQ: ${qq}`)
          
          // 记录登录安全信息
          const { recordLogin, checkUnusualLogin, sendLoginNotification } = await import('../utils/loginSecurity.js')
          const userAgent = req.headers['user-agent'] || ''
          recordLogin(qq, clientIp, userAgent, 'password')
          
          // 检查异地登录并发送通知
          const { isUnusual, isFirstLogin, lastLogin } = checkUnusualLogin(qq, clientIp)
          sendLoginNotification(qq, clientIp, {
            isUnusual,
            isFirstLogin,
            lastLogin,
            loginType: 'password',
            userAgent
          })
          
          // 异地登录警告
          if (isUnusual && !isFirstLogin) {
            logger.warn(`[sf插件][安全警告] 用户 ${qq} 异地登录: ${clientIp}，上次IP: ${lastLogin.ip}`)
          }
          
          res.json({
            success: true,
            data: {
              token,
              user: { qq, hasPassword: true },
              expiresIn: '24h'
            }
          })
          logger.mark(`[sf插件] WebUI 密码登录成功，QQ: ${qq}`)
        } else {
          this.logAccess(req, 'LOGIN_FAILED')
          res.status(401).json({
            success: false,
            error: '密码错误'
          })
        }
      } catch (error) {
        logger.error('[sf插件] 密码登录失败:', error)
        res.status(500).json({ success: false, error: '服务器内部错误' })
      }
    })

    // 验证码登录接口（支持哈希或明文验证码）
    this.app.post('/api/login/code', express.json(), async (req, res) => {
      try {
        const { qq, codeHash, code } = req.body
        const clientIp = req.ip || req.socket.remoteAddress
        const config = Config.getConfig()
        
        if (!qq || (!codeHash && !code)) {
          res.status(400).json({
            success: false,
            error: '请提供 QQ 号和验证码'
          })
          return
        }
        
        // 验证验证码（支持哈希或明文）
        let isValid = false
        if (codeHash) {
          // 优先使用哈希验证
          isValid = auth.verifyLoginCodeByQQ(qq, codeHash)
        } else if (code) {
          // HTTP 环境下使用明文验证
          isValid = auth.verifyLoginCodePlain(qq, code)
        }
        
        if (isValid) {
          logger.mark(`[sf插件][验证码登录] 用户 "${qq}" 验证码验证通过`)
          
          // 检查是否仅允许主人登录
          const masterCheck = this.isMaster(qq)
          logger.mark(`[sf插件][验证码登录] 用户 "${qq}" 是否主人: ${masterCheck}`)
          
          if (config.webUI?.security?.onlyMaster && !masterCheck) {
            this.logAccess(req, 'CODE_LOGIN_REJECTED', `非主人登录尝试: ${qq}`)
            res.status(403).json({
              success: false,
              error: '当前仅允许主人登录 WebUI'
            })
            return
          }
          
          // 检查审批模式
          const approvalMode = config.webUI?.security?.approvalMode || 'auto'
          if (approvalMode !== 'auto') {
            const { checkPermission } = await import('../utils/approvalManager.js')
            const permission = checkPermission(qq, approvalMode, masterCheck)

            if (!permission.allowed) {
              this.logAccess(req, 'CODE_LOGIN_REJECTED', `未授权用户登录尝试: ${qq}`)
              res.status(403).json({
                success: false,
                error: permission.reason || '你暂无权限使用 WebUI'
              })
              return
            }
          }
          
          // 获取或创建用户
          const { getOrCreateUser, updateUserLogin } = await import('../utils/userManager.js')
          const user = getOrCreateUser(qq)
          updateUserLogin(qq)
          
          // 生成 JWT（包含用户 QQ）
          const token = auth.signToken(clientIp, { qq })
          
          // 访问日志
          this.logAccess(req, 'CODE_LOGIN_SUCCESS', `QQ: ${qq}`)
          
          // 记录登录安全信息
          const { recordLogin, checkUnusualLogin, sendLoginNotification } = await import('../utils/loginSecurity.js')
          const userAgent = req.headers['user-agent'] || ''
          recordLogin(qq, clientIp, userAgent, 'code')
          
          // 检查异地登录并发送通知
          const { isUnusual, isFirstLogin, lastLogin } = checkUnusualLogin(qq, clientIp)
          sendLoginNotification(qq, clientIp, {
            isUnusual,
            isFirstLogin,
            lastLogin,
            loginType: 'code',
            userAgent
          })
          
          // 异地登录警告
          if (isUnusual && !isFirstLogin) {
            logger.warn(`[sf插件][安全警告] 用户 ${qq} 异地登录: ${clientIp}，上次IP: ${lastLogin.ip}`)
          }
          
          res.json({
            success: true,
            data: {
              token,
              user: {
                qq,
                hasPassword: !!user.passwordHash
              },
              expiresIn: '24h'
            }
          })
          logger.mark(`[sf插件] WebUI 验证码登录成功，QQ: ${qq}`)
        } else {
          this.logAccess(req, 'CODE_LOGIN_FAILED')
          res.status(401).json({
            success: false,
            error: '验证码错误或已过期'
          })
        }
      } catch (error) {
        logger.error('[sf插件] 验证码登录失败:', error)
        res.status(500).json({ success: false, error: '服务器内部错误' })
      }
    })

    // 短链接登录接口（通过 16 位验证码直接登录）
    this.app.post('/api/login/short', express.json(), async (req, res) => {
      try {
        const { code } = req.body
        const clientIp = req.ip || req.socket.remoteAddress
        const config = Config.getConfig()
        
        if (!code || !/^[A-F0-9]{16}$/i.test(code)) {
          res.status(400).json({
            success: false,
            error: '无效的验证码格式'
          })
          return
        }
        
        // 通过验证码查找对应的 QQ
        const { findQQByCode } = await import('../utils/auth.js')
        const foundQQ = findQQByCode(code)
        
        if (!foundQQ) {
          this.logAccess(req, 'SHORT_LOGIN_FAILED', '验证码无效或已过期')
          res.status(401).json({
            success: false,
            error: '验证码错误或已过期'
          })
          return
        }
        
        logger.mark(`[sf插件][短链接登录] 找到用户: "${foundQQ}"`)
        
        // 检查是否仅允许主人登录
        const masterCheck = this.isMaster(foundQQ)
        logger.mark(`[sf插件][短链接登录] 用户 "${foundQQ}" 是否主人: ${masterCheck}`)

        if (config.webUI?.security?.onlyMaster && !masterCheck) {
          this.logAccess(req, 'SHORT_LOGIN_REJECTED', `非主人登录尝试: ${foundQQ}`)
          res.status(403).json({
            success: false,
            error: '当前仅允许主人登录 WebUI'
          })
          return
        }

        // 检查审批模式（短链接登录也需要检查审批权限）
        const approvalMode = config.webUI?.security?.approvalMode || 'auto'
        if (approvalMode !== 'auto') {
          const { checkPermission } = await import('../utils/approvalManager.js')
          const permission = checkPermission(foundQQ, approvalMode, masterCheck)

          if (!permission.allowed) {
            this.logAccess(req, 'SHORT_LOGIN_REJECTED', `未授权用户登录尝试: ${foundQQ}`)
            res.status(403).json({
              success: false,
              error: permission.reason || '你暂无权限使用 WebUI'
            })
            return
          }
        }

        // 获取或创建用户
        const { getOrCreateUser, updateUserLogin } = await import('../utils/userManager.js')
        const user = getOrCreateUser(foundQQ)
        updateUserLogin(foundQQ)
        
        // 删除已使用的验证码，防止重复使用
        const { deleteLoginCode } = await import('../utils/auth.js')
        deleteLoginCode(foundQQ)
        
        // 生成 JWT
        const token = auth.signToken(clientIp, { qq: foundQQ })
        
        // 访问日志
        this.logAccess(req, 'SHORT_LOGIN_SUCCESS', `QQ: ${foundQQ}`)
        
        // 记录登录安全信息
        const { recordLogin, checkUnusualLogin, sendLoginNotification } = await import('../utils/loginSecurity.js')
        const userAgent = req.headers['user-agent'] || ''
        recordLogin(foundQQ, clientIp, userAgent, 'short')
        
        // 检查异地登录并发送通知
        const { isUnusual, isFirstLogin, lastLogin } = checkUnusualLogin(foundQQ, clientIp)
        sendLoginNotification(foundQQ, clientIp, {
          isUnusual,
          isFirstLogin,
          lastLogin,
          loginType: 'short',
          userAgent
        })
        
        // 异地登录警告
        if (isUnusual && !isFirstLogin) {
          logger.warn(`[sf插件][安全警告] 用户 ${foundQQ} 异地登录: ${clientIp}，上次IP: ${lastLogin.ip}`)
        }
        
        res.json({
          success: true,
          data: {
            token,
            user: {
              qq: foundQQ,
              hasPassword: !!user.passwordHash
            },
            expiresIn: '24h'
          }
        })
        logger.mark(`[sf插件] WebUI 短链接登录成功，QQ: ${foundQQ}`)
      } catch (error) {
        logger.error('[sf插件] 短链接登录失败:', error)
        res.status(500).json({ success: false, error: '服务器内部错误' })
      }
    })

    // 检查用户权限状态（用于前端显示申请状态）
    this.app.get('/api/user/permission', async (req, res) => {
      try {
        // 优先从 JWT token 中获取 QQ（更安全）
        let qq = req.query.qq
        const authHeader = req.headers.authorization
        
        logger.debug(`[sf插件][权限检查] 请求参数 qq: "${qq}", authHeader: ${authHeader ? '存在' : '缺失'}`)
        
        if (authHeader?.startsWith('Bearer ')) {
          const token = authHeader.substring(7)
          const userInfo = auth.verifyToken(token)
          logger.debug(`[sf插件][权限检查] Token 解析结果: ${JSON.stringify(userInfo)}`)
          if (userInfo?.qq) {
            qq = userInfo.qq  // 使用 token 中的 QQ，忽略 query 参数
            logger.debug(`[sf插件][权限检查] 使用 Token 中的 qq: "${qq}"`)
          }
        }
        
        if (!qq) {
          res.status(400).json({ success: false, error: '请提供 QQ 号或登录凭证' })
          return
        }
        
        const config = Config.getConfig()
        const approvalMode = config.webUI?.security?.approvalMode || 'auto'
        
        const { checkPermission, getPendingRequests } = await import('../utils/approvalManager.js')
        
        // 检查是否有待审批的申请
        const pendingRequests = getPendingRequests()
        const myRequest = pendingRequests.find(r => r.qq === qq)
        
        logger.debug(`[sf插件][权限检查] 检查前 qq 值: "${qq}" (类型: ${typeof qq})`)
        const isMaster = this.isMaster(qq)
        const permission = checkPermission(qq, approvalMode, isMaster)
        logger.mark(`[sf插件][权限检查] QQ "${qq}" 是否主人: ${isMaster}`)
        
        // 确定用户角色和权限等级
        let role = 'guest'
        let roleName = '访客'
        let permissionLevel = 0
        
        if (isMaster) {
          role = 'master'
          roleName = '主人'
          permissionLevel = 100
        } else if (permission.allowed) {
          role = 'approved'
          roleName = '已授权用户'
          permissionLevel = 50
        } else if (myRequest) {
          role = 'pending'
          roleName = '待审批'
          permissionLevel = 10
        } else {
          role = 'guest'
          roleName = '访客'
          permissionLevel = 0
        }
        
        // 构建响应数据
        const responseData = {
          qq,
          role,
          roleName,
          permissionLevel,
          approvalMode,
          allowed: permission.allowed || isMaster,  // 主人始终允许
          reason: permission.reason || null,
          hasPendingRequest: !!myRequest,
          pendingRequest: myRequest || null
        }
        
        // 仅对主人返回管理权限标识
        if (isMaster) {
          responseData.isMaster = true
          responseData.canManage = true
        }
        
        res.json({
          success: true,
          data: responseData
        })
      } catch (error) {
        logger.error('[sf插件] 获取权限状态失败:', error)
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // 注销接口
    this.app.post('/api/logout', express.json(), (req, res) => {
      try {
        const { token } = req.body
        if (token) {
          auth.revokeToken(token)
          this.logAccess(req, 'LOGOUT')
        }
        res.json({ success: true, message: '注销成功' })
      } catch (error) {
        logger.error('[sf插件] 注销失败:', error)
        res.status(500).json({ success: false, error: '服务器内部错误' })
      }
    })

    // ==================== 管理员接口 ====================
    
    // 获取待审批列表（主人权限）
    this.app.get('/api/admin/pending', async (req, res) => {
      try {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: '未提供认证令牌' })
        }
        
        const token = authHeader.substring(7)
        const userInfo = auth.verifyToken(token)
        
        if (!userInfo) {
          return res.status(401).json({ success: false, error: '无效的令牌' })
        }
        
        // 检查是否是主人
        if (!this.isMaster(userInfo.qq)) {
          return res.status(403).json({ success: false, error: '只有主人可以访问此接口' })
        }
        
        const { getPendingRequests } = await import('../utils/approvalManager.js')
        const pendingRequests = getPendingRequests()
        
        res.json({
          success: true,
          data: pendingRequests
        })
      } catch (error) {
        logger.error('[sf插件] 获取待审批列表失败:', error)
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // 获取白名单（主人权限）
    this.app.get('/api/admin/whitelist', async (req, res) => {
      try {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: '未提供认证令牌' })
        }
        
        const token = authHeader.substring(7)
        const userInfo = auth.verifyToken(token)
        
        if (!userInfo) {
          return res.status(401).json({ success: false, error: '无效的令牌' })
        }
        
        // 检查是否是主人
        if (!this.isMaster(userInfo.qq)) {
          return res.status(403).json({ success: false, error: '只有主人可以访问此接口' })
        }
        
        const { getWhitelist } = await import('../utils/approvalManager.js')
        const whitelist = getWhitelist()
        
        res.json({
          success: true,
          data: whitelist
        })
      } catch (error) {
        logger.error('[sf插件] 获取白名单失败:', error)
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // 获取黑名单（主人权限）
    this.app.get('/api/admin/blacklist', async (req, res) => {
      try {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: '未提供认证令牌' })
        }
        
        const token = authHeader.substring(7)
        const userInfo = auth.verifyToken(token)
        
        if (!userInfo) {
          return res.status(401).json({ success: false, error: '无效的令牌' })
        }
        
        // 检查是否是主人
        if (!this.isMaster(userInfo.qq)) {
          return res.status(403).json({ success: false, error: '只有主人可以访问此接口' })
        }
        
        const { getBlacklist } = await import('../utils/approvalManager.js')
        const blacklist = getBlacklist()
        
        res.json({
          success: true,
          data: blacklist
        })
      } catch (error) {
        logger.error('[sf插件] 获取黑名单失败:', error)
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // 批准用户（主人权限）
    this.app.post('/api/admin/approve', express.json(), async (req, res) => {
      try {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: '未提供认证令牌' })
        }
        
        const token = authHeader.substring(7)
        const userInfo = auth.verifyToken(token)
        
        if (!userInfo) {
          return res.status(401).json({ success: false, error: '无效的令牌' })
        }
        
        // 检查是否是主人
        if (!this.isMaster(userInfo.qq)) {
          return res.status(403).json({ success: false, error: '只有主人可以访问此接口' })
        }
        
        const { qq } = req.body
        if (!qq) {
          return res.status(400).json({ success: false, error: '请提供用户QQ号' })
        }
        
        const { approveRequest } = await import('../utils/approvalManager.js')
        const result = approveRequest(qq, userInfo.qq)
        
        if (result.success) {
          // 记录管理操作日志
          this.logAdminAction(userInfo.qq, 'APPROVE', `批准用户 ${qq} 使用 WebUI`, req)
          logger.mark(`[sf插件][管理员] 用户 ${userInfo.qq} 批准了 ${qq} 的 WebUI 使用申请`)
          res.json({ success: true, message: result.message })
        } else {
          res.status(400).json({ success: false, error: result.message })
        }
      } catch (error) {
        logger.error('[sf插件] 批准用户失败:', error)
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // 拒绝用户（主人权限）
    this.app.post('/api/admin/reject', express.json(), async (req, res) => {
      try {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: '未提供认证令牌' })
        }
        
        const token = authHeader.substring(7)
        const userInfo = auth.verifyToken(token)
        
        if (!userInfo) {
          return res.status(401).json({ success: false, error: '无效的令牌' })
        }
        
        // 检查是否是主人
        if (!this.isMaster(userInfo.qq)) {
          return res.status(403).json({ success: false, error: '只有主人可以访问此接口' })
        }
        
        const { qq, reason } = req.body
        if (!qq) {
          return res.status(400).json({ success: false, error: '请提供用户QQ号' })
        }
        
        const { rejectRequest } = await import('../utils/approvalManager.js')
        const result = rejectRequest(qq, userInfo.qq, reason || '主人拒绝了你的申请')
        
        if (result.success) {
          // 记录管理操作日志
          this.logAdminAction(userInfo.qq, 'REJECT', `拒绝用户 ${qq} 的 WebUI 申请，原因: ${reason || '主人拒绝了你的申请'}`, req)
          logger.mark(`[sf插件][管理员] 用户 ${userInfo.qq} 拒绝了 ${qq} 的 WebUI 使用申请`)
          res.json({ success: true, message: result.message })
        } else {
          res.status(400).json({ success: false, error: result.message })
        }
      } catch (error) {
        logger.error('[sf插件] 拒绝用户失败:', error)
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // 拉黑用户（主人权限）
    this.app.post('/api/admin/block', express.json(), async (req, res) => {
      try {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: '未提供认证令牌' })
        }
        
        const token = authHeader.substring(7)
        const userInfo = auth.verifyToken(token)
        
        if (!userInfo) {
          return res.status(401).json({ success: false, error: '无效的令牌' })
        }
        
        // 检查是否是主人
        if (!this.isMaster(userInfo.qq)) {
          return res.status(403).json({ success: false, error: '只有主人可以访问此接口' })
        }
        
        const { qq, reason } = req.body
        if (!qq) {
          return res.status(400).json({ success: false, error: '请提供用户QQ号' })
        }
        
        // 不能拉黑主人
        if (this.isMaster(qq)) {
          return res.status(400).json({ success: false, error: '不能拉黑主人' })
        }
        
        const { blockUser } = await import('../utils/approvalManager.js')
        const result = blockUser(qq, userInfo.qq, reason || '被主人拉黑')
        
        if (result.success) {
          // 记录管理操作日志
          this.logAdminAction(userInfo.qq, 'BLOCK', `拉黑用户 ${qq}，原因: ${reason || '被主人拉黑'}`, req)
          logger.mark(`[sf插件][管理员] 用户 ${userInfo.qq} 拉黑了 ${qq}`)
          res.json({ success: true, message: result.message })
        } else {
          res.status(400).json({ success: false, error: result.message })
        }
      } catch (error) {
        logger.error('[sf插件] 拉黑用户失败:', error)
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // 解封用户（主人权限）
    this.app.post('/api/admin/unblock', express.json(), async (req, res) => {
      try {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: '未提供认证令牌' })
        }
        
        const token = authHeader.substring(7)
        const userInfo = auth.verifyToken(token)
        
        if (!userInfo) {
          return res.status(401).json({ success: false, error: '无效的令牌' })
        }
        
        // 检查是否是主人
        if (!this.isMaster(userInfo.qq)) {
          return res.status(403).json({ success: false, error: '只有主人可以访问此接口' })
        }
        
        const { qq } = req.body
        if (!qq) {
          return res.status(400).json({ success: false, error: '请提供用户QQ号' })
        }
        
        const { unblockUser } = await import('../utils/approvalManager.js')
        const result = unblockUser(qq)
        
        if (result.success) {
          // 记录管理操作日志
          this.logAdminAction(userInfo.qq, 'UNBLOCK', `解封用户 ${qq}`, req)
          logger.mark(`[sf插件][管理员] 用户 ${userInfo.qq} 解封了 ${qq}`)
          res.json({ success: true, message: result.message })
        } else {
          res.status(400).json({ success: false, error: result.message })
        }
      } catch (error) {
        logger.error('[sf插件] 解封用户失败:', error)
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // 获取用户管理统计（主人权限）
    this.app.get('/api/admin/stats', async (req, res) => {
      try {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: '未提供认证令牌' })
        }
        
        const token = authHeader.substring(7)
        const userInfo = auth.verifyToken(token)
        
        if (!userInfo) {
          return res.status(401).json({ success: false, error: '无效的令牌' })
        }
        
        // 检查是否是主人
        if (!this.isMaster(userInfo.qq)) {
          return res.status(403).json({ success: false, error: '只有主人可以访问此接口' })
        }
        
        const { getPendingRequests, getWhitelist, getBlacklist } = await import('../utils/approvalManager.js')
        
        const pending = getPendingRequests()
        const whitelist = getWhitelist()
        const blacklist = getBlacklist()
        
        res.json({
          success: true,
          data: {
            pendingCount: pending.length,
            whitelistCount: whitelist.length,
            blacklistCount: blacklist.length,
            totalUsers: pending.length + whitelist.length + blacklist.length
          }
        })
      } catch (error) {
        logger.error('[sf插件] 获取统计信息失败:', error)
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // 获取预设列表
    this.app.get('/api/presets', async (req, res) => {
      try {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: '未提供认证令牌' })
        }
        
        const token = authHeader.substring(7)
        const userInfo = auth.verifyToken(token)
        
        if (!userInfo) {
          return res.status(401).json({ success: false, error: '无效的令牌' })
        }
        
        const { getGlobalPresets } = await import('../utils/presetManager.js')
        const presets = getGlobalPresets()

        res.json({
          success: true,
          data: {
            presets: presets.map(p => ({ name: p.name, prompt: p.prompt }))
          }
        })
      } catch (error) {
        logger.error('[sf插件] 获取预设列表失败:', error)
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // 添加自定义预设（仅主人）
    this.app.post('/api/presets/custom', express.json(), async (req, res) => {
      try {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: '未提供认证令牌' })
        }
        
        const token = authHeader.substring(7)
        const userInfo = auth.verifyToken(token)
        
        if (!userInfo) {
          return res.status(401).json({ success: false, error: '无效的令牌' })
        }
        
        // 只有主人可以添加全局预设
        if (!this.isMaster(userInfo.qq)) {
          return res.status(403).json({ success: false, error: '只有主人可以添加全局预设' })
        }
        
        const { name, prompt } = req.body
        if (!name || !prompt) {
          return res.status(400).json({ success: false, error: '预设名称和内容不能为空' })
        }
        if (name.length > 200) {
          return res.status(400).json({ success: false, error: '预设名称过长（最大200字符）' })
        }

        const { saveGlobalPreset } = await import('../utils/presetManager.js')
        const result = saveGlobalPreset(name, prompt)

        res.json(result)
      } catch (error) {
        logger.error('[sf插件] 保存预设失败:', error)
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // 删除预设（仅主人）
    this.app.delete('/api/presets/:name', async (req, res) => {
      try {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: '未提供认证令牌' })
        }
        
        const token = authHeader.substring(7)
        const userInfo = auth.verifyToken(token)
        
        if (!userInfo) {
          return res.status(401).json({ success: false, error: '无效的令牌' })
        }
        
        if (!this.isMaster(userInfo.qq)) {
          return res.status(403).json({ success: false, error: '只有主人可以删除预设' })
        }

        const presetName = decodeURIComponent(req.params.name)
        if (!presetName || presetName.trim().length === 0) {
          return res.status(400).json({ success: false, error: '预设名称不能为空' })
        }
        if (presetName.length > 200) {
          return res.status(400).json({ success: false, error: '预设名称过长' })
        }

        const { deleteGlobalPreset } = await import('../utils/presetManager.js')
        const result = deleteGlobalPreset(presetName)

        res.json(result)
      } catch (error) {
        logger.error('[sf插件] 删除预设失败:', error)
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // ============ 个人预设 API ============
    
    // 获取用户个人预设
    this.app.get('/api/user/presets', async (req, res) => {
      try {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: '未提供认证令牌' })
        }
        
        const token = authHeader.substring(7)
        const userInfo = auth.verifyToken(token)
        
        if (!userInfo) {
          return res.status(401).json({ success: false, error: '无效的令牌' })
        }
        
        const { getUserPresets } = await import('../utils/presetManager.js')
        const presets = getUserPresets(userInfo.qq)
        
        res.json({
          success: true,
          data: { presets }
        })
      } catch (error) {
        logger.error('[sf插件] 获取个人预设失败:', error)
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // 添加用户个人预设
    this.app.post('/api/user/presets', express.json(), async (req, res) => {
      try {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: '未提供认证令牌' })
        }
        
        const token = authHeader.substring(7)
        const userInfo = auth.verifyToken(token)
        
        if (!userInfo) {
          return res.status(401).json({ success: false, error: '无效的令牌' })
        }
        
        const { name, prompt } = req.body
        if (!name || !prompt) {
          return res.status(400).json({ success: false, error: '预设名称和内容不能为空' })
        }
        if (name.length > 200) {
          return res.status(400).json({ success: false, error: '预设名称过长（最大200字符）' })
        }

        const { saveUserPreset } = await import('../utils/presetManager.js')
        const result = saveUserPreset(userInfo.qq, name, prompt)
        
        res.json(result)
      } catch (error) {
        logger.error('[sf插件] 添加个人预设失败:', error)
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // 删除用户个人预设
    this.app.delete('/api/user/presets/:name', async (req, res) => {
      try {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: '未提供认证令牌' })
        }
        
        const token = authHeader.substring(7)
        const userInfo = auth.verifyToken(token)
        
        if (!userInfo) {
          return res.status(401).json({ success: false, error: '无效的令牌' })
        }
        
        const presetName = decodeURIComponent(req.params.name)
        if (!presetName || presetName.trim().length === 0) {
          return res.status(400).json({ success: false, error: '预设名称不能为空' })
        }
        if (presetName.length > 200) {
          return res.status(400).json({ success: false, error: '预设名称过长' })
        }

        const { deleteUserPreset } = await import('../utils/presetManager.js')
        const result = deleteUserPreset(userInfo.qq, presetName)

        res.json(result)
      } catch (error) {
        logger.error('[sf插件] 删除个人预设失败:', error)
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // ============ API 管理接口 ============
    
    // 获取 API 列表（SS/GG 模式）
    this.app.get('/api/apis/:mode', async (req, res) => {
      try {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: '未提供认证令牌' })
        }
        
        const token = authHeader.substring(7)
        const userInfo = auth.verifyToken(token)
        
        if (!userInfo) {
          return res.status(401).json({ success: false, error: '无效的令牌' })
        }
        
        const mode = req.params.mode // 'ss' 或 'gg'
        if (!['ss', 'gg'].includes(mode)) {
          return res.status(400).json({ success: false, error: '无效的模式' })
        }
        
        const config = await Config.getConfig()
        const apiKey = `${mode}_APIList`
        const usingKey = `${mode}_usingAPI`
        
        const apiList = config[apiKey] || []
        const currentApiIndex = config[usingKey] || 1
        
        // 只返回必要信息，隐藏 key
        const safeApiList = apiList.map((api, index) => ({
          index: index + 1,
          name: api.name || `API ${index + 1}`,
          model: api.model || '',
          systemPrompt: api.systemPrompt || '',
          useContext: api.useContext || false,
          isCurrent: (index + 1) === currentApiIndex
        }))
        
        res.json({
          success: true,
          data: {
            apis: safeApiList,
            currentApi: currentApiIndex
          }
        })
      } catch (error) {
        logger.error('[sf插件] 获取 API 列表失败:', error)
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // 切换当前 API
    this.app.post('/api/apis/:mode/switch', express.json(), async (req, res) => {
      try {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: '未提供认证令牌' })
        }
        
        const token = authHeader.substring(7)
        const userInfo = auth.verifyToken(token)
        
        if (!userInfo) {
          return res.status(401).json({ success: false, error: '无效的令牌' })
        }
        
        const mode = req.params.mode
        const { apiIndex } = req.body
        
        if (!['ss', 'gg'].includes(mode)) {
          return res.status(400).json({ success: false, error: '无效的模式' })
        }
        
        if (!apiIndex || apiIndex < 1) {
          return res.status(400).json({ success: false, error: '无效的 API 索引' })
        }
        
        const config = await Config.getConfig()
        const apiKey = `${mode}_APIList`
        const usingKey = `${mode}_usingAPI`
        
        const apiList = config[apiKey] || []
        if (apiIndex > apiList.length) {
          return res.status(400).json({ success: false, error: 'API 索引超出范围' })
        }
        
        config[usingKey] = apiIndex
        Config.setConfig(config)
        
        res.json({ success: true, message: 'API 已切换' })
      } catch (error) {
        logger.error('[sf插件] 切换 API 失败:', error)
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // 更新 API 系统提示词（主人可以更新全局，普通用户只能更新个人配置）
    this.app.post('/api/apis/:mode/prompt', express.json(), async (req, res) => {
      try {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: '未提供认证令牌' })
        }
        
        const token = authHeader.substring(7)
        const userInfo = auth.verifyToken(token)
        
        if (!userInfo) {
          return res.status(401).json({ success: false, error: '无效的令牌' })
        }
        
        const mode = req.params.mode
        const { apiIndex, systemPrompt } = req.body
        
        if (!['ss', 'gg'].includes(mode)) {
          return res.status(400).json({ success: false, error: '无效的模式' })
        }
        
        if (!apiIndex || systemPrompt === undefined) {
          return res.status(400).json({ success: false, error: '参数不完整' })
        }
        
        const config = await Config.getConfig()
        const apiKey = `${mode}_APIList`
        
        if (!config[apiKey] || apiIndex > config[apiKey].length) {
          return res.status(400).json({ success: false, error: 'API 不存在' })
        }
        
        // 只有主人可以修改全局 API 配置
        if (!this.isMaster(userInfo.qq)) {
          return res.status(403).json({ success: false, error: '只有主人可以修改 API 系统提示词' })
        }
        
        config[apiKey][apiIndex - 1].systemPrompt = systemPrompt
        Config.setConfig(config)
        
        res.json({ success: true, message: '系统提示词已更新' })
      } catch (error) {
        logger.error('[sf插件] 更新系统提示词失败:', error)
        res.status(500).json({ success: false, error: error.message })
      }
    })
  }

  /**
   * 设置 WebSocket 处理
   */
  setupWebSocket(config) {
    const authConfig = config.webUI?.auth || {}
    const security = config.webUI?.security || {}
    const logLevel = config.webUI?.logLevel || 'info'

    this.wss.on('connection', (ws, req) => {
      const clientIp = req.socket.remoteAddress
      
      // 记录 WebSocket 连接
      this.logAccess(clientIp, 'WS_CONNECT', 'WebSocket 连接建立')
      
      // 检查 IP 黑名单
      if (security.blacklist?.includes(clientIp)) {
        this.logAccess(clientIp, 'WS_BLOCKED', 'IP 在黑名单中，连接被拒绝')
        ws.close(1008, 'IP blocked')
        return
      }

      // 日志输出
      if (logLevel === 'debug') {
        logger.info(`[sf插件] WebSocket 连接: ${clientIp}`)
      } else if (logLevel === 'info') {
        logger.info('[sf插件] 新的 WebSocket 连接')
      }

      // 生成临时会话 token
      const sessionToken = randomBytes(16).toString('hex')
      ws.sessionToken = sessionToken
      ws.isAuthenticated = authConfig.type === 'none' || !authConfig.password
      ws.clientIp = clientIp

      ws.on('message', async (message) => {
        try {
          const msgObj = JSON.parse(message.toString())

          // 处理认证
          if (msgObj.type === 'auth') {
            await this.handleAuth(ws, msgObj, authConfig, security)
            return
          }

          // 检查认证
          if (!ws.isAuthenticated || !this.authenticatedTokens.has(ws.sessionToken)) {
            ws.send(JSON.stringify({
              type: 'error',
              content: '请先进行认证',
              timestamp: Date.now()
            }))
            return
          }

          // 处理消息
          await this.handleWebSocketMessage(ws, msgObj, config, logLevel)
        } catch (error) {
          logger.error('[sf插件] WebSocket 消息处理错误:', error)
          ws.send(JSON.stringify({
            type: 'error',
            content: '消息处理失败: ' + error.message,
            timestamp: Date.now()
          }))
        }
      })

      ws.on('close', () => {
        // 清理认证 token
        this.authenticatedTokens.delete(ws.sessionToken)
        
        if (logLevel === 'debug' || logLevel === 'info') {
          logger.mark('[sf插件] WebSocket 连接已关闭')
        }
      })

      ws.on('error', (error) => {
        if (logLevel !== 'error') {
          logger.error('[sf插件] WebSocket 错误:', error)
        }
      })
    })
  }

  /**
   * 处理认证 - 带防暴力破解（支持密码和 JWT Token）
   */
  async handleAuth(ws, msgObj, authConfig, security) {
    const clientIp = ws.clientIp
    const maxAttempts = security.maxAuthAttempts || 5
    const lockoutMs = security.lockoutDuration || 300000 // 默认锁定 5 分钟

    // 检查是否被锁定
    if (this.authAttempts.has(clientIp)) {
      const attempts = this.authAttempts.get(clientIp)
      if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
        const remaining = Math.ceil((attempts.lockedUntil - Date.now()) / 1000)
        ws.send(JSON.stringify({
          type: 'auth',
          success: false,
          message: `认证失败次数过多，请 ${remaining} 秒后重试`
        }))
        logger.warn(`[sf插件] WebUI ${clientIp} 认证被锁定`)
        return
      }
    }

    // 无需认证
    if (authConfig.type === 'none' || !authConfig.password) {
      ws.isAuthenticated = true
      this.authenticatedTokens.set(ws.sessionToken, { ip: clientIp, createdAt: Date.now() })
      this.logAccess(clientIp, 'AUTH_SUCCESS', '无需认证模式')
      ws.send(JSON.stringify({ type: 'auth', success: true }))
      return
    }

    // JWT Token 验证（HTTP 模式使用）
    if (msgObj.token) {
      // 先检查是否是一键登录 token（不包含 IP 绑定）
      const quickLogin = auth.verifyQuickLoginToken(msgObj.token)
      if (quickLogin) {
        // 一键登录 token 验证成功，自动完成登录流程
        const { getOrCreateUser, updateUserLogin } = await import('../utils/userManager.js')
        const user = getOrCreateUser(quickLogin.qq)
        updateUserLogin(quickLogin.qq)
        
        ws.isAuthenticated = true
        ws.userQQ = quickLogin.qq
        this.authenticatedTokens.set(ws.sessionToken, { ip: clientIp, createdAt: Date.now() })
        this.logAccess(clientIp, 'AUTH_SUCCESS', `一键登录成功，QQ: ${quickLogin.qq}`)
        ws.send(JSON.stringify({ 
          type: 'auth', 
          success: true,
          user: { qq: quickLogin.qq, hasPassword: !!user.passwordHash }
        }))
        logger.mark(`[sf插件] WebUI 一键登录成功，QQ: ${quickLogin.qq}`)
        return
      }
      
      // 普通 JWT token 验证（包含 IP 绑定）
      const decoded = auth.verifyToken(msgObj.token, clientIp)
      if (decoded) {
        ws.isAuthenticated = true
        ws.userQQ = decoded.qq
        this.authenticatedTokens.set(ws.sessionToken, { ip: clientIp, createdAt: Date.now() })
        this.logAccess(clientIp, 'AUTH_SUCCESS', 'JWT 验证通过')
        ws.send(JSON.stringify({ type: 'auth', success: true }))
        logger.mark('[sf插件] WebUI JWT 认证成功')
        return
      } else {
        ws.send(JSON.stringify({
          type: 'auth',
          success: false,
          message: 'Token 无效或已过期'
        }))
        this.logAccess(clientIp, 'AUTH_FAILED', 'JWT 验证失败')
        return
      }
    }

    // 密码验证（HTTPS 模式使用，使用 SHA-256 哈希比较）
    const inputPassword = msgObj.password || ''
    const inputHash = createHash('sha256').update(inputPassword).digest('hex')
    const storedHash = authConfig.passwordHash || createHash('sha256').update(authConfig.password).digest('hex')

    if (inputHash === storedHash) {
      ws.isAuthenticated = true
      this.authenticatedTokens.set(ws.sessionToken, { ip: clientIp, createdAt: Date.now() })
      
      // 清除失败记录
      this.authAttempts.delete(clientIp)
      
      this.logAccess(clientIp, 'AUTH_SUCCESS', '密码验证通过')
      ws.send(JSON.stringify({ type: 'auth', success: true }))
      logger.mark('[sf插件] WebUI 密码认证成功')
    } else {
      // 记录失败次数
      if (!this.authAttempts.has(clientIp)) {
        this.authAttempts.set(clientIp, { count: 1, lastAttempt: Date.now() })
      } else {
        const attempts = this.authAttempts.get(clientIp)
        attempts.count++
        attempts.lastAttempt = Date.now()
        
        if (attempts.count >= maxAttempts) {
          attempts.lockedUntil = Date.now() + lockoutMs
          logger.warn(`[sf插件] WebUI ${clientIp} 认证失败 ${maxAttempts} 次，已锁定`)
        }
      }

      const remainingAttempts = maxAttempts - (this.authAttempts.get(clientIp)?.count || 0)
      
      this.logAccess(clientIp, 'AUTH_FAILED', `密码错误，剩余尝试次数: ${remainingAttempts}`)
      
      ws.send(JSON.stringify({
        type: 'auth',
        success: false,
        message: `密码错误，还剩 ${remainingAttempts} 次机会`
      }))
      logger.warn(`[sf插件] WebUI ${clientIp} 认证失败`)
    }
  }

  /**
   * 处理 WebSocket 消息
   */
  async handleWebSocketMessage(ws, msgObj, config, logLevel) {
    const { type, content, images, userQQ, preset } = msgObj

    if (logLevel === 'debug') {
      logger.mark(`[sf插件] 收到 WebSocket 消息: ${JSON.stringify(msgObj)}`)
    }

    // 动态导入 SF_Painting 处理逻辑
    const { SF_Painting } = await import('../apps/SF_Painting.js')
    const sfPainting = new SF_Painting()

    switch (type) {
      case 'ss':
        if (logLevel === 'debug' || logLevel === 'info') {
          logger.mark(`[sf插件] 处理 SS 消息: ${content?.substring(0, 50)}...`)
        }
        await sfPainting.handleSSMessage(ws, content, images, userQQ, preset)
        break
      case 'gg':
        if (logLevel === 'debug' || logLevel === 'info') {
          logger.mark(`[sf插件] 处理 GG 消息: ${content?.substring(0, 50)}...`)
        }
        await sfPainting.handleGGMessage(ws, content, images, userQQ, preset)
        break
      case 'dd':
        if (logLevel === 'debug' || logLevel === 'info') {
          logger.mark(`[sf插件] 处理 DD 消息: ${content?.substring(0, 50)}...`)
        }
        await sfPainting.handleCommands(ws, content, userQQ, config)
        break
      case 'loadHistory':
        if (logLevel === 'debug' || logLevel === 'info') {
          logger.mark(`[sf插件] 处理加载历史记录: userQQ=${userQQ}, mode=${msgObj.mode}`)
        }
        await sfPainting.handleLoadHistory(ws, msgObj, logLevel)
        break
      default:
        logger.warn(`[sf插件] 未知的消息类型: ${type}`)
        ws.send(JSON.stringify({
          type: 'error',
          content: '未知的消息类型: ' + type,
          timestamp: Date.now()
        }))
    }
  }

  /**
   * 验证密码
   * @param {string} password 明文密码
   * @param {object} authConfig 认证配置
   * @returns {boolean} 密码是否正确
   */
  validatePassword(password, authConfig) {
    if (!password || typeof password !== 'string') {
      return false
    }
    
    // 如果没有设置密码，不允许认证
    if (!authConfig.password && !authConfig.passwordHash) {
      return false
    }
    
    const inputHash = createHash('sha256').update(password).digest('hex')
    
    // 优先使用 passwordHash（更安全的存储方式）
    if (authConfig.passwordHash) {
      return inputHash === authConfig.passwordHash
    }
    
    // 兼容旧的明文密码配置
    const storedHash = createHash('sha256').update(authConfig.password).digest('hex')
    return inputHash === storedHash
  }

  /**
   * 密码哈希工具 - 将明文密码转换为 SHA-256 哈希
   * @param {string} password 明文密码
   * @returns {string} SHA-256 哈希值
   */
  hashPassword(password) {
    if (!password || typeof password !== 'string') {
      throw new Error('密码不能为空')
    }
    return createHash('sha256').update(password).digest('hex')
  }

  /**
   * 记录访问日志
   * @param {string} ip 访问者 IP
   * @param {string} action 操作类型
   * @param {string} details 详细信息
   */
  logAccess(ip, action, details = '') {
    try {
      const config = Config.getConfig()
      if (config.webUI?.security?.accessLog === false) {
        return
      }

      const timestamp = new Date().toISOString()
      const logEntry = `[${timestamp}] IP: ${ip} | Action: ${action} | ${details}\n`
      
      // 日志文件路径
      const logDir = path.join(process.cwd(), 'data', 'sf-plugin', 'logs')
      const logFile = path.join(logDir, 'webui-access.log')
      
      // 确保目录存在
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true })
      }
      
      // 追加日志
      appendFileSync(logFile, logEntry)
    } catch (error) {
      // 日志记录失败不影响主功能
      logger.debug('[sf插件] 访问日志记录失败:', error.message)
    }
  }

  /**
   * 记录管理员操作日志
   * @param {string} adminQQ 管理员 QQ
   * @param {string} action 操作类型
   * @param {string} details 详细信息
   * @param {object} req HTTP 请求对象
   */
  logAdminAction(adminQQ, action, details, req) {
    try {
      const timestamp = new Date().toISOString()
      const ip = req?.ip || req?.socket?.remoteAddress || 'unknown'
      const userAgent = req?.headers?.['user-agent'] || 'unknown'
      
      const logEntry = `[${timestamp}] Admin: ${adminQQ} | IP: ${ip} | Action: ${action} | ${details} | UA: ${userAgent}\n`
      
      // 日志文件路径
      const logDir = path.join(process.cwd(), 'data', 'sf-plugin', 'logs')
      const logFile = path.join(logDir, 'webui-admin.log')
      
      // 确保目录存在
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true })
      }
      
      // 追加日志
      appendFileSync(logFile, logEntry)
      
      // 同时输出到控制台
      logger.mark(`[sf插件][管理员操作] ${adminQQ} | ${action} | ${details}`)
    } catch (error) {
      // 日志记录失败不影响主功能
      logger.debug('[sf插件] 管理员日志记录失败:', error.message)
    }
  }

  /**
   * 打印访问地址
   */
  async printAccessUrls(host, port, basePath, protocol) {
    const os = process.platform
    
    // 本机地址
    logger.info(`[sf插件] 本机访问: ${protocol}://127.0.0.1:${port}${basePath}`)
    
    // 如果绑定的是 0.0.0.0，显示局域网地址
    if (host === '0.0.0.0') {
      try {
        const { networkInterfaces } = await import('os')
        const nets = networkInterfaces()
        
        for (const name of Object.keys(nets)) {
          for (const net of nets[name]) {
            // IPv4 地址
            if (net.family === 'IPv4' && !net.internal) {
              logger.info(`[sf插件] 局域网访问: ${protocol}://${net.address}:${port}${basePath}`)
            }
            // IPv6 地址
            if (net.family === 'IPv6' && !net.internal) {
              logger.info(`[sf插件] IPv6 访问: ${protocol}://[${net.address}]:${port}${basePath}`)
            }
          }
        }
      } catch (e) {
        // 忽略网络接口获取错误
      }
    }
    
    // 安全提示
    if (protocol === 'http') {
      logger.warn('[sf插件] 安全提示: 当前使用 HTTP 协议，建议配合 Nginx HTTPS 反向代理使用')
    } else {
      logger.mark('[sf插件] 安全: 已启用 HTTPS 加密传输')
    }
    
    logger.info('[sf插件] 提示: 公网访问需在安全组/防火墙开放端口')
  }
}

export default new WebUIServer()
