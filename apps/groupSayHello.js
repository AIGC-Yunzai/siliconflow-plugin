import plugin from '../../../lib/plugins/plugin.js'
import Config from '../components/Config.js'
import {
    getBotByQQ,
    getChatHistory_w,
    buildChatHistoryPrompt,
} from '../utils/onebotUtils.js'
import {
    hidePrivacyInfo,
    removeCQCode,
} from '../utils/common.js'

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const groupSayHello_Switch = Config.getConfig().groupSayHello?.enabled;

/**
 * 处理消息中的 CQ at 码，转换为 segment.at()
 * @param {string} text 原始文本
 * @returns {Array} 消息数组
 */
function processCQAtCode(text) {
    // 匹配 [CQ:at,id=123456] 或 [CQ:at,qq=123456] 格式
    const cqAtRegex = /\[CQ:at,(?:id|qq)=(\d+)\]/gi

    // 如果没有匹配到 CQ 码，直接返回原文本
    if (!cqAtRegex.test(text)) {
        return [text]
    }

    // 重置 regex 的 lastIndex
    cqAtRegex.lastIndex = 0

    const result = []
    let lastIndex = 0
    let match

    while ((match = cqAtRegex.exec(text)) !== null) {
        // 添加 CQ 码之前的文本
        if (match.index > lastIndex) {
            const beforeText = text.substring(lastIndex, match.index)
            if (beforeText) {
                result.push(beforeText)
            }
        }

        // 添加 segment.at
        const userId = match[1]
        result.push(segment.at(userId))

        lastIndex = match.index + match[0].length
    }

    // 添加最后剩余的文本
    if (lastIndex < text.length) {
        const remainingText = text.substring(lastIndex)
        if (remainingText) {
            result.push(remainingText)
        }
    }

    return result
}

/**
 * 自动打招呼插件
 */
export class groupSayHello extends plugin {
    constructor() {
        super({
            name: '群自动打招呼',
            dsc: '定时在群聊中自动打招呼',
            event: 'message',
            priority: 5000,
            rule: [
                {
                    reg: '^#自动打招呼(开启|关闭)$',
                    fnc: 'toggleGroupSayHello',
                    permission: 'master'
                },
                {
                    reg: '^#打招呼配置$',
                    fnc: 'showConfig',
                    permission: 'master'
                },
                {
                    reg: '^#立即打招呼$',
                    fnc: 'sayHelloNow',
                    permission: 'master'
                }
            ],
        })

        this.task = [
            {
                // 使用配置的定时表达式，默认每1小时执行一次
                cron: Config.getConfig().groupSayHello?.cron_time || '0 0 * * * ? *',
                name: '群自动打招呼-定时发送',
                fnc: this.autoSayHello.bind(this),
                log: false
            },
        ]
    }

    /**
     * 自动打招呼主函数（定时任务）
     */
    async autoSayHello() {
        // 检查功能是否启用
        if (!groupSayHello_Switch) {
            return false
        }

        const config = Config.getConfig()

        // 获取允许的群列表（对象数组格式：{groupId, replyRate, switchOn}）
        const allowGroups = config.groupSayHello?.allowGroups || []

        if (allowGroups.length === 0) {
            logger.debug('[群自动打招呼] 未配置允许的群组')
            return false
        }

        // 遍历配置的群列表，只处理 switchOn = true 的群
        for (const groupConfig of allowGroups) {
            try {
                const groupId = groupConfig.groupId
                const switchOn = groupConfig.switchOn ?? false

                // 只处理开启了打招呼的群
                if (!switchOn) {
                    logger.debug(`[群自动打招呼] 群 ${groupId} 的开关已关闭，跳过`)
                    continue
                }

                // 获取该群的概率配置（0-1之间的小数，默认1表示100%触发）
                const replyRate = groupConfig.replyRate ?? 1
                const groupPrompt = groupConfig.groupPrompt

                // 每个群单独进行概率判断
                const randomValue = Math.random()

                if (randomValue <= replyRate) {
                    logger.mark(`[群自动打招呼] 群 ${groupId} 开始执行打招呼，使用gg接口 ${groupConfig.usingAPI + 1}`)
                    await this.sendGreeting(groupId, config, null, { groupPrompt, groupConfig })
                    // 避免发送过快，休息一下
                    await sleep(2000)
                } else {
                    logger.debug(`[群自动打招呼] 群 ${groupId} 概率判断未通过 (${randomValue.toFixed(2)} > ${replyRate})，跳过本次发送`)
                }
            } catch (error) {
                logger.error(`[群自动打招呼] 群 ${groupConfig.groupId} 发送失败: ${error}`)
            }
        }

        return false
    }

