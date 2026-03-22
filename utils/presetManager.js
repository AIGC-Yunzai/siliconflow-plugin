/**
 * WebUI 预设管理模块
 * 每个预设存储为单独的 Markdown 文件，支持全局预设和用户个人预设
 * 存储路径：
 *   - 全局预设: data/sf-plugin/Web_presets/global/{preset_name}.md
 *   - 用户预设: data/sf-plugin/Web_presets/users/{qq}/{preset_name}.md
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data', 'sf-plugin')
const PRESETS_DIR = path.join(DATA_DIR, 'Web_presets')
const GLOBAL_PRESETS_DIR = path.join(PRESETS_DIR, 'global')
const USERS_PRESETS_DIR = path.join(PRESETS_DIR, 'users')

/**
 * 确保目录存在
 */
function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * 确保预设根目录存在
 */
function ensurePresetDirs() {
  ensureDir(GLOBAL_PRESETS_DIR)
  ensureDir(USERS_PRESETS_DIR)
}

/**
 * 清理文件名中的非法字符，防止路径遍历攻击
 * @param {string} name 原始预设名
 * @returns {string} 安全的文件名
 */
function sanitizeFileName(name) {
  if (!name || typeof name !== 'string') {
    return ''
  }
  // 1. 替换 Windows/Unix 不允许的字符
  // 2. 移除路径遍历字符 (../, ./, ..\\, .\\)
  // 3. 移除以点开头的隐藏文件名
  // 4. 限制长度（大多数文件系统限制文件名长度为255字节）
  const sanitized = name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\.{2,}[/\\]?/g, '_')
    .replace(/^\.+/, '_')
    .trim()

  // 限制文件名长度（预留 .md 后缀空间）
  const MAX_FILENAME_LENGTH = 240
  if (sanitized.length > MAX_FILENAME_LENGTH) {
    return sanitized.substring(0, MAX_FILENAME_LENGTH)
  }
  return sanitized
}

/**
 * 获取全局预设文件路径
 * @param {string} name 预设名称
 * @returns {string} 文件路径
 */
function getGlobalPresetPath(name) {
  const safeName = sanitizeFileName(name)
  return path.join(GLOBAL_PRESETS_DIR, `${safeName}.md`)
}

/**
 * 获取用户预设文件路径
 * @param {string} qq QQ号
 * @param {string} name 预设名称
 * @returns {string} 文件路径
 */
function getUserPresetPath(qq, name) {
  const safeName = sanitizeFileName(name)
  const userDir = path.join(USERS_PRESETS_DIR, String(qq))
  ensureDir(userDir)
  return path.join(userDir, `${safeName}.md`)
}

/**
 * 获取全局预设列表
 * @returns {Array} 预设列表 [{name, prompt}]
 */
export function getGlobalPresets() {
  ensurePresetDirs()

  try {
    const files = readdirSync(GLOBAL_PRESETS_DIR)
    const presets = []

    for (const file of files) {
      if (file.endsWith('.md') || file.endsWith('.txt')) {
        const name = path.basename(file, path.extname(file))
        const filePath = path.join(GLOBAL_PRESETS_DIR, file)
        try {
          const prompt = readFileSync(filePath, 'utf8')
          presets.push({ name, prompt })
        } catch (err) {
          logger.error(`[sf插件] 读取全局预设 ${name} 失败:`, err)
        }
      }
    }

    return presets
  } catch (error) {
    logger.error('[sf插件] 读取全局预设列表失败:', error)
    return []
  }
}

/**
 * 获取单个全局预设
 * @param {string} name 预设名称
 * @returns {Object|null} 预设对象或 null
 */
export function getGlobalPreset(name) {
  const filePath = getGlobalPresetPath(name)

  if (!existsSync(filePath)) {
    return null
  }

  try {
    const prompt = readFileSync(filePath, 'utf8')
    return { name, prompt }
  } catch (error) {
    logger.error(`[sf插件] 读取全局预设 ${name} 失败:`, error)
    return null
  }
}

/**
 * 保存全局预设
 * @param {string} name 预设名称
 * @param {string} prompt 预设内容
 * @returns {Object} 结果
 */
