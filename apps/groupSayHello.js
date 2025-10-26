import plugin from '../../../lib/plugins/plugin.js'
import Config from '../components/Config.js'
import {
    getBotByQQ,
    getChatHistory_w,
    buildChatHistoryPrompt,
} from '../utils/onebotUtils.js'

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

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
        const config = Config.getConfig()

        // 检查功能是否启用
        if (!config.groupSayHello?.enabled) {
            return false
        }

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
                    logger.mark(`[群自动打招呼] 群 ${groupId} 开始执行打招呼 (${randomValue.toFixed(2)} <= ${replyRate})`)
                    await this.sendGreeting(groupId, config, null, { groupPrompt })
                    // 避免发送过快，休息一下
                    await sleep(2000)
                } else {
                    logger.debug(`[群自动打招呼] 群 ${groupId} 概率判断未通过 (${randomValue.toFixed(2)} > ${replyRate})，跳过本次发送`)
                }
            } catch (error) {
                logger.error(`[群自动打招呼] 群 ${groupId} 发送失败: ${error}`)
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
            // 查找当前群的配置，获取groupPrompt
            const allowGroups = config.groupSayHello?.allowGroups || []
            const currentGroupConfig = allowGroups.find(g => g.groupId === groupId)
            const groupPrompt = currentGroupConfig?.groupPrompt || ''

            await this.sendGreeting(groupId, config, e, { groupPrompt })
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
     */
    async sendGreeting(groupId, config, e = null, opt = {}) {
        // 获取Bot实例
        const botQQArr = config.groupSayHello?.botQQArr || []
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

        const prompt = opt.groupPrompt || `请根据以下最近的群聊记录，生成一条像真人一样的回复，长度控制在50字以内，直接输出内容，不要加任何前缀或解释。`
        // 构造打招呼的prompt
        const greetingPrompt = buildChatHistoryPrompt(chatHistory, prompt, bot.uin)

        // 导入SF_Painting类来调用generateGeminiPrompt
        try {
            const { SF_Painting } = await import('./SF_Painting.js')
            const sfPainting = new SF_Painting()

            // 获取选中的接口配置
            const usingApiIndex = config.groupSayHello?.usingAPI || 0
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

            // 配置对象
            const config_date = {
                gg_Prompt: systemPrompt,
                gg_useSearch: false,
                gg_enableImageGeneration: false
            }

            // 调用参数
            const opt = {
                model: model,
                systemPrompt: systemPrompt,
                useSearch: false,
                enableImageGeneration: false
            }

            // 调用generateGeminiPrompt
            const { answer } = await sfPainting.generateGeminiPrompt(
                greetingPrompt,
                ggBaseUrl,
                ggKey,
                config_date,
                opt,
                [],
                eventObj
            )

            if (answer) {
                // 发送打招呼消息
                await group.sendMsg(answer)
                logger.info(`[群自动打招呼] 群 ${groupId} 发送成功`)
            } else {
                logger.error('[群自动打招呼] LLM返回为空')
            }

        } catch (error) {
            logger.error(`[群自动打招呼] 调用LLM失败: ${error}`)
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

                    // 获取使用的接口信息
                    const usingApiIndex = config.groupSayHello.usingAPI || 0
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

        // 检查当前群是否在允许列表中
        const allowGroups = groupSayHelloConfig.allowGroups || []
        const currentGroupConfig = allowGroups.find(g => g.groupId === groupId)
        const isGroupAllowed = !!currentGroupConfig

        // 获取使用的接口信息
        const usingApiIndex = groupSayHelloConfig.usingAPI || 0
        let interfaceInfo = '使用 [#gg] 默认配置'
        if (usingApiIndex > 0 && config.gg_APIList && config.gg_APIList[usingApiIndex - 1]) {
            const apiConfig = config.gg_APIList[usingApiIndex - 1]
            interfaceInfo = `使用接口 ${usingApiIndex}: ${apiConfig.remark || `接口${usingApiIndex}`}\n　　模型: ${apiConfig.model || config.gg_model || 'gemini-2.0-flash-exp'}`
        } else {
            interfaceInfo = `使用 [#gg] 默认配置\n　　模型: ${config.gg_model || 'gemini-2.0-flash-exp'}`
        }

        const cronTime = groupSayHelloConfig.cron_time || '0 */5 * * * *'

        // 当前群的概率和开关状态
        let currentGroupRate = ''
        if (isGroupAllowed) {
            const switchOn = currentGroupConfig.switchOn ?? false
            const rate = (currentGroupConfig.replyRate * 100 || 100).toFixed(0)
            const statusText = switchOn ? '✅ 已开启' : '❌ 已关闭'
            currentGroupRate = `🎯 当前群状态: ${statusText} (触发概率: ${rate}%)`
        } else {
            currentGroupRate = `🎯 当前群状态: ⚠️ 未配置`
        }

        const configMsg = [
            '📊 群自动打招呼配置状态',
            '━━━━━━━━━━━━━━━━━━',
            `🔧 功能状态: ${groupSayHelloConfig.enabled ? '✅ 已启用' : '❌ 已禁用'}`,
            e.isGroup ? currentGroupRate : '',
            '',
            '⚙️ 配置参数:',
            `　⏱️ 定时表达式: ${cronTime}`,
            `　🤖 ${interfaceInfo}`,
            '',
            '🎯 允许群组:',
            allowGroups.length === 0
                ? '　📢 暂无群组'
                : allowGroups.map(g => {
                    const rate = (g.replyRate * 100 || 100).toFixed(0)
                    const switchOn = g.switchOn ?? false
                    const statusIcon = switchOn ? '✅' : '❌'
                    return `　🏷️ ${g.groupId} ${statusIcon} (概率: ${rate}%)`
                }).join('\n'),
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
}