    /**
     * 立即打招呼命令
     */
    async sayHelloNow(e) {
        if (!e.isGroup) {
            await e.reply('此命令只能在群聊中使用')
            return true
        }

        const config = Config.getConfig()
        const groupId = String(e.group_id)

        await e.reply('正在生成打招呼内容...')

        try {
            // 查找当前群的所有配置（可能有多个配置使用不同的接口）
            const allowGroups = config.groupSayHello?.allowGroups || []
            const currentGroupConfigs = allowGroups.filter(g => g.groupId === groupId)

            if (currentGroupConfigs.length === 0) {
                await e.reply('⚠️ 本群未配置自动打招呼功能')
                return true
            }

            // 遍历该群的所有配置，每个配置发送一次打招呼
            for (const groupConfig of currentGroupConfigs) {
                const groupPrompt = groupConfig?.groupPrompt || ''
                const usingApiIndex = groupConfig?.usingAPI ?? 0

                logger.mark(`[群自动打招呼] 群 ${groupId} 立即打招呼，使用gg接口 ${usingApiIndex + 1}`)
                await this.sendGreeting(groupId, config, e, { groupPrompt, groupConfig })

                // 如果有多个配置，间隔一下避免发送过快
                if (currentGroupConfigs.length > 1) {
                    await sleep(2000)
                }
            }

            await e.reply('打招呼完成！', false)
        } catch (error) {
            logger.error(`[群自动打招呼] 立即打招呼失败: ${error}`)
            await e.reply(`打招呼失败: ${error.message}`)
        }

        return true
    }

