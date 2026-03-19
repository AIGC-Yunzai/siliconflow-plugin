/**
 * 认证工具模块
 * 提供验证码登录、JWT token 管理等功能
 * 参考 Guoba-Plugin 实现
 */

import { randomBytes, createHash } from 'crypto'
import jwt from 'jsonwebtoken'
import Config from '../components/Config.js'

// 验证码存储 (内存中，重启后丢失)
const loginCodes = new Map()

// JWT Token 存储 (用于主动注销)
const tokenStore = new Map()

// 验证码有效期 (5分钟，单位：毫秒)
const CODE_EXPIRE_TIME = 5 * 60 * 1000

// Token 有效期 (24小时，单位：秒)
const TOKEN_EXPIRE_TIME = 24 * 60 * 60

/**
 * 生成随机验证码
 * @param {number} length 验证码长度
 * @returns {string} 随机验证码
 */
export function generateRandomCode(length = 16) {
  return randomBytes(length / 2).toString('hex').toUpperCase()
}

/**
 * 生成登录验证码（绑定用户 QQ 号）
 * @param {string} qq 用户 QQ 号
 * @returns {string} 16位验证码
 */
export function generateLoginCode(qq) {
  if (!qq || typeof qq !== 'string') {
    throw new Error('QQ 号不能为空')
  }
  
  // 检查是否已有未过期的验证码
  const existing = loginCodes.get(qq)
  if (existing && Date.now() < existing.expireAt) {
    return existing.code
  }
  
  const code = generateRandomCode(16)
  loginCodes.set(qq, {
    code,
    qq,  // 绑定用户 QQ
    createdAt: Date.now(),
    expireAt: Date.now() + CODE_EXPIRE_TIME
  })
  
  // 设置过期自动清理
  setTimeout(() => {
    const current = loginCodes.get(qq)
    if (current && current.code === code) {
      loginCodes.delete(qq)
    }
  }, CODE_EXPIRE_TIME)
  
  return code
}

/**
 * 验证登录验证码
 * @param {string} codeHash 验证码哈希值
 * @returns {string|null} 成功返回用户 QQ 号，失败返回 null
 */
export function verifyLoginCode(codeHash) {
  if (!codeHash || typeof codeHash !== 'string') {
    return null
  }
  
  // 遍历所有验证码，查找匹配项
  for (const [qq, stored] of loginCodes.entries()) {
    // 检查是否过期
    if (Date.now() > stored.expireAt) {
      loginCodes.delete(qq)
      continue
    }
    
    // 哈希比对（前端使用 sha256(qq + code) 格式）
    const storedHash = createHash('sha256').update(qq.toLowerCase() + stored.code.toLowerCase()).digest('hex')
    if (storedHash === codeHash.toLowerCase()) {
      // 验证成功后删除验证码（一次性使用）
      loginCodes.delete(qq)
      return qq  // 返回绑定的 QQ 号
    }
  }
  
  return null
}

/**
 * 通过 QQ 号验证登录验证码（用于密码重置等场景）
 * @param {string} qq 用户 QQ 号
 * @param {string} codeHash 验证码哈希值
 * @returns {boolean}
 */
export function verifyLoginCodeByQQ(qq, codeHash) {
  if (!qq || !codeHash) return false
  
  const stored = loginCodes.get(qq)
  if (!stored) return false
  
  // 检查是否过期
  if (Date.now() > stored.expireAt) {
    loginCodes.delete(qq)
    return false
  }
  
  // 哈希比对（前端使用 sha256(qq + code) 格式）
  const storedHash = createHash('sha256').update(qq.toLowerCase() + stored.code.toLowerCase()).digest('hex')
  if (storedHash === codeHash.toLowerCase()) {
    loginCodes.delete(qq)
    return true
  }
  
  return false
}

/**
 * 通过验证码查找 QQ 号
 * @param {string} code 16位验证码
 * @returns {string|null} QQ 号或 null
 */
export function findQQByCode(code) {
  if (!code || typeof code !== 'string') return null
  
  const upperCode = code.toUpperCase()
  for (const [qq, stored] of loginCodes.entries()) {
    if (stored.code === upperCode && Date.now() < stored.expireAt) {
      return qq
    }
  }
  return null
}

/**
 * 通过 QQ 号删除验证码
 * @param {string} qq QQ 号
 */
export function deleteLoginCode(qq) {
  if (qq) {
    loginCodes.delete(qq)
  }
}

/**
 * 通过 QQ 号验证明文验证码（HTTP 环境下使用）
 * @param {string} qq 用户 QQ 号
 * @param {string} code 明文验证码
 * @returns {boolean}
 */
