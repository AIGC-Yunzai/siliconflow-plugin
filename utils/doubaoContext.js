import Config from '../components/Config.js'

/**
 * 豆包对话上下文管理工具
 * 使用 Redis 存储每个用户的 conversation_id
 */

/**
 * 获取用户的 conversation_id
 * @param {string} userId - 用户ID
 * @returns {Promise<string|null>} - conversation_id 或 null
 */
export async function getConversationId(userId) {
    const config = Config.getConfig().Doubao
    const key = `Yz:doubao:conversation:${userId}`
    
    try {
        const conversationId = await redis.get(key)
        return conversationId || null
    } catch (error) {
        logger.error('[豆包上下文] 获取对话ID失败:', error)
        return null
    }
}

/**
 * 保存用户的 conversation_id
 * @param {string} userId - 用户ID
 * @param {string} conversationId - 对话ID
 * @returns {Promise<boolean>} - 是否保存成功
 */
export async function saveConversationId(userId, conversationId) {
    const config = Config.getConfig().Doubao
    const key = `Yz:doubao:conversation:${userId}`
    const expirySeconds = (config?.contextExpiryHours || 24) * 60 * 60 // 默认24小时
    
    try {
        await redis.set(key, conversationId, { EX: expirySeconds })
        logger.debug(`[豆包上下文] 保存对话ID: userId=${userId}, conversationId=${conversationId}`)
        return true
    } catch (error) {
        logger.error('[豆包上下文] 保存对话ID失败:', error)
        return false
    }
}

/**
 * 删除用户的 conversation_id（结束对话）
 * @param {string} userId - 用户ID
 * @returns {Promise<boolean>} - 是否删除成功
 */
export async function deleteConversationId(userId) {
    const key = `Yz:doubao:conversation:${userId}`
    
    try {
        await redis.del(key)
        logger.info(`[豆包上下文] 删除对话ID: userId=${userId}`)
        return true
    } catch (error) {
        logger.error('[豆包上下文] 删除对话ID失败:', error)
        return false
    }
}

/**
 * 检查用户是否有活跃的对话
 * @param {string} userId - 用户ID
 * @returns {Promise<boolean>} - 是否有活跃对话
 */
export async function hasActiveConversation(userId) {
    const conversationId = await getConversationId(userId)
    return conversationId !== null
}

/**
 * 获取对话剩余过期时间
 * @param {string} userId - 用户ID
 * @returns {Promise<number>} - 剩余秒数，-1表示不存在或错误
 */
export async function getConversationTTL(userId) {
    const key = `Yz:doubao:conversation:${userId}`
    
    try {
        const ttl = await redis.ttl(key)
        return ttl
    } catch (error) {
        logger.error('[豆包上下文] 获取对话TTL失败:', error)
        return -1
    }
}