    /**
     * 发送打招呼消息
     * @param {string} groupId 群号
     * @param {Object} config 配置对象
     * @param {Object} e 事件对象（可选）
     * @param {Object} opt （可选）
     * @param {string} opt.groupPrompt 群单独提示词
     * @param {Object} opt.groupConfig 群配置对象
     */
    async sendGreeting(groupId, config, e = null, opt = {}) {
        // 从 groupConfig 中获取 botQQArr，如果没有则从全局配置获取
        const groupConfig = opt.groupConfig || {}
        const botQQArr = groupConfig.botQQArr || []
        const bot = getBotByQQ(botQQArr)

        // 获取群对象
        const group = bot.pickGroup ? bot.pickGroup(groupId) : (bot[groupId] ? bot[groupId].pickGroup(groupId) : null)

        if (!group) {
            logger.error(`[群自动打招呼] 无法获取群 ${groupId} 对象`)
            return false
        }

        // 获取聊天记录
        let chatHistory = []
        try {
            chatHistory = await getChatHistory_w(group, 50)
            logger.debug(`[群自动打招呼] 群 ${groupId} 获取到 ${chatHistory.length} 条聊天记录`)
        } catch (error) {
            logger.error(`[群自动打招呼] 获取群 ${groupId} 聊天记录失败: ${error}`)
        }

        // 如果没有传入e对象，需要构造一个假的e对象用于调用generateGeminiPrompt
        let eventObj = e
        if (!eventObj) {
            // 构造基础事件对象
            eventObj = {
                group_id: groupId,
                isGroup: true,
                bot: bot,
                sender: {
                    card: config.botName || 'Bot',
                    nickname: config.botName || 'Bot'
                },
                reply: async (msg) => {
                    try {
                        await group.sendMsg(msg)
                    } catch (err) {
                        logger.error(`[群自动打招呼] 发送消息失败: ${err}`)
                    }
                }
            }
        }

        let prompt = opt.groupPrompt || `请根据以下最近的群聊记录，生成一条像真人一样的回复，长度控制在50字以内，直接输出内容，不要加任何前缀或解释，尽量接着群聊天记录的话题或做延伸。`

        // 真 At
        if (groupConfig.trueAtUser) {
            prompt += "\n如果你想要At某个用户，请在回复中使用格式 [CQ:at,id=用户id号]，例如 [CQ:at,id=123456]。注意：使用At码后不要再重复写用户昵称，直接继续你的回复内容即可。"
        }

        // 构造打招呼的prompt
        const greetingPrompt = buildChatHistoryPrompt(chatHistory, prompt, bot.uin)

        // 导入SF_Painting类来调用generateGeminiPrompt
        try {
            const { SF_Painting } = await import('./SF_Painting.js')
            const sfPainting = new SF_Painting()

            // 获取选中的接口配置，优先从 groupConfig 中读取，如果没有则从全局配置读取
            const usingApiIndex = groupConfig.usingAPI ?? 0
            let ggBaseUrl, ggKey, model, systemPrompt

            if (usingApiIndex > 0 && config.gg_APIList && config.gg_APIList[usingApiIndex - 1]) {
                // 使用接口列表中的配置
                const apiConfig = config.gg_APIList[usingApiIndex - 1]
                ggBaseUrl = apiConfig.apiBaseUrl || config.ggBaseUrl || "https://generativelanguage.googleapis.com"
                ggKey = sfPainting.get_random_key(apiConfig.apiKey) || sfPainting.get_random_key(config.ggKey) || ""
                model = apiConfig.model || config.gg_model || "gemini-2.0-flash-exp"
                systemPrompt = apiConfig.prompt || config.gg_Prompt || "你是一个活泼友好的群聊助手，会根据最近的聊天内容主动打招呼或发起话题。"
            } else {
                // 使用默认配置
                ggBaseUrl = config.ggBaseUrl || "https://sfgemini.vledx.ggff.net"
                ggKey = sfPainting.get_random_key(config.ggKey) || "sf-plugin"
                model = config.gg_model || "gemini-2.0-flash-exp"
                systemPrompt = config.gg_Prompt || "你是一个活泼友好的群聊助手，会根据最近的聊天内容主动打招呼或发起话题。"
            }

            if (!ggKey) {
                logger.error('[群自动打招呼] 未配置 Gemini API Key')
                return false
            }

            // 调用参数
            const opt = {
                model: model,
                systemPrompt: systemPrompt,
                useSearch: false,
                enableImageGeneration: false
            }

            // 调用generateGeminiPrompt
            let { answer, sources, imageBase64, textImagePairs, isError } = await sfPainting.generateGeminiPrompt(
                greetingPrompt,
                ggBaseUrl,
                ggKey,
                opt,
                [],
                eventObj
            )

            // 如果返回错误,不发送打招呼消息
            if (isError) {
                logger.error(`[群自动打招呼] Gemini 返回错误: ${hidePrivacyInfo(answer)}`)
                return false
            }

            if (answer) {
                // 构建消息数组
                let messages = []

                // 如果有生成的图片,根据是否有配对信息来处理
                if (imageBase64 && imageBase64.length > 0) {
                    if (textImagePairs && textImagePairs.length > 0) {
                        // 有配对信息，按配对顺序发送
                        textImagePairs.forEach((pair) => {
                            if (pair.text) {
                                // 处理文本中的 CQ at 码
                                if (groupConfig.trueAtUser) {
                                    const processedText = processCQAtCode(pair.text)
                                    messages.push(...processedText)
                                } else {
                                    messages.push(pair.text)
                                }
                            }
                            messages.push(segment.image(`base64://${pair.image.replace(/^data:image\/\w+;base64,/, "")}`))
                        })
                    } else {
                        // 没有配对信息，先发送所有图片，再发送文本
                        imageBase64.forEach((imgData) => {
                            messages.push(segment.image(`base64://${imgData.replace(/^data:image\/\w+;base64,/, "")}`))
                        })
                        // 处理文本中的 CQ at 码
                        if (groupConfig.trueAtUser) {
                            const processedText = processCQAtCode(answer)
                            messages.push(...processedText)
                        } else {
                            messages.push(answer)
                        }
                    }
                } else {
                    // 没有图片，只发送文本
                    // 处理文本中的 CQ at 码
                    if (groupConfig.trueAtUser) {
                        const processedText = processCQAtCode(answer)
                        messages.push(...processedText)
                    } else {
                        messages.push(answer)
                    }
                }

                // 移除 CQ
                messages = removeCQCode(messages);

                // 发送打招呼消息
                await group.sendMsg(messages)
                // logger.debug(`[群自动打招呼] 群 ${groupId} 发送成功`)
            } else {
                logger.error('[群自动打招呼] Gemini 返回为空')
            }

        } catch (error) {
            logger.error(`[群自动打招呼] 调用 Gemini 失败: ${error}`)
            throw error
        }

        return true
    }