export function verifyLoginCodePlain(qq, code) {
  if (!qq || !code) return false
  
  const stored = loginCodes.get(qq)
  if (!stored) return false
  
  // 检查是否过期
  if (Date.now() > stored.expireAt) {
    loginCodes.delete(qq)
    return false
  }
  
  // 明文比对（HTTP 环境下，本来就没有加密传输）
  if (stored.code === code.toUpperCase()) {
    loginCodes.delete(qq)
    return true
  }
  
  return false
}

/**
 * 检查是否存在未过期的验证码
 * @param {string} userId 用户ID (可选)
 * @returns {boolean}
 */
export function hasValidCode(userId = 'default') {
  const stored = loginCodes.get(userId)
  if (!stored) {
    return false
  }
  return Date.now() < stored.expireAt
}

/**
 * 获取验证码剩余有效时间
 * @param {string} userId 用户ID (可选)
 * @returns {number} 剩余秒数，0表示已过期或不存在
 */
export function getCodeRemainingTime(userId = 'default') {
  const stored = loginCodes.get(userId)
  if (!stored) {
    return 0
  }
  const remaining = Math.ceil((stored.expireAt - Date.now()) / 1000)
  return Math.max(0, remaining)
}

/**
 * 获取 JWT Secret
 * @returns {string} JWT Secret
 */
export function getJwtSecret() {
  const config = Config.getConfig()
  let secret = config.webUI?.jwtSecret
  
  if (!secret || secret.length !== 64) {
    // 生成32字节(64字符hex)随机密钥
    secret = randomBytes(32).toString('hex')
    
    // 保存到配置
    config.webUI = config.webUI || {}
    config.webUI.jwtSecret = secret
    config.webUI.jwtSecretCreatedAt = Date.now()
    Config.setConfig(config, 'config')
    logger.mark('[sf插件] WebUI JWT Secret 已生成并保存到配置文件')
  }
  
  return secret
}

/**
 * 获取用于验证的 JWT Secrets（支持轮换过渡期）
 * 如果正在进行轮换，会同时返回新旧两个 Secret
 * @returns {Array<string>} JWT Secret 列表
 */
export function getJwtSecretsForVerify() {
  const config = Config.getConfig()
  const secrets = []
  
  // 当前使用的 Secret
  const currentSecret = config.webUI?.jwtSecret
  if (currentSecret && currentSecret.length === 64) {
    secrets.push(currentSecret)
  }
  
  // 轮换过渡期的旧 Secret（24小时内）
  const oldSecret = config.webUI?.jwtSecretOld
  const rotatedAt = config.webUI?.jwtSecretRotatedAt
  if (oldSecret && rotatedAt && (Date.now() - rotatedAt) < 24 * 60 * 60 * 1000) {
    secrets.push(oldSecret)
  }
  
  return secrets
}

/**
 * 轮换 JWT Secret
 * 用于定期更新密钥，增强安全性
 * @returns {boolean} 是否成功轮换
 */
export function rotateJwtSecret() {
  try {
    const config = Config.getConfig()
    const currentSecret = config.webUI?.jwtSecret
    
    // 检查是否需要轮换（默认 30 天）
    const createdAt = config.webUI?.jwtSecretCreatedAt || 0
    const rotateInterval = config.webUI?.jwtRotateInterval || 30 * 24 * 60 * 60 * 1000 // 30天
    
    if (Date.now() - createdAt < rotateInterval) {
      return false // 未到轮换时间
    }
    
    // 生成新密钥
    const newSecret = randomBytes(32).toString('hex')
    
    // 保存旧密钥（用于验证过渡期的 token）
    if (currentSecret) {
      config.webUI.jwtSecretOld = currentSecret
      config.webUI.jwtSecretRotatedAt = Date.now()
    }
    
    // 保存新密钥
    config.webUI.jwtSecret = newSecret
    config.webUI.jwtSecretCreatedAt = Date.now()
    Config.setConfig(config, 'config')
    
    logger.mark('[sf插件] WebUI JWT Secret 已自动轮换')
    logger.info('[sf插件] 旧 Secret 将在 24 小时后失效，请用户在此期间重新登录')
    
    return true
  } catch (error) {
    logger.error('[sf插件] JWT Secret 轮换失败:', error)
    return false
  }
}

/**
 * 强制轮换 JWT Secret（管理员命令）
 * 会立即使旧 Token 失效
 * @returns {boolean} 是否成功轮换
 */
