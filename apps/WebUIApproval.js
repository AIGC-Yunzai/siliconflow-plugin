import plugin from '../../../lib/plugins/plugin.js'
import Config from '../components/Config.js'
import { 
    submitRequest, 
    approveRequest, 
    rejectRequest, 
    blockUser, 
    unblockUser,
    getPendingRequests,
    getWhitelist,
    getBlacklist,
    isUserApproved,
    isBlocked
} from '../utils/approvalManager.js'

/**
 * WebUI 审批管理插件
 * 处理用户申请、主人审批、黑白名单管理
 */
export class WebUIApproval extends plugin {
    constructor() {
        super({
            name: 'WebUI 审批管理',
            dsc: '管理 WebUI 用户访问权限',
            event: 'message',
            priority: 1000,
            rule: [
                {
                    reg: '^#(sf|SF)(申请|请求)(webui|WebUI|登录|使用)$',
                    fnc: 'sf_requestWebUI'
                    // 所有人可用，申请使用 WebUI
                },
                {
                    reg: '^#(sf|SF)(批准|同意|通过)(@?[\\d]+)?$',
                    fnc: 'sf_approveRequest',
                    permission: 'master'
                    // 主人权限，批准申请
                },
                {
                    reg: '^#(sf|SF)(拒绝|驳回)(@?[\\d]+)?$',
                    fnc: 'sf_rejectRequest',
                    permission: 'master'
                    // 主人权限，拒绝申请
                },
                {
                    reg: '^#(sf|SF)(批准|审批)(列表|清单|待办)$',
                    fnc: 'sf_approvalList',
                    permission: 'master'
                    // 主人权限，查看待审批列表
                },
                {
                    reg: '^#(sf|SF)(拉黑|黑名单)(@?[\\d]+)?$',
                    fnc: 'sf_blockUser',
                    permission: 'master'
                    // 主人权限，拉黑用户
                },
                {
                    reg: '^#(sf|SF)(解封|解除)(@?[\\d]+)?$',
                    fnc: 'sf_unblockUser',
                    permission: 'master'
                    // 主人权限，解封用户
                },
                {
                    reg: '^#(sf|SF)(webui|WebUI)?(白名单|已通过)$',
                    fnc: 'sf_whitelist',
                    permission: 'master'
                    // 主人权限，查看白名单
                },
                {
                    reg: '^#(sf|SF)(webui|WebUI)?(黑名单|已拉黑)$',
                    fnc: 'sf_blacklist',
                    permission: 'master'
                    // 主人权限，查看黑名单
                },
                {
                    reg: '^#(sf|SF)我的(webui|WebUI)?状态$',
                    fnc: 'sf_myStatus'
                    // 所有人可用，查看自己的 WebUI 状态
                },
                {
                    reg: '^#(sf|SF)(轮换|刷新)(webui|WebUI)?密钥$',
                    fnc: 'sf_rotateJwtSecret',
                    permission: 'master'
                    // 主人权限，强制轮换 JWT Secret
                },
                {
                    reg: '^#(sf|SF)(webui|WebUI)?登录历史$',
                    fnc: 'sf_loginHistory'
                    // 所有人可用，查看自己的登录历史
                },
                {
                    reg: '^#(sf|SF)(webui|WebUI)?在线用户$',
                    fnc: 'sf_onlineUsers',
                    permission: 'master'
                    // 主人权限，查看在线用户
                },
                {
                    reg: '^#(sf|SF)(webui|WebUI)?(强制下线|踢出)(@?[\\d]+)?$',
                    fnc: 'sf_forceLogout',
                    permission: 'master'
                    // 主人权限，强制下线用户
                }
            ]
        })
    }

    /**
     * 获取主人列表
     */
    /**
     * 解析主人配置条目（TRSS-Yunzai 格式：BotQQ:主人QQ）
     */
    parseMasterEntry(entry) {
        if (!entry) return null
        const entryStr = String(entry).trim()
        if (entryStr.includes(':')) {
            const parts = entryStr.split(':')
            if (parts.length === 2) {
                return parts[1].trim() || null
            }
        }
        return entryStr || null
    }

