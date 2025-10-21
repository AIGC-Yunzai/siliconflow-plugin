import plugin from '../../../lib/plugins/plugin.js'
import Config from '../components/Config.js'

// 存储各群的消息记录
const groupMessages = new Map()

/**
 * 自动复读插件
 */
export class autoRepeat extends plugin {
    constructor() {
        super({
            name: '自动复读',
            dsc: '自动复读群聊中重复出现的消息',
            event: 'message.group',
            priority: 3000,
            rule: [
                {
                    reg: '^#(自动复读|复读)(开启|关闭)$',
                    fnc: 'setRepeatStatus',
                    permission: 'admin'
                },
                {
                    reg: '^#(打断复读|复读打断)(开启|关闭)$',
                    fnc: 'setBreakStatus',
                    permission: 'admin'
                },
                {
                    reg: '^#(自动复读|复读)状态$',
                    fnc: 'getRepeatStatus'
                },
                {
                    reg: '',
                    fnc: 'autoRepeatHandler',
                    log: false
                }
            ]
        })

        // 默认配置
        this.defaultConfig = {
            enabled: false,            // 是否启用自动复读
            breakEnabled: false,       // 是否启用打断复读
            triggerCount: 3,           // 触发复读的次数
            breakCount: 5,             // 触发打断的次数
            probability: 1.0,          // 复读概率 (0-1)
            breakProbability: 0.8,     // 打断概率 (0-1)
            cooldown: 30,              // 复读冷却时间（秒）
            breakMessages: [           // 打断复读的随机消息
                '打断！',
                '不许复读！',
                '复读机退散！',
                '你们够了！',
                '停止复读！',
                '呜呜呜，不要复读了',
                '复读可耻！',
                '人家不复读！'
            ]
        }
    }

    /**
     * 获取群配置
     */
    getGroupConfig(groupId) {
        const config = Config.getConfig()
        if (!config.autoRepeat_config) {
            config.autoRepeat_config = []
        }

        const groupConfig = config.autoRepeat_config.find(config => config.groupId === groupId)

        return {
            ...this.defaultConfig,
            ...groupConfig || {}
        }
    }

    /**
     * 保存群配置
     */
    saveGroupConfig(groupId, newConfig) {
        const config = Config.getConfig()

        if (!config.autoRepeat_config) {
            config.autoRepeat_config = []
        }

        const existingIndex = config.autoRepeat_config.findIndex(item => item.groupId === groupId)
        const currentConfig = this.getGroupConfig(groupId)

        // 合并新配置
        const mergedConfig = {
            ...currentConfig,
            ...newConfig
        }

        // 只保存与默认配置不同的部分
        const configToSave = { groupId: groupId }

        Object.keys(this.defaultConfig).forEach(key => {
            const mergedValue = mergedConfig[key]
            const defaultValue = this.defaultConfig[key]

            // 对于数组类型，需要深度比较
            if (Array.isArray(defaultValue)) {
                if (!Array.isArray(mergedValue) ||
                    mergedValue.length !== defaultValue.length ||
                    !mergedValue.every((item, index) => item === defaultValue[index])) {
                    configToSave[key] = mergedValue
                }
            } else {
                // 普通值的比较
                if (mergedValue !== defaultValue) {
                    configToSave[key] = mergedValue
                }
            }
        })

        // 如果没有需要保存的差异配置，则删除该配置项
        if (Object.keys(configToSave).length === 1) { // 只有 groupId
            if (existingIndex !== -1) {
                config.autoRepeat_config.splice(existingIndex, 1)
            }
        } else {
            if (existingIndex !== -1) {
                // 更新现有配置
                config.autoRepeat_config[existingIndex] = configToSave
            } else {
                // 添加新配置
                config.autoRepeat_config.push(configToSave)
            }
        }

        Config.setConfig(config);
    }

    /**
     * 设置复读开关
     */
    async setRepeatStatus(e) {
        if (!e.isGroup) return false

        const groupId = String(e.group_id)
        const isEnable = e.msg.includes('开启')

        this.saveGroupConfig(groupId, { enabled: isEnable })

        await e.reply(`当前群自动复读已${isEnable ? '开启' : '关闭'}`)
        return true
    }

    /**
     * 设置打断复读开关
     */
    async setBreakStatus(e) {
        if (!e.isGroup) return false

        const groupId = String(e.group_id)
        const isEnable = e.msg.includes('开启')

        this.saveGroupConfig(groupId, { breakEnabled: isEnable })

        await e.reply(`当前群打断复读已${isEnable ? '开启' : '关闭'}`)
        return true
    }

    /**
     * 查看复读状态
     */
    async getRepeatStatus(e) {
        if (!e.isGroup) return false

        const groupId = String(e.group_id)
        const config = this.getGroupConfig(groupId)

        const status = [
            `自动复读：${config.enabled ? '开启' : '关闭'}`,
            `打断复读：${config.breakEnabled ? '开启' : '关闭'}`,
            `触发次数：${config.triggerCount}`,
            `打断次数：${config.breakCount}`,
            `复读概率：${(config.probability * 100).toFixed(1)}%`,
            `打断概率：${(config.breakProbability * 100).toFixed(1)}%`,
            `冷却时间：${config.cooldown}秒`
        ]

        await e.reply(`当前群复读设置状态：\n${status.join('\n')}`)
        return true
    }

