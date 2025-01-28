import Config from '../components/Config.js'

/** 格式化上下文消息为Gemini API格式 */
export function formatContextForGemini(messages) {
    return messages.map(msg => {
        // 构造基本消息结构
        const formattedMsg = {
            // 将assistant转换为model,其他保持不变
            role: msg.role === 'assistant' ? 'model' : msg.role,
            parts: []
        }

        // 添加文本内容
        if (typeof msg.content === 'object') {
            formattedMsg.parts.push({ text: msg.content.text })
        } else {
            formattedMsg.parts.push({ text: msg.content })
        }

        // 只从 imageBase64 字段获取图片
        if (msg.imageBase64 && Array.isArray(msg.imageBase64)) {
            msg.imageBase64.forEach(base64 => {
                formattedMsg.parts.push({
                    inline_data: {
                        mime_type: "image/jpeg",
                        data: base64
                    }
                })
            })
        }

        return formattedMsg
    })
}

/** 保存对话上下文 */
export async function saveContext(userId, message) {
    try {
        const config = Config.getConfig()
        const maxHistory = config.gg_maxHistoryLength * 2 || 40
        const key = `sfplugin:llm:${userId}:${Date.now()}`

        // 直接保存消息,不修改content结构
        await redis.set(key, JSON.stringify(message), { EX: config.gg_HistoryExTime * 60 * 60 }) // x小时过期

        // 获取该用户的所有消息
        const keys = await redis.keys(`sfplugin:llm:${userId}:*`)
        keys.sort((a, b) => {
            const timeA = parseInt(a.split(':')[3])
            const timeB = parseInt(b.split(':')[3])
            return timeB - timeA // 按时间戳降序排序
        })

        // 如果超出限制，删除旧消息
        if (keys.length > maxHistory) {
            const keysToDelete = keys.slice(maxHistory)
            for (const key of keysToDelete) {
                await redis.del(key)
            }
        }

        return true
    } catch (error) {
        logger.error('[Context] 保存上下文失败:', error)
        return false
    }
}

/** 加载用户历史对话 */
export async function loadContext(userId) {
    try {
        const config = Config.getConfig()
        const maxHistory = config.gg_maxHistoryLength * 2 || 40

        // 获取该用户的所有消息
        const keys = await redis.keys(`sfplugin:llm:${userId}:*`)
        keys.sort((a, b) => {
            const timeA = parseInt(a.split(':')[3])
            const timeB = parseInt(b.split(':')[3])
            return timeA - timeB // 按时间戳升序排序
        })

        // 只获取最近的N条消息
        const recentKeys = keys.slice(-maxHistory)
        const messages = []

        for (const key of recentKeys) {
            const data = await redis.get(key)
            if (data) {
                messages.push(JSON.parse(data))
            }
        }

        return messages
    } catch (error) {
        logger.error('[Context] 加载上下文失败:', error)
        return []
    }
}

/** 清除用户前 n 条历史对话 */
export async function clearContextByCount(userId, count = 1) {
    try {
        // 获取该用户的所有消息
        const keys = await redis.keys(`sfplugin:llm:${userId}:*`)
        keys.sort((a, b) => {
            const timeA = parseInt(a.split(':')[3])
            const timeB = parseInt(b.split(':')[3])
            return timeA - timeB // 按时间戳升序排序
        })

        // 删除最近的 n 条消息
        const keysToDelete = keys.slice(-count * 2)
        for (const key of keysToDelete) {
            await redis.del(key)
        }

        return {
            success: true,
            deletedCount: keysToDelete.length / 2
        }
    } catch (error) {
        logger.error('[Context] 清除历史对话失败:', error)
        return {
            success: false,
            error: error.message
        }
    }
}

/** 清除指定用户的上下文记录 */
export async function clearUserContext(userId) {
    try {
        const keys = await redis.keys(`sfplugin:llm:${userId}:*`)
        for (const key of keys) {
            await redis.del(key)
        }
        return true
    } catch (error) {
        logger.error('[Context] 清除用户上下文失败:', error)
        return false
    }
}

/** 清除所有用户的上下文记录 */
export async function clearAllContext() {
    try {
        const keys = await redis.keys('sfplugin:llm:*')
        for (const key of keys) {
            await redis.del(key)
        }
        return true
    } catch (error) {
        logger.error('[Context] 清除所有上下文失败:', error)
        return false
    }
} 