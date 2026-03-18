import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import path from 'path'
import { fileURLToPath } from 'url'
import Config from './Config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * WebUI 服务器管理类
 * 提供 HTTP 服务和 WebSocket 实时通信
 */
class WebUIServer {
  constructor() {
    this.app = null
    this.server = null
    this.wss = null
    this.isRunning = false
  }

  /**
   * 启动 WebUI 服务
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

    try {
      const { host = '0.0.0.0', port = 8082, basePath = '/' } = config.webUI
      const wsConfig = config.webUI?.websocket || {}

      // 创建 Express 应用
      this.app = express()
      this.server = createServer(this.app)

      // 中间件
      this.app.use(express.json())
      this.app.use(express.urlencoded({ extended: true }))

      // 静态文件服务
      const staticPath = path.join(__dirname, '../server/static')
      this.app.use(basePath, express.static(staticPath))

      // API 路由
      this.setupRoutes()

      // WebSocket 服务
      if (wsConfig.enable !== false) {
        const wsPath = wsConfig.path || '/ws'
        this.wss = new WebSocketServer({
          server: this.server,
          path: wsPath,
          maxPayload: 50 * 1024 * 1024 // 50MB，支持图片传输
        })
        this.setupWebSocket(config)
      }

      // 启动监听
      await new Promise((resolve, reject) => {
        this.server.listen(port, host, async () => {
          this.isRunning = true
          const address = this.server.address()
          logger.mark(`[sf插件] WebUI 已启动: http://${address.address}:${address.port}${basePath}`)
          
          // 输出访问地址
          await this.printAccessUrls(host, port, basePath)
          resolve(true)
        })

        this.server.on('error', (error) => {
          if (error.code === 'EADDRINUSE') {
            logger.error(`[sf插件] WebUI 端口 ${port} 已被占用`)
          } else {
            logger.error('[sf插件] WebUI 启动失败:', error)
          }
          reject(error)
        })
      })

      return true
    } catch (error) {
      logger.error('[sf插件] WebUI 启动失败:', error)
      this.isRunning = false
      return false
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
      // 关闭 WebSocket 服务器
      if (this.wss) {
        this.wss.close()
        this.wss = null
      }

      // 关闭 HTTP 服务器
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(() => {
            resolve()
          })
        })
        this.server = null
      }

      this.app = null
      this.isRunning = false
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
      res.json({ status: 'ok', timestamp: Date.now() })
    })

    // 配置获取
    this.app.get('/api/config', (req, res) => {
      try {
        const config = Config.getConfig()
        // 返回给前端的配置（脱敏处理）
        const publicConfig = {
          webUI: {
            enable: config.webUI?.enable || false,
            host: config.webUI?.host || '0.0.0.0',
            port: config.webUI?.port || 8082,
            basePath: config.webUI?.basePath || '/',
            auth: {
              type: config.webUI?.auth?.type || 'password'
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
          timestamp: Date.now()
        }
      })
    })
  }

  /**
   * 设置 WebSocket 处理
   */
  setupWebSocket(config) {
    const authConfig = config.webUI?.auth || {}
    const logLevel = config.webUI?.logLevel || 'info'

    this.wss.on('connection', (ws, req) => {
      // 日志输出
      if (logLevel === 'debug') {
        logger.info(`[sf插件] WebSocket 连接: ${req.socket.remoteAddress}`)
      } else if (logLevel === 'info') {
        logger.info('[sf插件] 新的 WebSocket 连接')
      }

      // 认证状态
      ws.isAuthenticated = authConfig.type === 'none' || !authConfig.password

      ws.on('message', async (message) => {
        try {
          const msgObj = JSON.parse(message.toString())

          // 处理认证
          if (msgObj.type === 'auth') {
            this.handleAuth(ws, msgObj, authConfig)
            return
          }

          // 检查认证
          if (!ws.isAuthenticated) {
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
   * 处理认证
   */
  handleAuth(ws, msgObj, authConfig) {
    // 无需认证
    if (authConfig.type === 'none' || !authConfig.password) {
      ws.isAuthenticated = true
      ws.send(JSON.stringify({ type: 'auth', success: true }))
      return
    }

    // 密码认证
    if (msgObj.password === authConfig.password) {
      ws.isAuthenticated = true
      ws.send(JSON.stringify({ type: 'auth', success: true }))
      logger.mark('[sf插件] WebUI 用户认证成功')
    } else {
      ws.send(JSON.stringify({
        type: 'auth',
        success: false,
        message: '密码错误'
      }))
      logger.warn('[sf插件] WebUI 用户认证失败: 密码错误')
    }
  }

  /**
   * 处理 WebSocket 消息
   */
  async handleWebSocketMessage(ws, msgObj, config, logLevel) {
    const { type, content, images, userQQ } = msgObj

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
        await sfPainting.handleSSMessage(ws, content, images, userQQ)
        break
      case 'gg':
        if (logLevel === 'debug' || logLevel === 'info') {
          logger.mark(`[sf插件] 处理 GG 消息: ${content?.substring(0, 50)}...`)
        }
        await sfPainting.handleGGMessage(ws, content, images, userQQ)
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
   * 打印访问地址
   */
  async printAccessUrls(host, port, basePath) {
    const os = process.platform
    
    // 本机地址
    logger.info(`[sf插件] 本机访问: http://127.0.0.1:${port}${basePath}`)
    
    // 如果绑定的是 0.0.0.0，显示局域网地址
    if (host === '0.0.0.0') {
      try {
        const { networkInterfaces } = await import('os')
        const nets = networkInterfaces()
        
        for (const name of Object.keys(nets)) {
          for (const net of nets[name]) {
            // 只显示 IPv4 地址
            if (net.family === 'IPv4' && !net.internal) {
              logger.info(`[sf插件] 局域网访问: http://${net.address}:${port}${basePath}`)
            }
            // IPv6 地址
            if (net.family === 'IPv6' && !net.internal) {
              logger.info(`[sf插件] IPv6 访问: http://[${net.address}]:${port}${basePath}`)
            }
          }
        }
      } catch (e) {
        // 忽略网络接口获取错误
      }
    }
    
    logger.info('[sf插件] 提示: 公网访问需在安全组/防火墙开放端口')
  }
}

export default new WebUIServer()