    /**
     * 自动复读处理器
     */
    async autoRepeatHandler(e) {
        // 只处理群消息
        if (!e.isGroup) return false

        // 忽略以#开头 /开头的命令
        if (e.msg?.startsWith('#') || e.msg?.startsWith('/')) return false

        const groupId = String(e.group_id)
        const config = this.getGroupConfig(groupId)

        // 如果复读和打断都未启用，直接返回
        if (!config.enabled && !config.breakEnabled) return false

        // 获取或初始化群消息记录
        if (!groupMessages.has(groupId)) {
            groupMessages.set(groupId, {
                lastMessage: null,
                count: 0,
                lastMessageId: null,
                hasRepeated: false  // 标记是否已经复读过
            })
        }

        const groupData = groupMessages.get(groupId)

        // 比较消息是否相同
        if (await this.isSameMessage(e.message, groupData.lastMessage)) {
            groupData.count++

            const now = Date.now()
            const cooldownKey = `autoRepeat:cooldown:${groupId}`
            const lastRepeatTime = await redis.get(cooldownKey)

            // 检查冷却时间
            if (lastRepeatTime && (now - parseInt(lastRepeatTime)) < (config.cooldown * 1000)) {
                return false
            }

            // 先检查是否达到复读次数（如果启用了复读且还没有复读过）
            if (config.enabled && !groupData.hasRepeated && groupData.count === config.triggerCount) {
                // 检查复读概率
                if (Math.random() <= config.probability) {
                    try {
                        // 设置冷却时间
                        await redis.set(cooldownKey, String(now), { EX: config.cooldown })

                        // 发送复读消息
                        await e.reply(groupData.lastMessage)
                        logger.info(`[autoRepeat] 群 ${groupId} 触发复读 (${groupData.count}次)`)

                        // 标记已复读，但不重置计数，继续累计到打断次数
                        groupData.hasRepeated = true
                    } catch (error) {
                        logger.error(`[autoRepeat] 复读失败: ${error}`)
                    }
                }
            }

            // 再检查是否达到打断次数
            if (config.breakEnabled && groupData.count === config.breakCount) {
                // 检查打断概率
                if (Math.random() <= config.breakProbability) {
                    try {
                        // 设置冷却时间
                        await redis.set(cooldownKey, String(now), { EX: config.cooldown })

                        // 发送打断消息
                        const breakMsg = this.getRandomBreakMessage(config.breakMessages, e.msg)
                        await e.reply(breakMsg)
                        logger.info(`[autoRepeat] 群 ${groupId} 触发打断复读 (${groupData.count}次)`)

                        // 重置计数和复读标记
                        groupData.count = 0
                        groupData.hasRepeated = false
                    } catch (error) {
                        logger.error(`[autoRepeat] 打断复读失败: ${error}`)
                    }
                }
            }

            // 如果计数超过打断次数还没触发，重置计数
            if (groupData.count > config.breakCount + 2) {
                groupData.count = 0
                groupData.hasRepeated = false
            }
        } else {
            // 消息不同，重置记录
            groupData.lastMessage = e.message
            groupData.count = 1
            groupData.lastMessageId = e.message_id
            groupData.hasRepeated = false
        }

        return false
    }

    /**
     * 比较两个消息是否相同
     */
    async isSameMessage(msg1, msg2) {
        if (!msg1 || !msg2) return false

        // 如果消息数组长度不同，直接返回false
        if (msg1.length !== msg2.length) return false

        // 逐个比较消息段
        for (let i = 0; i < msg1.length; i++) {
            const segment1 = msg1[i]
            const segment2 = msg2[i]

            // 比较消息段类型
            if (segment1.type !== segment2.type) return false

            // 根据不同类型比较内容
            switch (segment1.type) {
                case 'text':
                    if (segment1.text !== segment2.text) return false
                    break
                case 'image':
                    // 图片比较文件名或URL
                    if (segment1.file !== segment2.file && segment1.url !== segment2.url) return false
                    break
                case 'at':
                    if (segment1.qq !== segment2.qq) return false
                    break
                case 'face':
                    if (segment1.id !== segment2.id) return false
                    break
                default:
                    // 其他类型直接比较data
                    if (JSON.stringify(segment1.data) !== JSON.stringify(segment2.data)) return false
            }
        }

        return true
    }

    /**
     * 获取随机打断消息
     */
    getRandomBreakMessage(breakMessages, originalMsg) {
        // 随机选择一个打断消息
        const randomMsg = breakMessages[Math.floor(Math.random() * breakMessages.length)]

        // 如果原消息是纯文本，可以生成一些变化
        if (typeof originalMsg === 'string' && originalMsg.length > 0) {
            const variations = [
                randomMsg,
                this.scrambleText(originalMsg),
                `${randomMsg}\n复读什么${originalMsg}`,
                `不许复读"${originalMsg.substring(0, 10)}${originalMsg.length > 10 ? '...' : ''}"`
            ]
            return variations[Math.floor(Math.random() * variations.length)]
        }

        return randomMsg
    }

    /**
     * 打乱文本内容
     */
    scrambleText(text) {
        if (text.length <= 2) return text

        const chars = text.split('')
        const first = chars.shift()
        const last = chars.pop()

        // 打乱中间的字符
        for (let i = chars.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [chars[i], chars[j]] = [chars[j], chars[i]]
        }

        return first + chars.join('') + last
    }
}