    /**
     * 检查用户是否是主人（包括 stdin 的特殊处理）
     * @param {object} e 消息事件对象
     * @returns {boolean}
     */
    isMasterUser(e) {
        // 方式1: 检查 Yunzai 的 isMaster 属性
        if (e.isMaster === true) {
            return true
        }
        
        // 方式2: 检查用户 ID 是否在主人列表中
        const userId = String(e.user_id)
        const masters = this.getMasterListSync()
        
        // 特殊处理 stdin 用户
        if (userId === 'stdin' || userId === '标准输入' || e.sender?.nickname?.includes('stdin')) {
            return true
        }
        
        return masters.includes(userId)
    }
    
    /**
     * 同步获取主人列表（用于 isMasterUser）
     */
    getMasterListSync() {
        const masters = new Set()
        
        // 方式1: 从 Bot 运行时配置读取（支持 TRSS-Yunzai 格式）
        try {
            if (typeof Bot !== 'undefined' && Bot.config) {
                // masterQQ 字段
                const botMastersQQ = Bot.config.masterQQ || Bot.config.master_qq
                if (botMastersQQ) {
                    if (Array.isArray(botMastersQQ)) {
                        botMastersQQ.forEach(m => masters.add(String(m)))
                    } else {
                        masters.add(String(botMastersQQ))
                    }
                }
                
                // master 字段（TRSS-Yunzai 格式：BotQQ:主人QQ）
                const botMaster = Bot.config.master
                if (botMaster) {
                    if (Array.isArray(botMaster)) {
                        botMaster.forEach(m => {
                            const masterQQ = this.parseMasterEntry(m)
                            if (masterQQ) masters.add(masterQQ)
                        })
                    } else {
                        const masterQQ = this.parseMasterEntry(botMaster)
                        if (masterQQ) masters.add(masterQQ)
                    }
                }
            }
        } catch (e) {
            // 忽略错误
        }
        
        // 方式2: 从全局 config 对象读取
        try {
            if (typeof config !== 'undefined' && config) {
                const cfgMastersQQ = config.masterQQ || config.master_qq
                if (cfgMastersQQ) {
                    if (Array.isArray(cfgMastersQQ)) {
                        cfgMastersQQ.forEach(m => masters.add(String(m)))
                    } else {
                        masters.add(String(cfgMastersQQ))
                    }
                }
                
                const cfgMaster = config.master
                if (cfgMaster && !Bot?.config?.master) {
                    if (Array.isArray(cfgMaster)) {
                        cfgMaster.forEach(m => {
                            const masterQQ = this.parseMasterEntry(m)
                            if (masterQQ) masters.add(masterQQ)
                        })
                    } else {
                        const masterQQ = this.parseMasterEntry(cfgMaster)
                        if (masterQQ) masters.add(masterQQ)
                    }
                }
            }
        } catch (e) {
            // 忽略错误
        }
        
        // 方式3: 从本插件配置读取
        try {
            const config = Config.getConfig()
            if (config.webUI?.masters) {
                if (Array.isArray(config.webUI.masters)) {
                    config.webUI.masters.forEach(m => masters.add(String(m)))
                } else {
                    masters.add(String(config.webUI.masters))
                }
            }
        } catch (e) {
            // 忽略错误
        }
        
        return Array.from(masters)
    }
    
    async getMasterList() {
        // 尝试多种方式获取主人列表
        const masters = new Set(this.getMasterListSync())
        
        // 从配置文件读取（兼容无 Bot 环境）
        try {
            const fs = await import('fs')
            const path = await import('path')
            const { readFileSync, existsSync } = fs
            const { join } = path
            
            const yunzaiConfigPath = join(process.cwd(), 'config', 'config.yaml')
            if (existsSync(yunzaiConfigPath)) {
                const content = readFileSync(yunzaiConfigPath, 'utf8')
                // 简单解析 YAML 中的 master 字段
                const masterMatch = content.match(/master:\s*\n((?:\s*-\s*\d+\n?)+)/)
                if (masterMatch) {
                    const cfgMasters = masterMatch[1].match(/\d+/g)
                    if (cfgMasters) cfgMasters.forEach(m => masters.add(m))
                }
                // 尝试匹配一行格式
                const singleLineMatch = content.match(/master:\s*\[?([^\]]+)\]?/)
                if (singleLineMatch) {
                    singleLineMatch[1].split(/[,\s]+/).filter(id => /^\d+$/.test(id)).forEach(m => masters.add(m))
                }
            }
        } catch (e) {
            // 忽略错误
        }
        
