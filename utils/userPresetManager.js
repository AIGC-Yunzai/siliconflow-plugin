/**
 * 用户个人预设管理
 * 每个 QQ 号有自己的独立预设列表
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data', 'sf-plugin')
const USER_PRESETS_FILE = path.join(DATA_DIR, 'user-presets.json')

// 确保数据目录存在
function ensureDataDir() {
    if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true })
    }
}

// 读取用户预设数据
function readUserPresets() {
    ensureDataDir()
    if (!existsSync(USER_PRESETS_FILE)) {
        return {}
    }
    try {
        const data = readFileSync(USER_PRESETS_FILE, 'utf8')
        return JSON.parse(data)
    } catch (error) {
        logger.error('[sf插件] 读取用户预设失败:', error)
        return {}
    }
}

// 写入用户预设数据
function writeUserPresets(data) {
    ensureDataDir()
    try {
        writeFileSync(USER_PRESETS_FILE, JSON.stringify(data, null, 2), 'utf8')
        return true
    } catch (error) {
        logger.error('[sf插件] 写入用户预设失败:', error)
        return false
    }
}

/**
 * 获取用户的预设列表
 * @param {string} qq - QQ 号
 * @returns {Array} 预设列表
 */
export function getUserPresets(qq) {
    const presets = readUserPresets()
    return presets[qq] || []
}

/**
 * 添加用户预设
 * @param {string} qq - QQ 号
 * @param {string} name - 预设名称
 * @param {string} prompt - 预设内容
 * @returns {Object} 结果
 */
export function addUserPreset(qq, name, prompt) {
    if (!qq || !name || !prompt) {
        return { success: false, error: '参数不能为空' }
    }
    
    const presets = readUserPresets()
    if (!presets[qq]) {
        presets[qq] = []
    }
    
    // 检查是否已存在同名预设
    const existingIndex = presets[qq].findIndex(p => p.name === name)
    if (existingIndex >= 0) {
        presets[qq][existingIndex] = { name, prompt, updatedAt: Date.now() }
    } else {
        presets[qq].push({ name, prompt, createdAt: Date.now() })
    }
    
    if (writeUserPresets(presets)) {
        return { success: true, message: existingIndex >= 0 ? '预设已更新' : '预设已添加' }
    }
    return { success: false, error: '保存失败' }
}

/**
 * 删除用户预设
 * @param {string} qq - QQ 号
 * @param {string} name - 预设名称
 * @returns {Object} 结果
 */
export function deleteUserPreset(qq, name) {
    const presets = readUserPresets()
    if (!presets[qq]) {
        return { success: true, message: '预设不存在' }
    }
    
    presets[qq] = presets[qq].filter(p => p.name !== name)
    
    // 如果该用户没有预设了，删除该用户的键
    if (presets[qq].length === 0) {
        delete presets[qq]
    }
    
    if (writeUserPresets(presets)) {
        return { success: true, message: '预设已删除' }
    }
    return { success: false, error: '删除失败' }
}

/**
 * 获取所有用户的预设（主人用）
 * @returns {Object} 所有用户预设
 */
export function getAllUserPresets() {
    return readUserPresets()
}

/**
 * 清理无效用户的预设（可选，定期清理）
 * @param {Array} validQQs - 有效的 QQ 号列表
 */
export function cleanupUserPresets(validQQs) {
    const presets = readUserPresets()
    const validSet = new Set(validQQs)
    let cleaned = 0
    
    for (const qq of Object.keys(presets)) {
        if (!validSet.has(qq)) {
            delete presets[qq]
            cleaned++
        }
    }
    
    if (cleaned > 0) {
        writeUserPresets(presets)
    }
    return cleaned
}