    /**
     * 切换当前群的自动打招呼功能
     */
    async toggleGroupSayHello(e) {
        if (!e.isGroup) {
            await e.reply('此命令只能在群聊中使用')
            return true
        }

        if (!e.isMaster) {
            await e.reply('只有主人可以设置群打招呼功能哦~')
            return true
        }

        const groupId = String(e.group_id)
        const action = e.msg.includes('开启') ? 'enable' : 'disable'

        try {
            let config = Config.getConfig()

            const currentAllowGroups = config.groupSayHello.allowGroups || []

            if (action === 'enable') {
                // 检查群是否已经存在
                const existingGroupIndex = currentAllowGroups.findIndex(g => g.groupId === groupId)

                if (existingGroupIndex === -1) {
                    // 获取全局默认概率配置（0-1之间，默认1表示100%触发）
                    const defaultReplyRate = 1

                    // 添加新群配置，switchOn 默认为 true
                    currentAllowGroups.push({
                        groupId: groupId,
                        switchOn: true,
                        replyRate: defaultReplyRate
                    })
                    config.groupSayHello.allowGroups = currentAllowGroups
                    config.groupSayHello.enabled = true

                    // 获取使用的接口信息（优先从群配置读取，如果没有则从全局配置读取）
                    const newGroupConfig = currentAllowGroups[currentAllowGroups.length - 1]
                    const usingApiIndex = newGroupConfig.usingAPI ?? 0
                    let interfaceName = '默认配置'
                    if (usingApiIndex > 0 && config.gg_APIList && config.gg_APIList[usingApiIndex - 1]) {
                        interfaceName = config.gg_APIList[usingApiIndex - 1].remark || `接口${usingApiIndex}`
                    }

                    const cronTime = config.groupSayHello.cron_time || '0 */5 * * * *'
                    const replyRatePercent = (defaultReplyRate * 100).toFixed(0)
                    await e.reply(`✅ 已开启本群的自动打招呼功能\n` +
                        `⏰ 定时表达式: ${cronTime}\n` +
                        `🎲 触发概率: ${replyRatePercent}%\n` +
                        `🤖 使用接口: ${interfaceName}`)
                } else {
                    // 群已存在，修改 switchOn 为 true
                    currentAllowGroups[existingGroupIndex].switchOn = true
                    config.groupSayHello.allowGroups = currentAllowGroups
                    config.groupSayHello.enabled = true

                    const currentRate = (currentAllowGroups[existingGroupIndex].replyRate * 100 || 100).toFixed(0)
                    await e.reply(`✅ 已开启本群的自动打招呼功能\n当前触发概率: ${currentRate}%`)
                }
            } else {
                const index = currentAllowGroups.findIndex(g => g.groupId === groupId)
                if (index > -1) {
                    // 不删除群配置，只修改 switchOn 为 false
                    currentAllowGroups[index].switchOn = false
                    config.groupSayHello.allowGroups = currentAllowGroups

                    await e.reply('❌ 已关闭本群的自动打招呼功能')
                } else {
                    await e.reply('⚠️ 本群未配置自动打招呼功能')
                }
            }

            Config.setConfig(config);

        } catch (error) {
            logger.error(`[群自动打招呼] 切换群功能失败: ${error}`)
            await e.reply('❌ 操作失败，请查看日志获取详细信息')
        }

        return true
    }