        return Array.from(masters)
    }

    /**
     * 申请使用 WebUI
     */
    async sf_requestWebUI(e) {
        const userQQ = String(e.user_id)
        const groupId = e.group_id ? String(e.group_id) : 'private'
        const nickname = e.sender?.nickname || ''
        
        const result = submitRequest(userQQ, groupId, nickname)
        
        if (result.success) {
            await e.reply(`✅ ${result.message}\n请等待主人审批`, true)
            
            // 如果有主人，私聊通知主人
            const masters = await this.getMasterList()
            if (masters.length > 0) {
                const msg = [
                    `📋 新的 WebUI 使用申请`,
                    `申请人: ${nickname} (${userQQ})`,
                    `来源: ${e.group_id ? '群聊' : '私聊'}`,
                    `时间: ${new Date().toLocaleString()}`,
                    ``,
                    `发送 #sf批准列表 查看待审批申请`,
                    `发送 #sf批准 ${userQQ} 批准该申请`
                ].join('\n')
                
                for (const master of masters) {
                    try {
                        await e.bot.sendPrivateMsg(master, msg)
                    } catch (err) {
                        logger.debug(`[sf插件] 通知主人 ${master} 失败:`, err)
                    }
                }
            }
        } else {
            await e.reply(`⚠️ ${result.message}`, true)
        }
    }
    
    /**
     * 批准申请
     * 支持方式：
     * 1. #sf批准 QQ号 - 批准指定QQ
     * 2. #sf批准 编号 - 根据列表编号批准
     * 3. #sf批准 1,2,3 - 批量批准多个编号
     * 4. #sf批准 123456,789012 - 批量批准多个QQ
     * 5. #sf批准 全部 - 批准所有待审批申请
     */
    async sf_approveRequest(e) {
        const match = e.msg.match(/^#(?:sf|SF)(?:批准|同意|通过)\s*(.+)?/i)
        const input = match?.[1]?.trim()
        
        if (!input) {
            await e.reply('请指定要批准的用户\n用法:\n#sf批准 QQ号\n#sf批准 编号\n#sf批准 1,2,3\n#sf批准 全部', true)
            return
        }
        
        const requests = getPendingRequests()
        
        if (requests.length === 0) {
            await e.reply('📭 暂无待审批的申请', true)
            return
        }
        
        // 处理"全部"
        if (input === '全部' || input === 'all' || input === '*') {
            let approvedCount = 0
            const approvedUsers = []
            
            for (const req of requests) {
                const result = approveRequest(req.qq, String(e.user_id))
                if (result.success) {
                    approvedCount++
                    approvedUsers.push(req.qq)
                    // 通知用户
                    try {
                        await e.bot.sendPrivateMsg(req.qq, 
                            '🎉 你的 WebUI 使用申请已通过！\n现在可以使用 #sf登录 获取验证码登录 WebUI 了')
                    } catch (err) {
                        logger.debug(`[sf插件] 通知用户 ${req.qq} 失败:`, err)
                    }
                }
            }
            
            if (approvedCount > 0) {
                await e.reply(`✅ 已批量批准 ${approvedCount} 个申请`, true)
            } else {
                await e.reply('⚠️ 批准失败', true)
            }
            return
        }
        
        // 解析输入（可能是编号列表或QQ号列表）
        const items = input.split(/[,，\s]+/).filter(s => s.trim())
        const targetQQs = []
        const failedItems = []
        
        for (const item of items) {
            // 检查是否是编号（1-999）
            if (/^\d+$/.test(item)) {
                const index = parseInt(item) - 1
                if (index >= 0 && index < requests.length) {
                    targetQQs.push(requests[index].qq)
                } else {
                    failedItems.push(`${item}(无效编号)`)
                }
            } else {
                // 作为QQ号处理
                targetQQs.push(item)
            }
        }
        
        if (targetQQs.length === 0) {
            await e.reply(`❌ 未找到有效的用户\n失败项: ${failedItems.join(', ')}`, true)
            return
        }
        
        // 批量处理
        let approvedCount = 0
        const results = []
        
        for (const qq of targetQQs) {
            const result = approveRequest(qq, String(e.user_id))
            if (result.success) {
                approvedCount++
                results.push(`✅ ${qq}`)
                // 通知被批准的用户
                try {
                    await e.bot.sendPrivateMsg(qq, 
                        '🎉 你的 WebUI 使用申请已通过！\n现在可以使用 #sf登录 获取验证码登录 WebUI 了')
                } catch (err) {
                    logger.debug(`[sf插件] 通知用户 ${qq} 失败:`, err)
                }
            } else {
                results.push(`❌ ${qq}: ${result.message}`)
            }
        }
        
        // 构建回复消息
        let replyMsg = `处理结果 (${approvedCount}/${targetQQs.length} 成功):\n${results.join('\n')}`
        if (failedItems.length > 0) {
            replyMsg += `\n\n跳过的项: ${failedItems.join(', ')}`
        }
        
        await e.reply(replyMsg, true)
    }
    
    /**
     * 拒绝申请
     * 支持方式：
     * 1. #sf拒绝 QQ号 - 拒绝指定QQ
     * 2. #sf拒绝 编号 - 根据列表编号拒绝
     * 3. #sf拒绝 1,2,3 - 批量拒绝多个编号
     * 4. #sf拒绝 123456,789012 - 批量拒绝多个QQ
     */
    async sf_rejectRequest(e) {
        const match = e.msg.match(/^#(?:sf|SF)(?:拒绝|驳回)\s*(.+)?/i)
        const input = match?.[1]?.trim()
        
        if (!input) {
            await e.reply('请指定要拒绝的用户\n用法:\n#sf拒绝 QQ号\n#sf拒绝 编号\n#sf拒绝 1,2,3', true)
            return
        }
        
        const requests = getPendingRequests()
        
        if (requests.length === 0) {
            await e.reply('📭 暂无待审批的申请', true)
            return
        }
        
        // 解析输入（可能是编号列表或QQ号列表）
        const items = input.split(/[,，\s]+/).filter(s => s.trim())
        const targetQQs = []
        const failedItems = []
        
        for (const item of items) {
            // 检查是否是编号（1-999）
            if (/^\d+$/.test(item)) {
                const index = parseInt(item) - 1
                if (index >= 0 && index < requests.length) {
                    targetQQs.push(requests[index].qq)
                } else {
                    failedItems.push(`${item}(无效编号)`)
                }
            } else {
                // 作为QQ号处理
                targetQQs.push(item)
            }
        }
        
        if (targetQQs.length === 0) {
            await e.reply(`❌ 未找到有效的用户\n失败项: ${failedItems.join(', ')}`, true)
            return
        }
        
        // 批量处理
        let rejectedCount = 0
        const results = []
        
        for (const qq of targetQQs) {
            const result = rejectRequest(qq, String(e.user_id), '主人拒绝了你的申请')
            if (result.success) {
                rejectedCount++
                results.push(`✅ ${qq}`)
                // 通知被拒绝的用户
                try {
                    await e.bot.sendPrivateMsg(qq, 
                        '❌ 你的 WebUI 使用申请未通过。\n如有疑问请联系 Bot 主人。')
                } catch (err) {
                    logger.debug(`[sf插件] 通知用户 ${qq} 失败:`, err)
                }
            } else {
                results.push(`❌ ${qq}: ${result.message}`)
            }
        }
        
        // 构建回复消息
        let replyMsg = `处理结果 (${rejectedCount}/${targetQQs.length} 成功):\n${results.join('\n')}`
        if (failedItems.length > 0) {
            replyMsg += `\n\n跳过的项: ${failedItems.join(', ')}`
        }
        
        await e.reply(replyMsg, true)
    }
    
    /**
     * 查看待审批列表
     * 使用转发消息（合并消息）形式发送，避免消息过长
     */
    async sf_approvalList(e) {
        const requests = getPendingRequests()
        
        if (requests.length === 0) {
            await e.reply('📭 暂无待审批的申请', true)
            return
        }
        
        // 构建转发消息
        const forwardMsgs = []
        
        // 添加标题
        forwardMsgs.push({
            message: `📋 WebUI 待审批申请列表\n共 ${requests.length} 条申请`,
            nickname: e.bot.nickname || 'Bot',
            user_id: e.bot.uin || 10000
        })
        
        // 添加每个申请详情
        requests.forEach((req, index) => {
            const time = new Date(req.requestTime).toLocaleString()
            forwardMsgs.push({
                message: `编号: ${index + 1}\nQQ: ${req.qq}\n昵称: ${req.nickname || '未知'}\n申请时间: ${time}\n\n操作: #sf批准 ${index + 1} 或 #sf批准 ${req.qq}`,
                nickname: e.bot.nickname || 'Bot',
                user_id: e.bot.uin || 10000
            })
        })
        
        // 添加操作说明
        forwardMsgs.push({
            message: `📌 操作说明:\n#sf批准 编号 - 批准指定编号\n#sf批准 1,2,3 - 批量批准多个编号\n#sf批准 QQ号 - 批准指定QQ\n#sf批准 全部 - 批准所有申请\n#sf拒绝 编号/QQ - 拒绝申请`,
            nickname: e.bot.nickname || 'Bot',
            user_id: e.bot.uin || 10000
        })
        
        // 发送转发消息
        try {
            if (e.group_id) {
                // 群聊中使用转发消息
                await e.reply(await e.group.makeForwardMsg(forwardMsgs))
            } else {
                // 私聊中使用转发消息
                await e.reply(await e.friend.makeForwardMsg(forwardMsgs))
            }
        } catch (err) {
            logger.error('[sf插件] 发送转发消息失败:', err)
            // 降级为普通消息
            const list = requests.slice(0, 10).map((req, index) => {
                return `${index + 1}. ${req.nickname || '未知'} (${req.qq})\n   申请时间: ${new Date(req.requestTime).toLocaleString()}`
            }).join('\n\n')
            
            const msg = [
                `📋 WebUI 使用申请列表（共 ${requests.length} 条，显示前10条）`,
                ``,
                list,
                ``,
                `操作命令:`,
                `#sf批准 编号 - 批准指定用户`,
                `#sf批准 1,2,3 - 批量批准`,
                `#sf批准 全部 - 批准所有`,
            ].join('\n')
            
            await e.reply(msg, true)
        }
    }
    
    /**
     * 拉黑用户
     */
    async sf_blockUser(e) {
        const match = e.msg.match(/^#(?:sf|SF)(?:拉黑|黑名单)(@?\d+)?/i)
        let targetQQ = match?.[1]?.replace('@', '')
        
        if (!targetQQ && e.at) {
            targetQQ = String(e.at)
        }
        
        if (!targetQQ) {
            await e.reply('请指定要拉黑的用户\n用法: #sf拉黑 @用户 或 #sf拉黑 QQ号', true)
            return
        }
        
        // 不能拉黑主人（检查是否在主人列表或是 stdin）
        const masters = await this.getMasterList()
        if (masters.includes(targetQQ) || targetQQ === 'stdin') {
            await e.reply('❌ 不能拉黑主人！', true)
            return
        }
        
        const result = blockUser(targetQQ, String(e.user_id), '被主人拉黑')
        
        if (result.success) {
            await e.reply(`✅ ${result.message}`, true)
            
            // 通知被拉黑的用户
            try {
                await e.bot.sendPrivateMsg(targetQQ, 
                    '🚫 你已被禁止使用 WebUI。\n如有疑问请联系 Bot 主人。')
            } catch (err) {
                logger.debug(`[sf插件] 通知用户 ${targetQQ} 失败:`, err)
            }
        } else {
            await e.reply(`⚠️ ${result.message}`, true)
        }
    }
    
    /**
     * 解封用户
     */
    async sf_unblockUser(e) {
        const match = e.msg.match(/^#(?:sf|SF)(?:解封|解除)(@?\d+)?/i)
        let targetQQ = match?.[1]?.replace('@', '')
        
        if (!targetQQ && e.at) {
            targetQQ = String(e.at)
        }
        
        if (!targetQQ) {
            await e.reply('请指定要解封的用户\n用法: #sf解封 @用户 或 #sf解封 QQ号', true)
            return
        }
        
        const result = unblockUser(targetQQ)
        
        if (result.success) {
            await e.reply(`✅ ${result.message}`, true)
            
            // 通知被解封的用户
            try {
                await e.bot.sendPrivateMsg(targetQQ, 
                    '✅ 你已解除 WebUI 使用限制。\n如需使用请重新申请。')
            } catch (err) {
                logger.debug(`[sf插件] 通知用户 ${targetQQ} 失败:`, err)
            }
        } else {
            await e.reply(`⚠️ ${result.message}`, true)
        }
    }
    
    /**
     * 查看白名单
     */
    async sf_whitelist(e) {
        const whitelist = getWhitelist()
        
        if (whitelist.length === 0) {
            await e.reply('📭 白名单为空', true)
            return
        }
        
        const list = whitelist.map((item, index) => {
            return `${index + 1}. ${item.nickname || '未知'} (${item.qq})\n   批准时间: ${new Date(item.approvedTime).toLocaleString()}`
        }).join('\n\n')
        
        const msg = [
            `✅ WebUI 白名单（共 ${whitelist.length} 人）`,
            ``,
            list
        ].join('\n')
        
        await e.reply(msg, true)
    }
    
    /**
     * 查看黑名单
     */
    async sf_blacklist(e) {
        const blacklist = getBlacklist()
        
        if (blacklist.length === 0) {
            await e.reply('📭 黑名单为空', true)
            return
        }
        
        const list = blacklist.map((item, index) => {
            return `${index + 1}. QQ: ${item.qq}\n   拉黑时间: ${new Date(item.blockedTime).toLocaleString()}`
        }).join('\n\n')
        
        const msg = [
            `🚫 WebUI 黑名单（共 ${blacklist.length} 人）`,
            ``,
            list,
            ``,
            `发送 #sf解封 QQ号 解除拉黑`
        ].join('\n')
        
        await e.reply(msg, true)
    }

    /**
     * 查看自己的 WebUI 状态
     */
    async sf_myStatus(e) {
        const userQQ = String(e.user_id)
        const nickname = e.sender?.nickname || ''
        
        // 检查是否是主人（包括 stdin 的特殊处理）
        if (this.isMasterUser(e)) {
            await e.reply(`👑 ${nickname} (${userQQ})\n状态: 主人权限\n可以无限制使用 WebUI`, true)
            return
        }
        
        // 检查是否在黑名单
        if (isBlocked(userQQ)) {
            const blackInfo = getBlacklist().find(b => b.qq === userQQ)
            await e.reply(`🚫 ${nickname} (${userQQ})\n状态: 已被拉黑\n拉黑时间: ${new Date(blackInfo?.blockedTime).toLocaleString()}\n如有疑问请联系 Bot 主人`, true)
            return
        }
        
        // 检查是否在白名单
        if (isUserApproved(userQQ)) {
            const whiteInfo = getWhitelist().find(w => w.qq === userQQ)
            await e.reply(`✅ ${nickname} (${userQQ})\n状态: 已批准\n批准时间: ${new Date(whiteInfo?.approvedTime).toLocaleString()}\n可以使用 #sf登录 获取验证码登录 WebUI`, true)
            return
        }
        
        // 检查是否有待审批的申请
        const pendingRequests = getPendingRequests()
        const myRequest = pendingRequests.find(r => r.qq === userQQ)
        if (myRequest) {
            await e.reply(`⏳ ${nickname} (${userQQ})\n状态: 待审批\n申请时间: ${new Date(myRequest.requestTime).toLocaleString()}\n请耐心等待主人审批`, true)
            return
        }
        
        // 未申请
        await e.reply(`❓ ${nickname} (${userQQ})\n状态: 未申请\n发送 #sf申请webui 申请使用权限`, true)
    }

    /**
     * 强制轮换 JWT Secret
     * 会立即使所有现有 Token 失效，所有用户需要重新登录
     */
    async sf_rotateJwtSecret(e) {
        const { forceRotateJwtSecret } = await import('../utils/auth.js')
        const success = forceRotateJwtSecret()
        
        if (success) {
            await e.reply('✅ WebUI JWT Secret 已强制轮换\n\n⚠️ 所有现有登录已失效，用户需要重新登录', true)
        } else {
            await e.reply('❌ JWT Secret 轮换失败，请查看日志', true)
        }
    }

    /**
     * 查看自己的登录历史
     */
    async sf_loginHistory(e) {
        const userQQ = String(e.user_id)
        const { getLoginHistory } = await import('../utils/loginSecurity.js')
        const history = getLoginHistory(userQQ, 10)
        
        if (history.length === 0) {
            await e.reply('📭 暂无登录记录', true)
            return
        }
        
        const lines = history.map((record, index) => {
            const time = new Date(record.time).toLocaleString()
            const typeNames = {
                code: '验证码',
                password: '密码',
                short: '短链接',
                master: '主人快捷'
            }
            const type = typeNames[record.loginType] || record.loginType
            return `${index + 1}. ${time}\n   方式: ${type}\n   IP: ${record.ip}`
        })
        
        const msg = [
            `📋 您的 WebUI 登录历史（最近 ${history.length} 条）`,
            ``,
            lines.join('\n\n')
        ].join('\n')
        
        await e.reply(msg, true)
    }

    /**
     * 查看在线用户（主人）
     */
    async sf_onlineUsers(e) {
        const { getActiveSessions } = await import('../utils/loginSecurity.js')
        const sessions = getActiveSessions()
        const users = Object.entries(sessions)
        
        if (users.length === 0) {
            await e.reply('📭 当前没有在线用户', true)
            return
        }
        
        const lines = users.map(([qq, session], index) => {
            const loginTime = new Date(session.createdAt).toLocaleString()
            const remaining = Math.floor(session.remainingTime / 60)
            return `${index + 1}. QQ: ${qq}\n   登录时间: ${loginTime}\n   剩余: ${remaining}分钟`
        })
        
        const msg = [
            `👥 WebUI 在线用户（共 ${users.length} 人）`,
            ``,
            lines.join('\n\n'),
            ``,
            `发送 #sf强制下线 QQ号 踢出用户`
        ].join('\n')
        
        await e.reply(msg, true)
    }

    /**
     * 强制下线用户（主人）
     */
    async sf_forceLogout(e) {
        const match = e.msg.match(/^#(?:sf|SF)(?:webui|WebUI)?(?:强制下线|踢出)(@?\d+)?/i)
        let targetQQ = match?.[1]?.replace('@', '')
        
        if (!targetQQ && e.at) {
            targetQQ = String(e.at)
        }
        
        if (!targetQQ) {
            await e.reply('请指定要强制下线的用户\n用法: #sf强制下线 QQ号', true)
            return
        }
        
        const { forceLogout } = await import('../utils/loginSecurity.js')
        const success = forceLogout(targetQQ)
        
        if (success) {
            await e.reply(`✅ 用户 ${targetQQ} 已被强制下线\n该用户需要重新登录`, true)
            
            // 通知被下线的用户
            try {
                await e.bot.sendPrivateMsg(targetQQ, '⚠️ 你的 WebUI 会话已被管理员强制下线，如需使用请重新登录。')
            } catch (err) {
                logger.debug(`[sf插件] 通知用户 ${targetQQ} 失败:`, err)
            }
        } else {
            await e.reply(`⚠️ 用户 ${targetQQ} 当前不在线`, true)
        }
    }
}
