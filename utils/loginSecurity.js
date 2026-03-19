/**
 * 登录安全管理模块
 * 处理登录通知、异地登录检测、登录历史记录等
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'

// 数据文件路径
const DATA_DIR = path.join(process.cwd(), 'data', 'sf-plugin')
const LOGIN_HISTORY_FILE = path.join(DATA_DIR, 'login-history.json')
const ACTIVE_SESSIONS_FILE = path.join(DATA_DIR, 'active-sessions.json')

// 会话有效期（24小时）
const SESSION_EXPIRE_TIME = 24 * 60 * 60 * 1000

/**
 * 确保数据目录存在
 */
function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

/**
 * 读取登录历史
 */
function loadLoginHistory() {
  ensureDataDir()
  if (!existsSync(LOGIN_HISTORY_FILE)) {
    return {}
  }
  try {
    return JSON.parse(readFileSync(LOGIN_HISTORY_FILE, 'utf8'))
  } catch (error) {
    return {}
  }
}

/**
 * 保存登录历史
 */
function saveLoginHistory(data) {
  ensureDataDir()
  try {
    writeFileSync(LOGIN_HISTORY_FILE, JSON.stringify(data, null, 2))
  } catch (error) {
    console.error('[sf插件] 保存登录历史失败:', error)
  }
}

/**
 * 读取活跃会话
 */
function loadActiveSessions() {
  ensureDataDir()
  if (!existsSync(ACTIVE_SESSIONS_FILE)) {
    return {}
  }
  try {
    const data = JSON.parse(readFileSync(ACTIVE_SESSIONS_FILE, 'utf8'))
    // 清理过期会话
    const now = Date.now()
    const cleaned = {}
    for (const [qq, session] of Object.entries(data)) {
      if (session.expireAt > now) {
        cleaned[qq] = session
      }
    }
    return cleaned
  } catch (error) {
    return {}
  }
}

/**
 * 保存活跃会话
 */
function saveActiveSessions(data) {
  ensureDataDir()
  try {
    writeFileSync(ACTIVE_SESSIONS_FILE, JSON.stringify(data, null, 2))
  } catch (error) {
    console.error('[sf插件] 保存活跃会话失败:', error)
  }
}

/**
 * 记录登录事件
 * @param {string} qq 用户QQ
 * @param {string} ip 登录IP
 * @param {string} userAgent 浏览器UA
 * @param {string} loginType 登录方式（code/password/short）
 */
export function recordLogin(qq, ip, userAgent, loginType = 'code') {
  const history = loadLoginHistory()
  
  if (!history[qq]) {
    history[qq] = []
  }
  
  const loginRecord = {
    time: Date.now(),
    ip,
    userAgent: userAgent?.substring(0, 200) || 'unknown', // 限制长度
    loginType,
    id: Date.now().toString(36) + Math.random().toString(36).substr(2)
  }
  
  // 添加到历史（最多保留50条）
  history[qq].unshift(loginRecord)
  if (history[qq].length > 50) {
    history[qq] = history[qq].slice(0, 50)
  }
  
  saveLoginHistory(history)
  
  return loginRecord
}

/**
 * 检查是否是异地登录
 * @param {string} qq 用户QQ
 * @param {string} ip 当前IP
 * @returns {object} {isUnusual, lastLogin}
 */
export function checkUnusualLogin(qq, ip) {
  const history = loadLoginHistory()
  const userHistory = history[qq]
  
  if (!userHistory || userHistory.length === 0) {
    // 首次登录
    return { isUnusual: false, isFirstLogin: true, lastLogin: null }
  }
  
  const lastLogin = userHistory[0]
  const isUnusual = lastLogin.ip !== ip
  
  return { isUnusual, isFirstLogin: false, lastLogin }
}

/**
 * 发送登录通知
 * @param {string} qq 用户QQ
 * @param {string} ip 登录IP
 * @param {object} options 选项
 */
