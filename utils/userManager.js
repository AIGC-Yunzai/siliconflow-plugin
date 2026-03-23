/**
 * 用户管理模块
 * 管理 WebUI 用户数据，支持用户注册、密码管理等功能
 */

import { createHash, randomBytes } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'

// 用户数据文件路径
const USER_DATA_FILE = path.join(process.cwd(), 'data', 'sf-plugin', 'users.json')

// 内存中的用户数据缓存
let usersCache = null
let lastLoadTime = 0
const CACHE_TTL = 60000 // 缓存 60 秒

/**
 * 确保用户数据目录存在
 */
function ensureDataDir() {
  const dir = path.dirname(USER_DATA_FILE)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * 加载用户数据
 * @returns {object} 用户数据对象
 */
function loadUsers() {
  const now = Date.now()
  
  // 使用缓存
  if (usersCache && (now - lastLoadTime) < CACHE_TTL) {
    return usersCache
  }
  
  ensureDataDir()
  
  if (!existsSync(USER_DATA_FILE)) {
    usersCache = { users: {}, version: 1 }
    saveUsers(usersCache)
    return usersCache
  }
  
  try {
    const data = readFileSync(USER_DATA_FILE, 'utf8')
    usersCache = JSON.parse(data)
    lastLoadTime = now
    return usersCache
  } catch (error) {
    logger.error('[sf插件] 加载用户数据失败:', error)
    usersCache = { users: {}, version: 1 }
    return usersCache
  }
}

/**
 * 保存用户数据
 * @param {object} data 用户数据
 */
function saveUsers(data) {
  ensureDataDir()
  try {
    writeFileSync(USER_DATA_FILE, JSON.stringify(data, null, 2), 'utf8')
    usersCache = data
    lastLoadTime = Date.now()
  } catch (error) {
    logger.error('[sf插件] 保存用户数据失败:', error)
  }
}

/**
 * 获取用户信息
 * @param {string} qq 用户 QQ 号
 * @returns {object|null} 用户信息
 */
export function getUser(qq) {
  if (!qq || typeof qq !== 'string') return null
  const data = loadUsers()
  return data.users[qq] || null
}

/**
 * 检查用户是否存在
 * @param {string} qq 用户 QQ 号
 * @returns {boolean}
 */
export function hasUser(qq) {
  return !!getUser(qq)
}

/**
 * 创建新用户
 * @param {string} qq 用户 QQ 号
 * @returns {object} 新用户信息
 */
export function createUser(qq) {
  if (!qq || typeof qq !== 'string') {
    throw new Error('QQ 号不能为空')
  }
  
  const data = loadUsers()
  const now = Date.now()
  
  const user = {
    qq,
    passwordHash: null,  // 初始无密码
    createdAt: now,
    lastLoginAt: null,
    loginCount: 0
  }
  
  data.users[qq] = user
  saveUsers(data)
  
  logger.mark(`[sf插件] 新用户注册: ${qq}`)
  return user
}

/**
 * 获取或创建用户
 * @param {string} qq 用户 QQ 号
 * @returns {object} 用户信息
 */
export function getOrCreateUser(qq) {
  const user = getUser(qq)
  if (user) return user
  return createUser(qq)
}

/**
 * 设置用户密码
 * @param {string} qq 用户 QQ 号
 * @param {string} password 明文密码
 * @returns {boolean}
 */
export function setUserPassword(qq, password) {
  if (!qq || !password) return false
  
  const data = loadUsers()
  const user = data.users[qq]
  if (!user) return false
  
  // 使用 SHA-256 哈希密码
  user.passwordHash = createHash('sha256').update(password).digest('hex')
  saveUsers(data)
  
  logger.mark(`[sf插件] 用户 ${qq} 设置密码成功`)
  return true
}

/**
 * 验证用户密码
 * @param {string} qq 用户 QQ 号
 * @param {string} passwordHash 密码哈希值
 * @returns {boolean}
 */
export function verifyUserPassword(qq, passwordHash) {
  if (!qq || !passwordHash) return false
  
  const user = getUser(qq)
  if (!user || !user.passwordHash) return false
  
  return user.passwordHash.toLowerCase() === passwordHash.toLowerCase()
}

/**
 * 清除用户密码
 * @param {string} qq 用户 QQ 号
 * @returns {boolean}
 */
export function clearUserPassword(qq) {
  const data = loadUsers()
  const user = data.users[qq]
  if (!user) return false
  
  user.passwordHash = null
  saveUsers(data)
  
  logger.mark(`[sf插件] 用户 ${qq} 清除密码成功`)
  return true
}

/**
 * 更新用户登录信息
 * @param {string} qq 用户 QQ 号
 */
export function updateUserLogin(qq) {
  const data = loadUsers()
  const user = data.users[qq]
  if (!user) return
  
  user.lastLoginAt = Date.now()
  user.loginCount = (user.loginCount || 0) + 1
  saveUsers(data)
}

/**
 * 删除用户
 * @param {string} qq 用户 QQ 号
 * @returns {boolean}
 */
export function deleteUser(qq) {
  const data = loadUsers()
  if (!data.users[qq]) return false
  
  delete data.users[qq]
  saveUsers(data)
  
  logger.mark(`[sf插件] 删除用户: ${qq}`)
  return true
}

/**
 * 获取所有用户列表
 * @returns {object[]}
 */
export function getAllUsers() {
  const data = loadUsers()
  return Object.values(data.users)
}

/**
 * 获取用户在 WebUI 中的 API 偏好（不影响全局配置）
 * @param {string} qq 用户 QQ 号
 * @param {string} mode 模式 'ss' 或 'gg'
 * @returns {number|null} API 索引，未设置时返回 null
 */
export function getUserApiPreference(qq, mode) {
  const user = getUser(qq)
  if (!user || !user.webuiApis) return null
  return user.webuiApis[mode] || null
}

/**
 * 设置用户在 WebUI 中的 API 偏好（不影响全局配置）
 * @param {string} qq 用户 QQ 号
 * @param {string} mode 模式 'ss' 或 'gg'
 * @param {number} apiIndex API 索引
 */
export function setUserApiPreference(qq, mode, apiIndex) {
  const data = loadUsers()
  const user = data.users[qq]
  if (!user) return
  if (!user.webuiApis) user.webuiApis = {}
  user.webuiApis[mode] = apiIndex
  saveUsers(data)
}

/**
 * 获取用户统计信息
 * @returns {object}
 */
export function getUserStats() {
  const users = getAllUsers()
  return {
    total: users.length,
    withPassword: users.filter(u => u.passwordHash).length,
    active7d: users.filter(u => u.lastLoginAt && Date.now() - u.lastLoginAt < 7 * 24 * 60 * 60 * 1000).length
  }
}

export default {
  getUser,
  hasUser,
  createUser,
  getOrCreateUser,
  setUserPassword,
  verifyUserPassword,
  clearUserPassword,
  updateUserLogin,
  deleteUser,
  getAllUsers,
  getUserStats,
  getUserApiPreference,
  setUserApiPreference
}