    /**
     * 显示配置信息
     */
    async showConfig(e) {
        if (!e.isMaster) {
            await e.reply('只有主人可以查看配置哦~')
            return true
        }

        const config = Config.getConfig()
        const groupSayHelloConfig = config.groupSayHello || {}
        const groupId = String(e.group_id)

        // 检查当前群是否在允许列表中（可能有多个配置）
        const allowGroups = groupSayHelloConfig.allowGroups || []
        const currentGroupConfigs = allowGroups.filter(g => g.groupId === groupId)
        const isGroupAllowed = currentGroupConfigs.length > 0

        const cronTime = groupSayHelloConfig.cron_time || '0 */5 * * * *'

        // 当前群的配置信息
        let currentGroupInfo = ''
        if (isGroupAllowed) {
            if (currentGroupConfigs.length === 1) {
                // 只有一个配置
                const groupConfig = currentGroupConfigs[0]
                const switchOn = groupConfig.switchOn ?? false
                const rate = (groupConfig.replyRate * 100 || 100).toFixed(0)
                const statusText = switchOn ? '✅ 已开启' : '❌ 已关闭'
                const usingApiIndex = groupConfig.usingAPI ?? 0

                let interfaceInfo = '默认配置'
                if (usingApiIndex > 0 && config.gg_APIList && config.gg_APIList[usingApiIndex - 1]) {
                    const apiConfig = config.gg_APIList[usingApiIndex - 1]
                    interfaceInfo = `接口${usingApiIndex}: ${apiConfig.remark || `接口${usingApiIndex}`}`
                }

                currentGroupInfo = `🎯 当前群状态: ${statusText} (触发概率: ${rate}%, 接口: ${interfaceInfo})`
            } else {
                // 有多个配置
                currentGroupInfo = `🎯 当前群状态: 已配置 ${currentGroupConfigs.length} 个接口\n` +
                    currentGroupConfigs.map((groupConfig, index) => {
                        const switchOn = groupConfig.switchOn ?? false
                        const rate = (groupConfig.replyRate * 100 || 100).toFixed(0)
                        const statusIcon = switchOn ? '✅' : '❌'
                        const usingApiIndex = groupConfig.usingAPI ?? 0

                        let interfaceInfo = '默认配置'
                        if (usingApiIndex > 0 && config.gg_APIList && config.gg_APIList[usingApiIndex - 1]) {
                            const apiConfig = config.gg_APIList[usingApiIndex - 1]
                            interfaceInfo = `接口${usingApiIndex}: ${apiConfig.remark || `接口${usingApiIndex}`}`
                        }

                        return `　${statusIcon} 配置${index + 1}: ${interfaceInfo} (概率: ${rate}%)`
                    }).join('\n')
            }
        } else {
            currentGroupInfo = `🎯 当前群状态: ⚠️ 未配置`
        }

        const configMsg = [
            '📊 群自动打招呼配置状态',
            '━━━━━━━━━━━━━━━━━━',
            `🔧 功能状态: ${groupSayHello_Switch ? '✅ 已启用' : '❌ 已禁用'}`,
            e.isGroup ? currentGroupInfo : '',
            '',
            '⚙️ 配置参数:',
            `　⏱️ 定时表达式: ${cronTime}`,
            '',
            '🎯 允许群组:',
            allowGroups.length === 0
                ? '　📢 暂无群组'
                : this.formatGroupList(allowGroups, config),
            '━━━━━━━━━━━━━━━━━━',
            '',
            '💡 使用提示:',
            '　#自动打招呼开启 - 开启当前群',
            '　#自动打招呼关闭 - 关闭当前群',
            '　#立即打招呼 - 立即发送一条',
        ].filter(line => line !== null && line !== '').join('\n')

        await e.reply(configMsg)
        return true
    }

    /**
     * 格式化群组列表显示
     */
    formatGroupList(allowGroups, config) {
        // 按 groupId 分组
        const groupMap = new Map()

        allowGroups.forEach(g => {
            if (!groupMap.has(g.groupId)) {
                groupMap.set(g.groupId, [])
            }
            groupMap.get(g.groupId).push(g)
        })

        const lines = []
        groupMap.forEach((configs, groupId) => {
            if (configs.length === 1) {
                // 单个配置
                const g = configs[0]
                const rate = (g.replyRate * 100 || 100).toFixed(0)
                const switchOn = g.switchOn ?? false
                const statusIcon = switchOn ? '✅' : '❌'
                const usingApiIndex = g.usingAPI ?? 0

                let interfaceInfo = '默认'
                if (usingApiIndex > 0 && config.gg_APIList && config.gg_APIList[usingApiIndex - 1]) {
                    interfaceInfo = `接口${usingApiIndex}`
                }

                lines.push(`　🏷️ ${groupId} ${statusIcon} (概率: ${rate}%, ${interfaceInfo})`)
            } else {
                // 多个配置
                lines.push(`　🏷️ ${groupId} (${configs.length}个配置):`)
                configs.forEach((g, index) => {
                    const rate = (g.replyRate * 100 || 100).toFixed(0)
                    const switchOn = g.switchOn ?? false
                    const statusIcon = switchOn ? '✅' : '❌'
                    const usingApiIndex = g.usingAPI ?? 0

                    let interfaceInfo = '默认'
                    if (usingApiIndex > 0 && config.gg_APIList && config.gg_APIList[usingApiIndex - 1]) {
                        interfaceInfo = `接口${usingApiIndex}`
                    }

                    lines.push(`　　${statusIcon} 配置${index + 1}: ${interfaceInfo} (概率: ${rate}%)`)
                })
            }
        })

        return lines.join('\n')
    }
}