export async function sendLoginNotification(qq, ip, options = {}) {
  const { isUnusual, isFirstLogin, lastLogin, loginType, userAgent } = options
  
  // 构建通知消息
  const lines = []
  
  if (isFirstLogin) {
    lines.push('🔔 WebUI 首次登录提醒')
  } else if (isUnusual) {
    lines.push('⚠️ WebUI 异地登录提醒')
  } else {
    lines.push('🔔 WebUI 登录提醒')
  }
  
  lines.push(`登录时间: ${new Date().toLocaleString()}`)
  lines.push(`登录IP: ${ip}`)
  
  if (loginType) {
    const typeNames = {
      code: '验证码登录',
      password: '密码登录',
      short: '短链接登录',
      master: '主人快捷登录'
    }
    lines.push(`登录方式: ${typeNames[loginType] || loginType}`)
  }
  
  if (isUnusual && lastLogin) {
    lines.push('')
    lines.push('⚠️ 检测到IP地址变更:')
    lines.push(`上次登录IP: ${lastLogin.ip}`)
    lines.push(`上次登录时间: ${new Date(lastLogin.time).toLocaleString()}`)
    lines.push('')
    lines.push('如非本人操作，请立即:')
    lines.push('1. 发送 #sf轮换webui密钥 强制所有用户重新登录')
    lines.push('2. 检查账号安全')
  }
  
  if (isFirstLogin) {
    lines.push('')
    lines.push('💡 提示: 如需设置登录密码，请发送 #sf设置密码 [密码]')
  }
  
  const msg = lines.join('\n')
  
  // 尝试发送私聊通知
  try {
    // 使用 Bot 实例发送消息
    if (typeof Bot !== 'undefined' && Bot.sendPrivateMsg) {
      await Bot.sendPrivateMsg(qq, msg)
      return true
    }
    // 尝试其他方式
    if (typeof Bot !== 'undefined' && Bot.pickUser) {
      const user = Bot.pickUser(qq)
      if (user && user.sendMsg) {
        await user.sendMsg(msg)
        return true
      }
    }
  } catch (error) {
    console.error('[sf插件] 发送登录通知失败:', error)
  }
  
  return false
}

/**
 * 创建活跃会话（单点登录）
 * @param {string} qq 用户QQ
 * @param {string} sessionId 会话ID
 * @returns {object} {created, kicked}
 */
export function createSession(qq, sessionId) {
  const sessions = loadActiveSessions()
  
  const kicked = sessions[qq] || null
  
  sessions[qq] = {
    sessionId,
    createdAt: Date.now(),
    expireAt: Date.now() + SESSION_EXPIRE_TIME
  }
  
  saveActiveSessions(sessions)
  
  return { created: true, kicked }
}

/**
 * 验证会话是否有效
 * @param {string} qq 用户QQ
 * @param {string} sessionId 会话ID
 * @returns {boolean}
 */
export function validateSession(qq, sessionId) {
  const sessions = loadActiveSessions()
  const session = sessions[qq]
  
  if (!session) {
    return false
  }
  
  if (session.expireAt < Date.now()) {
    // 会话已过期，清理
    delete sessions[qq]
    saveActiveSessions(sessions)
    return false
  }
  
  return session.sessionId === sessionId
}

/**
 * 强制下线用户
 * @param {string} qq 用户QQ
 * @returns {boolean}
 */
export function forceLogout(qq) {
  const sessions = loadActiveSessions()
  
  if (sessions[qq]) {
    delete sessions[qq]
    saveActiveSessions(sessions)
    return true
  }
  
  return false
}

/**
 * 获取用户登录历史
 * @param {string} qq 用户QQ
 * @param {number} limit 数量限制
 * @returns {Array}
 */
export function getLoginHistory(qq, limit = 10) {
  const history = loadLoginHistory()
  const userHistory = history[qq] || []
  return userHistory.slice(0, limit)
}

/**
 * 获取活跃会话列表（管理员用）
 * @returns {object}
 */
export function getActiveSessions() {
  const sessions = loadActiveSessions()
  const now = Date.now()
  const result = {}
  
  for (const [qq, session] of Object.entries(sessions)) {
    if (session.expireAt > now) {
      result[qq] = {
        ...session,
        remainingTime: Math.ceil((session.expireAt - now) / 1000)
      }
    }
  }
  
  return result
}
