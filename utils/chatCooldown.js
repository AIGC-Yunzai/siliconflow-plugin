/**
 * 对话冷却管理器
 * 用于控制用户在群聊中的对话频率，防止并发对话
 */
const ChatCooldown = {
    /**
     * 检查用户是否可以开始新对话
     * @param {string} userId - 用户ID
     * @param {string} groupId - 群ID，私聊时传入空字符串或null
     * @param {boolean} isMaster - 是否为主人，主人不受冷却限制
     * @param {number} cdTime - 冷却时间（秒），默认600秒
     * @returns {Promise<{canChat: boolean, remainingTime: number, message: string}>}
     */
    async check(userId, groupId, isMaster = false, cdTime = 600) {
        // 主人不受冷却限制
        if (isMaster) {
            return {
                canChat: true,
                remainingTime: 0,
                message: '主人不受冷却限制'
            }
        }

        // 私聊使用 8888 作为群号
        const effectiveGroupId = groupId || '8888'
        const cooldownKey = `sf_plugin:llm:COOLDOWN:${effectiveGroupId}:${userId}`

        // 检查冷却时间
        const lastChatTime = await redis.get(cooldownKey)
        if (lastChatTime) {
            const elapsed = Math.floor((Date.now() - parseInt(lastChatTime)) / 1000)
            const remaining = cdTime - elapsed

            if (remaining > 0) {
                return {
                    canChat: false,
                    remainingTime: remaining,
                    message: `请等待 ${remaining} 秒后再发起对话`
                }
            }
        }

        // 可以开始新对话
        return {
            canChat: true,
            remainingTime: 0,
            message: '可以开始对话'
        }
    },

    /**
     * 标记对话开始
     * @param {string} userId - 用户ID
     * @param {string} groupId - 群ID，私聊时传入空字符串或null
     * @param {number} cdTime - 冷却时间（秒），默认600秒
     * @returns {Promise<void>}
     */
    async start(userId, groupId, cdTime = 600) {
        const effectiveGroupId = groupId || '8888'
        const cooldownKey = `sf_plugin:llm:COOLDOWN:${effectiveGroupId}:${userId}`
        // 设置冷却开始时间
        await redis.set(cooldownKey, Date.now().toString(), { EX: cdTime + 60 })
    },

    /**
     * 标记对话结束（清除冷却）
     * @param {string} userId - 用户ID
     * @param {string} groupId - 群ID，私聊时传入空字符串或null
     * @returns {Promise<void>}
     */
    async end(userId, groupId) {
        const effectiveGroupId = groupId || '8888'
        const cooldownKey = `sf_plugin:llm:COOLDOWN:${effectiveGroupId}:${userId}`
        // 清除冷却，用户可以立即开始下一次对话
        await redis.del(cooldownKey)
    }
}

export default ChatCooldown