export function forceRotateJwtSecret() {
  try {
    const config = Config.getConfig()
    const currentSecret = config.webUI?.jwtSecret
    
    // 生成新密钥
    const newSecret = randomBytes(32).toString('hex')
    
    // 不保留旧密钥，立即使旧 Token 失效
    config.webUI.jwtSecret = newSecret
    config.webUI.jwtSecretCreatedAt = Date.now()
    delete config.webUI.jwtSecretOld
    delete config.webUI.jwtSecretRotatedAt
    Config.setConfig(config, 'config')
    
    // 清空所有已存储的 token
    tokenStore.clear()
    
    logger.mark('[sf插件] WebUI JWT Secret 已强制轮换，所有用户需要重新登录')
    
    return true
  } catch (error) {
    logger.error('[sf插件] JWT Secret 强制轮换失败:', error)
    return false
  }
}

/**
 * 签发 JWT Token
 * @param {string} ip 客户端IP
 * @param {object} extraPayload 额外的 payload 数据（如用户 QQ 号）
 * @returns {string} JWT Token
 */
export function signToken(ip, extraPayload = {}) {
  const payload = {
    ip,
    timestamp: Date.now(),
    ...extraPayload
  }
  
  const token = jwt.sign(payload, getJwtSecret(), { expiresIn: TOKEN_EXPIRE_TIME })
  
  // 存储 token 信息
  tokenStore.set(token, {
    ip,
    ...extraPayload,
    createdAt: Date.now(),
    expireAt: Date.now() + (TOKEN_EXPIRE_TIME * 1000)
  })
  
  return token
}

/**
 * 验证 JWT Token（支持轮换过渡期）
 * @param {string} token JWT Token
 * @param {string} clientIp 客户端IP (用于IP绑定验证)
 * @returns {object|null} 解码后的 payload 或 null
 */
export function verifyToken(token, clientIp) {
  if (!token || typeof token !== 'string') {
    return null
  }
  
  // 获取所有可用的 Secret（当前和轮换过渡期的旧 Secret）
  const secrets = getJwtSecretsForVerify()
  
  if (secrets.length === 0) {
    logger.error('[sf插件] 没有可用的 JWT Secret')
    return null
  }
  
  // 尝试用所有 Secret 验证
  for (const secret of secrets) {
    try {
      const decoded = jwt.verify(token, secret)
      
      // IP 绑定验证
      if (clientIp && decoded.ip !== clientIp) {
        logger.warn(`[sf插件] WebUI Token IP 不匹配: ${decoded.ip} vs ${clientIp}`)
        continue // 尝试下一个 Secret
      }
      
      return decoded
    } catch (error) {
      // 继续尝试下一个 Secret
      continue
    }
  }
  
  // 所有 Secret 都验证失败
  return null
}

/**
 * 注销 Token
 * @param {string} token JWT Token
 * @returns {boolean} 是否成功注销
 */
export function revokeToken(token) {
  if (tokenStore.has(token)) {
    tokenStore.delete(token)
    return true
  }
  return false
}

/**
 * 创建一键登录 Token（短期有效）
 * @param {string} qq 用户 QQ 号
 * @param {string} code 验证码
 * @returns {string} JWT Token
 */
export function createQuickLoginToken(qq, code) {
  const token = jwt.sign(
    { 
      qq, 
      code, 
      type: 'quick_login',
      timestamp: Date.now() 
    },
    getJwtSecret(),
    { expiresIn: 300 } // 5 分钟有效期
  )
  
  return token
}

/**
 * 验证一键登录 Token
 * @param {string} token JWT Token
 * @returns {object|null} 包含 qq 和 code 的对象，或 null
 */
export function verifyQuickLoginToken(token) {
  try {
    const decoded = jwt.verify(token, getJwtSecret())
    if (decoded.type === 'quick_login' && decoded.qq && decoded.code) {
      return decoded
    }
    return null
  } catch (error) {
    return null
  }
}

/**
 * 清理过期的 token
 */
export function cleanupExpiredTokens() {
  const now = Date.now()
  let count = 0
  
  for (const [token, data] of tokenStore.entries()) {
    if (now > data.expireAt) {
      tokenStore.delete(token)
      count++
    }
  }
  
  if (count > 0) {
    logger.debug(`[sf插件] 清理了 ${count} 个过期 token`)
  }
}

// 每小时清理一次过期 token
setInterval(cleanupExpiredTokens, 60 * 60 * 1000)

/**
 * 验证密码
 * @param {string} password 明文密码
 * @param {object} authConfig 认证配置
 * @returns {boolean} 密码是否正确
 */
export function validatePassword(password, authConfig) {
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

export default {
  generateLoginCode,
  verifyLoginCode,
  hasValidCode,
  getCodeRemainingTime,
  signToken,
  verifyToken,
  revokeToken,
  cleanupExpiredTokens,
  validatePassword
}