export function saveGlobalPreset(name, prompt) {
  if (!name || !prompt) {
    return { success: false, error: '预设名称和内容不能为空' }
  }

  // 验证名称安全性
  const safeName = sanitizeFileName(name)
  if (!safeName || safeName.length === 0) {
    return { success: false, error: '预设名称包含非法字符' }
  }
  if (safeName.length > 200) {
    return { success: false, error: '预设名称过长（最大200字符）' }
  }

  // 验证内容大小（防止超大文件）
  if (prompt.length > 10 * 1024 * 1024) { // 10MB 限制
    return { success: false, error: '预设内容过大（最大10MB）' }
  }

  ensurePresetDirs()

  try {
    const filePath = getGlobalPresetPath(name)
    writeFileSync(filePath, prompt, 'utf8')
    return { success: true, message: '预设已保存' }
  } catch (error) {
    logger.error('[sf插件] 保存全局预设失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 删除全局预设
 * @param {string} name 预设名称
 * @returns {Object} 结果
 */
export function deleteGlobalPreset(name) {
  const filePath = getGlobalPresetPath(name)

  if (!existsSync(filePath)) {
    return { success: true, message: '预设不存在' }
  }

  try {
    unlinkSync(filePath)
    return { success: true, message: '预设已删除' }
  } catch (error) {
    logger.error('[sf插件] 删除全局预设失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 获取用户预设列表
 * @param {string} qq QQ号
 * @returns {Array} 预设列表 [{name, prompt}]
 */
export function getUserPresets(qq) {
  if (!qq) return []

  ensurePresetDirs()
  const userDir = path.join(USERS_PRESETS_DIR, String(qq))

  if (!existsSync(userDir)) {
    return []
  }

  try {
    const files = readdirSync(userDir)
    const presets = []

    for (const file of files) {
      if (file.endsWith('.md') || file.endsWith('.txt')) {
        const name = path.basename(file, path.extname(file))
        const filePath = path.join(userDir, file)
        try {
          const prompt = readFileSync(filePath, 'utf8')
          presets.push({ name, prompt })
        } catch (err) {
          logger.error(`[sf插件] 读取用户预设 ${name} 失败:`, err)
        }
      }
    }

    return presets
  } catch (error) {
    logger.error(`[sf插件] 读取用户 ${qq} 预设列表失败:`, error)
    return []
  }
}

/**
 * 保存用户预设
 * @param {string} qq QQ号
 * @param {string} name 预设名称
 * @param {string} prompt 预设内容
 * @returns {Object} 结果
 */
export function saveUserPreset(qq, name, prompt) {
  if (!qq || !name || !prompt) {
    return { success: false, error: '参数不能为空' }
  }

  // 验证名称安全性
  const safeName = sanitizeFileName(name)
  if (!safeName || safeName.length === 0) {
    return { success: false, error: '预设名称包含非法字符' }
  }
  if (safeName.length > 200) {
    return { success: false, error: '预设名称过长（最大200字符）' }
  }

  // 验证内容大小
  if (prompt.length > 10 * 1024 * 1024) { // 10MB 限制
    return { success: false, error: '预设内容过大（最大10MB）' }
  }

  ensurePresetDirs()

  try {
    const filePath = getUserPresetPath(qq, name)
    writeFileSync(filePath, prompt, 'utf8')
    return { success: true, message: '预设已保存' }
  } catch (error) {
    logger.error('[sf插件] 保存用户预设失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 删除用户预设
 * @param {string} qq QQ号
 * @param {string} name 预设名称
 * @returns {Object} 结果
 */
export function deleteUserPreset(qq, name) {
  if (!qq || !name) {
    return { success: false, error: '参数不能为空' }
  }

  const filePath = getUserPresetPath(qq, name)

  if (!existsSync(filePath)) {
    return { success: true, message: '预设不存在' }
  }

  try {
    unlinkSync(filePath)
    return { success: true, message: '预设已删除' }
  } catch (error) {
    logger.error('[sf插件] 删除用户预设失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 获取所有用户的预设列表（仅名称，用于管理）
 * @returns {Object} {qq: [preset_names]}
 */
export function getAllUsersPresetList() {
  ensurePresetDirs()

  try {
    const result = {}
    const userDirs = readdirSync(USERS_PRESETS_DIR)

    for (const qq of userDirs) {
      const userDir = path.join(USERS_PRESETS_DIR, qq)
      try {
        const files = readdirSync(userDir)
        const names = files
          .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
          .map(f => path.basename(f, path.extname(f)))
        if (names.length > 0) {
          result[qq] = names
        }
      } catch (err) {
        // 跳过无法读取的目录
      }
    }

    return result
  } catch (error) {
    return {}
  }
}

/**
 * 从旧版配置迁移全局预设（config.presets -> 文件）
 * @param {Array} oldPresets 旧版预设数组
 * @returns {number} 迁移成功的数量
 */
export function migrateGlobalPresets(oldPresets) {
  if (!Array.isArray(oldPresets) || oldPresets.length === 0) {
    return 0
  }

  ensurePresetDirs()
  let migrated = 0

  for (const preset of oldPresets) {
    if (preset.name && preset.prompt) {
      const result = saveGlobalPreset(preset.name, preset.prompt)
      if (result.success) {
        migrated++
      }
    }
  }

  if (migrated > 0) {
    logger.mark(`[sf插件] 已迁移 ${migrated} 个全局预设到文件存储`)
  }

  return migrated
}

/**
 * 获取预设存储统计信息
 * @returns {Object} 统计信息
 */
export function getPresetsStats() {
  ensurePresetDirs()

  const globalPresets = getGlobalPresets()
  const usersList = getAllUsersPresetList()
  let userPresetCount = 0

  for (const qq of Object.keys(usersList)) {
    userPresetCount += usersList[qq].length
  }

  return {
    global: {
      count: globalPresets.length,
      totalSize: globalPresets.reduce((sum, p) => sum + (p.prompt?.length || 0), 0)
    },
    users: {
      count: Object.keys(usersList).length,
      presetCount: userPresetCount
    }
  }
}
