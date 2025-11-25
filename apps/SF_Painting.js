import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import Config from '../components/Config.js'
import common from '../../../lib/common/common.js';
import {
    parseSourceImg,
    url2Base64,
    getImgFrom_awaitContext,
} from '../utils/getImg.js'
import { handleParam } from '../utils/parse.js'
import { markdown_screenshot } from '../utils/markdownPic.js'
import { processMessageWithUrls } from '../utils/extractUrl.js'
import {
    saveContext,
    loadContext,
    formatContextForGemini,
    clearUserContext,
    clearAllContext,
    clearContextByCount,
} from '../utils/context.js'
import { getUin } from '../utils/common.js'
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { MJ_Painting } from './MJ_Painting.js'
import { memberControlProcess } from '../utils/memberControl.js'
import {
    getChatHistory_w,
    buildChatHistoryPrompt,
} from '../utils/onebotUtils.js'
import { applyPresets } from '../utils/applyPresets.js'
import {
    hidePrivacyInfo,
    removeCQCode,
} from '../utils/common.js'

var Ws_Server = {};
init_server();

export class SF_Painting extends plugin {
    constructor() {
        const config = Config.getConfig()
        /** 使机器人可以对其第一人称回应 */
        const reg_chatgpt_for_firstperson_call = config?.botName || `sf-plugin-bot-name-${Math.floor(10000 + Math.random() * 90000)}`;
        super({
            name: 'SF_对话&绘图',
            dsc: 'SF_对话&绘图',
            event: 'message',
            priority: 1143,
            rule: [
                {
                    reg: '^#(flux|FLUX|(sf|SF)(画图|绘图|绘画))',
                    fnc: 'sf_draw'
                },
                {
                    reg: '^#(sf|SF|siliconflow|硅基流动)设置(画图key|翻译key|翻译baseurl|翻译模型|生成提示词|推理步数|fish发音人|ss图片模式|ggkey|ggbaseurl|gg图片模式|上下文|ss转发消息|gg转发消息|gg搜索|ss引用原消息|gg引用原消息|ws服务|ss转发思考|群聊多人对话|ss图片上传|gg图片上传)',
                    fnc: 'sf_setConfig',
                    permission: 'master'
                },
                {
                    reg: '^#(sf|SF|siliconflow|硅基流动)(设置|管理)帮助$',
                    fnc: 'sf_help',
                    permission: 'master'
                },
                {
                    reg: '^#(ss|SS)',
                    fnc: 'sf_chat',
                },
                {
                    reg: '^#(gg|GG)',
                    fnc: 'gg_chat',
                },
                {
                    reg: '^#(sf|SF)结束全部对话$',
                    fnc: 'sf_end_all_chat',
                    permission: 'master'
                },
                {
                    reg: '^#(sf|SF)结束((ss|gg|dd)?)对话(\\d+)?.*$',
                    fnc: 'sf_end_chat',
                },
                {
                    reg: reg_chatgpt_for_firstperson_call,
                    fnc: 'sf_first_person_call',
                    log: false
                },
                {
                    reg: '^#(sf|SF)(清除|删除)((ss|gg)?)?(前面?|最近的?)(\\d+)条对话$',
                    fnc: 'sf_clearContextByCount',
                },
                {
                    reg: '^#(sf|SF)(s|g)(.*)接口列表$',
                    fnc: 'sf_list_api',
                },
                {
                    reg: '^#(sf|SF)(ss|gg)使用接口(\\d+)$',
                    fnc: 'sf_select_api',
                },
                {
                    reg: '^#(s|S)(?!f|F)(.+?)结束对话(\\d+)?.*$',
                    fnc: 'sf_select_and_end_chat',
                },
                {
                    reg: '^#(g|G)(?!g|G)(.+?)结束对话(\\d+)?.*$',
                    fnc: 'gg_select_and_end_chat',
                },
                {
                    reg: '^#(s|S)(?!f|F|s|S)(.+)',
                    fnc: 'sf_select_and_chat',
                    log: false
                },
                {
                    reg: '^#(g|G)(?!g|G)(.+)',
                    fnc: 'gg_select_and_chat',
                    log: false
                },
                {
                    /** At模式 */
                    reg: '^[^#][sS]*',
                    fnc: 'atChatMode',
                    log: false
                },
            ]
        })
        this.sf_keys_index = -1

    }

    // 处理SS模式消息
    async handleSSMessage(ws, content, images, userQQ = 'web_user') {
        try {
            const type = "ss"
            let msg = content;

            // 获取配置
            const config = Config.getConfig();

            // 处理命令
            if (msg.startsWith('#')) {
                const result = await this.handleCommands(ws, msg, userQQ, config);
                if (result) return; // 如果是命令且已处理,直接返回
            }

            // 构造模拟的e对象
            const e = {
                msg: `#${type} ${msg}`,
                img: images, // 直接使用传入的base64图片数组
                reply: (content, quote = false) => {
                    this.sendMessage(ws, type, content, config);
                },
                user_id: userQQ,
                self_id: this.e?.self_id || Bot.uin,
                sender: this.e?.sender || {
                    card: config.wsDefaultUser || '小白',
                    nickname: config.wsDefaultUser || '小白'
                },
                isMaster: true  // WebSocket用户默认为主人权限
            };

            const apiList = config[`${type}_APIList`];
            // 判断 是否开启 上下文功能
            const apiIndex = config[`${type}_usingAPI`] - 1;
            if (apiIndex > -1)
                config.gg_ss_useContext = apiList[apiIndex].useContext ? true : false;

            // 调用原有的sf_chat方法
            await this.sf_chat(e, config);
        } catch (error) {
            this.sendError(ws, error.message);
        }
    }

    // 处理GG模式消息
    async handleGGMessage(ws, content, images, userQQ = 'web_user') {
        try {
            const type = "gg"
            let msg = content;

            // 获取配置
            const config = Config.getConfig();

            // 处理命令
            if (msg.startsWith('#')) {
                const result = await this.handleCommands(ws, msg, userQQ, config);
                if (result) return; // 如果是命令且已处理,直接返回
            }

            // 构造模拟的e对象
            const e = {
                msg: `#${type} ${msg}`,
                img: images, // 直接使用传入的base64图片数组
                reply: (content, quote = false) => {
                    this.sendMessage(ws, type, content, config);
                },
                user_id: userQQ,
                self_id: this.e?.self_id || Bot.uin,
                sender: this.e?.sender || {
                    card: config.wsDefaultUser || '小白',
                    nickname: config.wsDefaultUser || '小白'
                },
                isMaster: true  // WebSocket用户默认为主人权限
            };

            const apiList = config[`${type}_APIList`];
            // 判断 是否开启 上下文功能
            const apiIndex = config[`${type}_usingAPI`] - 1;
            if (apiIndex > -1)
                config.gg_ss_useContext = apiList[apiIndex].useContext ? true : false;

            // 调用原有的gg_chat方法
            await this.gg_chat(e, config);
        } catch (error) {
            this.sendError(ws, error.message);
        }
    }

    // 发送消息
    sendMessage(ws, type, content, config = undefined) {
        // 确保content是字符串类型
        let messageContent = String(content);
        let imageUrl = null;

        // 处理图片消息
        if (content.type === 'image') {
            // 如果是 Buffer 或 base64，直接使用
            if (content.file && (Buffer.isBuffer(content.file) || content.file.startsWith('data:image'))) {
                const base64Data = Buffer.isBuffer(content.file) ?
                    `data:image/jpeg;base64,${content.file.toString('base64')}` :
                    content.file;
                messageContent = `![图片](${base64Data})`;
            }
            // 如果是本地文件路径，读取并转换为base64
            else if (content.file && typeof content.file === 'string' && !content.file.startsWith('http')) {
                try {
                    const fs = require('fs');
                    const imageBuffer = fs.readFileSync(content.file);
                    const base64Data = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
                    messageContent = `![图片](${base64Data})`;
                } catch (error) {
                    logger.error('[sf插件] 读取本地图片失败:', error);
                    messageContent = '[图片发送失败]';
                }
            }
            // 如果是网络URL，直接传递URL
            else if (content.file && content.file.startsWith('http')) {
                imageUrl = content.file;
                messageContent = `![图片](${content.file})`;
            }
        }
        // 处理合并转发消息中的图片
        else if (typeof content === 'string') {
            messageContent = content.replace(/\[图片\]|\[CQ:image,file=([^\]]+)\]/g, (match, url) => {
                if (url) {
                    // 如果是base64或者http链接，直接使用
                    if (url.startsWith('data:image') || url.startsWith('http')) {
                        if (url.startsWith('http')) {
                            imageUrl = url;
                        }
                        return `![图片](${url})`;
                    }
                    // 如果是本地文件，转换为base64
                    try {
                        const fs = require('fs');
                        const imageBuffer = fs.readFileSync(url);
                        const base64Data = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
                        return `![图片](${base64Data})`;
                    } catch (error) {
                        logger.error('[sf插件] 读取本地图片失败:', error);
                        return '[图片发送失败]';
                    }
                }
                return match;
            });
        }

        const message = {
            type,
            content: messageContent,
            timestamp: new Date().getTime()
        };

        // 如果有图片URL，添加到消息中
        if (imageUrl) {
            message.imageUrl = imageUrl;
        }

        try {
            const logLevel = config.wsLogLevel || 'info';
            if (logLevel === 'debug') {
                logger.mark(`[sf插件] 发送消息给前端: ${JSON.stringify(message)}`);
            }
            ws.send(JSON.stringify(message));
        } catch (error) {
            logger.error('发送消息失败:', error);
            this.sendError(ws, '发送消息失败: ' + error.message);
        }
    }

    // 发送错误消息
    sendError(ws, errorMessage) {
        const message = {
            type: 'error',
            content: errorMessage,
            timestamp: new Date().getTime()
        };

        try {
            logger.mark(`[sf插件] 发送错误消息给前端: ${JSON.stringify(message)}`);
            ws.send(JSON.stringify(message));
        } catch (error) {
            logger.error('发送错误消息失败:', error);
            // 这里不能再调用sendError，避免无限递归
            try {
                ws.send(JSON.stringify({
                    type: 'error',
                    content: '发送错误消息失败: ' + error.message,
                    timestamp: new Date().getTime()
                }));
            } catch (e) {
                logger.error('发送最终错误消息失败:', e);
            }
        }
    }

    // // 处理SS命令
    // async processSSCommand(content) {
    //     // 在这里实现SS模式的具体逻辑
    //     return `SS模式回复: ${content}`;
    // }

    // // 处理GG命令
    // async processGGCommand(content) {
    //     // 在这里实现GG模式的具体逻辑
    //     return `GG模式回复: ${content}`;
    // }

    // 处理第一人称呼叫
    async sf_first_person_call(e) {
        // 读取配置
        const config = Config.getConfig()

        // 检查是否为私聊且私聊AI对话未启用
        if (!e.isGroup && !config.enablePrivateChatAI) {
            logger.info('私聊模式AI对话未启用，不予理会')
            return false
        }

        // 检查消息是否包含 "自动回复"
        if (!e.isGroup && e.msg && e.msg.includes("自动回复")) {
            logger.info("消息包含自动回复，不触发AI对话")
            return false
        }

        // 检查消息内容
        let msg = e.msg
        if (!msg || msg.startsWith('#')) {
            logger.info('消息以#开头，，不予理会')
            return false
        }
        if (e.user_id == getUin(e)) {
            logger.info('机器人自己发出来的消息，不予理会')
            return false
        }

        // 定义搜索相关的关键词
        const searchKeywords = ['搜索', '查询', '查一查', '找找', '帮我找', '查查', '搜一下', '查找']

        // 检查消息中是否包含搜索关键词
        const hasSearchKeyword = searchKeywords.some(keyword => msg.includes(keyword))

        e.sf_is_from_first_person_call = true;

        // 根据配置和搜索关键词决定使用哪个命令
        return (config.defaultCommand === 'ss' && !hasSearchKeyword) ? this.sf_chat(e, config) : this.gg_chat(e, config)
    }

    /** 轮询 sf_keys，可禁用key */
    get_use_sf_key(sf_keys) {
        let use_sf_key = null
        let count = 0;
        while (!use_sf_key && count < sf_keys.length) {
            count++
            if (this.sf_keys_index < sf_keys.length - 1) {
                this.sf_keys_index++
            } else
                this.sf_keys_index = 0

            if (sf_keys[this.sf_keys_index].isDisable)
                continue
            else {
                use_sf_key = sf_keys[this.sf_keys_index].sf_key
            }
        }
        return use_sf_key
    }

    /** 随机轮询字符串中英文逗号分割 */
    get_random_key(apiKeys) {
        if (!apiKeys) return '';
        const keysArr = apiKeys.split(/[,，]/).map(key => key.trim()).filter(Boolean);
        if (keysArr.length === 0) return '';

        // 随机选择一个key
        const randomIndex = Math.floor(Math.random() * keysArr.length);
        logger.info(`[sf插件]随机使用第${randomIndex + 1}个Key: ${keysArr[randomIndex].replace(/(.{7}).*(.{10})/, '$1****$2')}`);
        return keysArr[randomIndex];
    }

    /** Decode */
    ggKeyFreeDecode(str) {
        try {
            return Buffer.from(str, 'base64').toString('utf8');
        } catch (error) {
            throw new Error(`ggKeyFreeDecode 失败: ${error.message}`);
        }
    }

    async sf_setConfig(e) {
        // 读取配置
        let config_date = Config.getConfig()
        const match = e.msg.match(/^#(sf|SF|siliconflow|硅基流动)设置(画图key|翻译key|翻译baseurl|翻译模型|生成提示词|推理步数|fish发音人|ss图片模式|ggkey|ggbaseurl|gg图片模式|上下文|ss转发消息|gg转发消息|gg搜索|ss引用原消息|gg引用原消息|ws服务|ss转发思考|群聊多人对话|ss图片上传|gg图片上传|ss必需图片|gg必需图片|ss必须返回图片|gg必须返回图片|ss群聊聊天记录条数|gg群聊聊天记录条数)([\s\S]*)/)
        if (match) {
            const [, , type, value] = match
            switch (type) {
                case '画图key':
                    config_date.sf_keys.push({ sf_key: value })
                    break
                case '翻译模型':
                    config_date.translateModel = value
                    break
                case '生成提示词':
                    config_date.generatePrompt = value === '开'
                    break
                case '推理步数':
                    config_date.num_inference_steps = parseInt(value)
                    break
                case 'fish发音人':
                    config_date.fish_reference_id = value
                    break
                case 'ss图片模式':
                    config_date.ss_useMarkdown = value === '开'
                    break
                case 'ggkey':
                    config_date.ggKey = value
                    break
                case 'ggbaseurl':
                    config_date.ggBaseUrl = value
                    break
                case 'gg图片模式':
                    config_date.gg_useMarkdown = value === '开'
                    break
                case '上下文':
                    config_date.gg_ss_useContext = value === '开'
                    break
                case 'ss转发消息':
                    config_date.ss_forwardMessage = value === '开'
                    break
                case 'gg转发消息':
                    config_date.gg_forwardMessage = value === '开'
                    break
                case 'ss必需图片':
                    config_date.ss_mustNeedImgLength = value === parseInt(value)
                    break
                case 'gg必需图片':
                    config_date.gg_mustNeedImgLength = value === parseInt(value)
                    break
                case 'ss必须返回图片':
                    config_date.ss_mustReturnImgRetriesTimes = value === parseInt(value)
                    break
                case 'gg必须返回图片':
                    config_date.gg_mustReturnImgRetriesTimes = value === parseInt(value)
                    break
                case 'ss群聊聊天记录条数':
                    config_date.ss_groupContextLength = value === parseInt(value)
                    break
                case 'gg群聊聊天记录条数':
                    config_date.gg_groupContextLength = value === parseInt(value)
                    break
                case 'gg搜索':
                    config_date.gg_useSearch = value === '开'
                    break
                case 'ss引用原消息':
                    config_date.ss_quoteMessage = value === '开'
                    break
                case 'gg引用原消息':
                    config_date.gg_quoteMessage = value === '开'
                    break
                case 'ws服务':
                    const isEnable = value === '开';
                    config_date.enableWS = isEnable;
                    // 根据设置启动或关闭服务
                    if (isEnable) {
                        this.init_server();
                    } else {
                        // 关闭WebSocket服务器
                        if (Ws_Server.sfPluginWSServer) {
                            Ws_Server.sfPluginWSServer.close();
                            Ws_Server.sfPluginWSServer = null;
                        }
                        // 关闭HTTP服务器
                        if (Ws_Server.sfPluginServer) {
                            Ws_Server.sfPluginServer.close();
                            Ws_Server.sfPluginServer = null;
                        }
                        logger.mark('[sf插件] WebSocket服务已关闭');
                    }
                    break
                case 'ss转发思考':
                    config_date.ss_forwardThinking = value === '开'
                    break
                case '群聊多人对话':
                    config_date.groupMultiChat = value === '开'
                    break
                case 'ss图片上传':
                    config_date.ss_enableImageUpload = value === '开'
                    break
                case 'gg图片上传':
                    config_date.gg_enableImageUpload = value === '开'
                    break
                default:
                    return
            }
            Config.setConfig(config_date)
            await e.reply(`${type}已设置：${value}`)
        }
        return
    }

    async sf_draw(e) {
        // 读取配置
        const config_date = Config.getConfig()
        e.sfRuntime = { config: config_date }

        if (config_date.sf_keys.length == 0) {
            await e.reply('请先设置画图API Key。使用命令：#sf设置画图key [值]（仅限主人设置）')
            return false
        }

        // CD次数限制
        const memberConfig = {
            feature: 'SF_Painting',
            cdTime: config_date.sf_cdtime,
            dailyLimit: config_date.sf_dailyLimit,
            unlimitedUsers: config_date.sf_unlimitedUsers,
            onlyGroupID: config_date.sf_onlyGroupID,
        }
        const result_member = await memberControlProcess(e, memberConfig);
        if (!result_member.allowed) {
            if (result_member.message)
                e.reply(result_member.message, true, { recallMsg: 60 });
            return false;
        }

        // 处理图生图模型
        let canImg2Img = false;
        if (config_date.imageModel.match(/stabilityai\/stable-diffusion-3-medium|stabilityai\/stable-diffusion-xl-base-1.0|stabilityai\/stable-diffusion-2-1|stabilityai\/stable-diffusion-3-5-large|Qwen\/Qwen-Image-Edit/)) {
            canImg2Img = true;
        }

        // 处理引用图片
        await parseSourceImg(e)
        let souce_image_base64
        if (e.img && canImg2Img) {
            souce_image_base64 = await url2Base64(e.img[0])
            if (!souce_image_base64) {
                e.reply('引用的图片地址已失效，请重新发送图片', true)
                return false
            }
        }
        else
            canImg2Img = false;

        result_member.record();

        let msg = e.msg.replace(/^#(flux|FLUX|(sf|SF)(画图|绘图|绘画))(\n*)?/, '').trim()

        // 处理预设
        const presetResult = applyPresets(msg, Config.getConfig("presets"))
        msg = presetResult.processedText

        // 处理 msg
        let param = await handleParam(e, msg)

        let userPrompt = param.input
        let finalPrompt = await this.txt2img_generatePrompt(e, userPrompt, config_date);

        this.sf_send_pic(e, finalPrompt, this.get_use_sf_key(config_date.sf_keys), config_date, param, canImg2Img, souce_image_base64, presetResult.originalText)
        return true;
    }

    /**
     * @description: 生成提示词 附带回复文案
     * @param {*} e
     * @param {*} userPrompt
     * @param {*} config_date
     * @return {*}
     */
    async txt2img_generatePrompt(e, userPrompt, config_date) {
        let finalPrompt = userPrompt
        let onleReplyOnce = 0;
        const use_sf_key = this.get_use_sf_key(config_date.sf_keys)
        if (e.sfRuntime.isgeneratePrompt ?? config_date.generatePrompt) {
            if (!onleReplyOnce && !config_date.simpleMode) {
                e.reply(`@${e.sender.card || e.sender.nickname} ${e.user_id}正在为您生成提示词并绘图...`)
                onleReplyOnce++
            }
            finalPrompt = (await this.generatePrompt(userPrompt, use_sf_key, config_date))?.content
            if (!finalPrompt) {
                e.reply('生成提示词失败，请稍后再试。')
                return false
            }
            logger.debug("[sf插件]自动提示词生成：" + finalPrompt);
        }
        if (!onleReplyOnce && !config_date.simpleMode) {
            e.reply(`@${e.sender.card || e.sender.nickname} ${e.user_id}正在为您生成图片...`)
            onleReplyOnce++
        }
        return finalPrompt;
    }

    /** At模式 */
    async atChatMode(e) {
        // 读取配置
        const config = Config.getConfig()

        // 检查是否为私聊且私聊AI对话未启用
        if (!e.isGroup && !config.enablePrivateChatAI) {
            logger.info('私聊模式AI对话未启用，不予理会')
            return false
        }

        if (!e.msg || e.msg?.startsWith('#'))
            return false
        if (e.user_id == getUin(e))
            return false

        // 检查自动回复配置
        let shouldAutoReply = false
        if (e.isGroup) {
            const groupConfig = config.autoReply?.find(item => item.groupId === e.group_id)
            if (groupConfig && groupConfig.enabled) {
                // 根据概率判断是否触发群自动回复
                const randomValue = Math.random()
                if (randomValue < (groupConfig.probability || 0.1)) {
                    shouldAutoReply = true
                    logger.info(`[SF插件][自动回复] 群${e.group_id}触发自动回复`)
                }
            }
        }

        // 如果不是自动回复，则检查 toggleAtMode 和 at 条件
        if (!shouldAutoReply) {
            if (!config.toggleAtMode)
                return false
            if ((e.isGroup || e.group_id) && !(e.atme || e.atBot || (e.at === e.self_id)))
                return false
        }

        // 处理 昵称
        try {
            e.msg = e.msg.trim()
            if (e.isGroup) {
                let mm = this.e.bot.gml
                let me = mm.get(getUin(e)) || {}
                let card = me.card
                let nickname = me.nickname
                if (nickname && card) {
                    if (nickname.startsWith(card)) {
                        e.msg = e.msg.replace(`@${nickname}`, '').trim()
                    } else if (card.startsWith(nickname)) {
                        e.msg = e.msg.replace(`@${card}`, '').trim()
                        e.msg = e.msg.replace(`@${nickname}`, '').trim()
                    } else {
                        if (nickname)
                            e.msg = e.msg.replace(`@${nickname}`, '').trim()
                        if (card)
                            e.msg = e.msg.replace(`@${card}`, '').trim()
                    }
                } else if (nickname) {
                    e.msg = e.msg.replace(`@${nickname}`, '').trim()
                } else if (card) {
                    e.msg = e.msg.replace(`@${card}`, '').trim()
                }
            }
        } catch (err) {
            logger.warn(err)
        }

        e.sf_is_from_first_person_call = true;

        return config.defaultCommand === 'ss' ? this.sf_chat(e, config) : this.gg_chat(e, config)
    }

    async sf_chat(e, config_date = undefined) {
        // 读取配置
        if (!config_date)
            config_date = Config.getConfig()

        // 如果消息包含"自动回复"，则不处理
        if (!e.isGroup && e.msg && e.msg.includes("自动回复")) {
            logger.info("消息包含自动回复，不触发AI对话")
            return false
        }

        // 判断用户身份
        const isMaster = e.isMaster

        // 获取接口配置
        let use_sf_key = "", apiBaseUrl = "", model = "", systemPrompt = "", useMarkdown = false, forwardMessage = true, quoteMessage = true, forwardThinking = false, enableImageUpload = true, mustNeedImgLength = 0, mustReturnImgRetriesTimes = 0, paintModel = false
        let cdtime = 0, dailyLimit = 0, unlimitedUsers = [], onlyGroupID = [], memberConfigName = 'ss_default', groupContextLength = 0

        // 根据用户身份选择使用的接口索引
        const usingApiIndex = (isMaster || e.sf_is_from_first_person_call) ? config_date.ss_usingAPI : e.sf_llm_user_API || await findIndexByRemark(e, "ss", config_date)

        // 处理群聊多人对话
        let contextKey = e.user_id;
        if (e.isGroup && config_date.groupMultiChat) {
            contextKey = `group_${e.group_id}`;
        }

        if (usingApiIndex > 0 && config_date.ss_APIList && config_date.ss_APIList[usingApiIndex - 1]) {
            // 使用接口列表中的配置
            const apiConfig = config_date.ss_APIList[usingApiIndex - 1]

            // 检查接口是否仅限主人使用
            if (!isMaster && apiConfig.isOnlyMaster) {
                // await e.reply('该接口仅限主人使用')
                logger.info("[sf对话]该接口仅限主人使用");
                return false
            }
            // 只有当APIList中的字段有值时才使用该值
            use_sf_key = this.get_random_key(apiConfig.apiKey) || this.get_random_key(config_date.ss_Key) || ""
            apiBaseUrl = apiConfig.apiBaseUrl || config_date.ss_apiBaseUrl || config_date.sfBaseUrl
            model = apiConfig.model || config_date.ss_model || config_date.translateModel
            systemPrompt = apiConfig.prompt || config_date.ss_Prompt || "You are a helpful assistant, you prefer to speak Chinese"
            useMarkdown = (typeof apiConfig.useMarkdown !== 'undefined') ? apiConfig.useMarkdown : false
            forwardMessage = (typeof apiConfig.forwardMessage !== 'undefined') ? apiConfig.forwardMessage : false
            mustNeedImgLength = (typeof apiConfig.mustNeedImgLength !== 'undefined') ? apiConfig.mustNeedImgLength : 0
            mustReturnImgRetriesTimes = (typeof apiConfig.mustReturnImgRetriesTimes !== 'undefined') ? apiConfig.mustReturnImgRetriesTimes : 0
            paintModel = (typeof apiConfig.paintModel !== 'undefined') ? apiConfig.paintModel : false
            groupContextLength = (typeof apiConfig.groupContextLength !== 'undefined') ? apiConfig.groupContextLength : 0
            quoteMessage = (typeof apiConfig.quoteMessage !== 'undefined') ? apiConfig.quoteMessage : false
            forwardThinking = (typeof apiConfig.forwardThinking !== 'undefined') ? apiConfig.forwardThinking : false
            enableImageUpload = (typeof apiConfig.enableImageUpload !== 'undefined') ? apiConfig.enableImageUpload : true
            memberConfigName = (typeof apiConfig.customCommand !== 'undefined' && apiConfig.customCommand) ? `ss_${apiConfig.customCommand}` : memberConfigName
            cdtime = (typeof apiConfig.cdtime !== 'undefined') ? apiConfig.cdtime : cdtime
            dailyLimit = (typeof apiConfig.dailyLimit !== 'undefined') ? apiConfig.dailyLimit : dailyLimit
            unlimitedUsers = (typeof apiConfig.unlimitedUsers !== 'undefined') ? apiConfig.unlimitedUsers : unlimitedUsers
            onlyGroupID = (typeof apiConfig.onlyGroupID !== 'undefined') ? apiConfig.onlyGroupID : onlyGroupID
        } else if (config_date.ss_apiBaseUrl) {
            // 检查默认配置是否仅限主人使用
            if (!isMaster && config_date.ss_isOnlyMaster) {
                // await e.reply('默认配置仅限主人使用')
                logger.info("[sf对话]已开启仅限主人使用默认配置");
                return false
            }
            // 使用默认配置
            use_sf_key = this.get_random_key(config_date.ss_Key)
            apiBaseUrl = config_date.ss_apiBaseUrl
            model = config_date.ss_model
            systemPrompt = config_date.ss_Prompt || "You are a helpful assistant, you prefer to speak Chinese"
            useMarkdown = config_date.ss_useMarkdown
            forwardMessage = config_date.ss_forwardMessage
            mustNeedImgLength = config_date.ss_mustNeedImgLength
            mustReturnImgRetriesTimes = config_date.ss_mustReturnImgRetriesTimes
            groupContextLength = config_date.ss_groupContextLength
            quoteMessage = config_date.ss_quoteMessage
            forwardThinking = config_date.ss_forwardThinking
            enableImageUpload = config_date.ss_enableImageUpload
        } else if (config_date.sf_keys.length == 0) {
            await e.reply('请先设置API Key。使用命令：#sf设置画图key [值]（仅限主人设置）')
            return false
        } else {
            // 使用绘画配置中的 sf key
            use_sf_key = this.get_use_sf_key(config_date.sf_keys)
            apiBaseUrl = config_date.sfBaseUrl
            model = config_date.translateModel
            systemPrompt = config_date.ss_Prompt || "You are a helpful assistant, you prefer to speak Chinese"
            useMarkdown = config_date.ss_useMarkdown
            forwardMessage = config_date.ss_forwardMessage
            mustNeedImgLength = config_date.ss_mustNeedImgLength
            mustReturnImgRetriesTimes = config_date.ss_mustReturnImgRetriesTimes
            groupContextLength = config_date.ss_groupContextLength
            quoteMessage = config_date.ss_quoteMessage
            forwardThinking = config_date.ss_forwardThinking
            enableImageUpload = config_date.ss_enableImageUpload
        }

        // CD次数限制
        const memberConfig = {
            feature: memberConfigName,
            cdTime: cdtime,
            dailyLimit: dailyLimit,
            unlimitedUsers: unlimitedUsers,
            onlyGroupID: onlyGroupID,
        }
        const result_member = await memberControlProcess(e, memberConfig);
        if (!result_member.allowed) {
            if (result_member.message)
                e.reply(result_member.message, true, { recallMsg: 60 });
            return false;
        }

        // 处理引用消息,获取图片和文本
        await parseSourceImg(e)
        if (mustNeedImgLength) {
            await getImgFrom_awaitContext(e, mustNeedImgLength, memberConfigName, this)
            if (e.img.length < mustNeedImgLength)
                return true;
        }
        let currentImages = [];
        if (e.img && e.img.length > 0 && enableImageUpload) {
            // 记录获取到的图片链接
            logger.info(`[SF插件][ss]获取到图片链接:\n${e.img.join('\n')}`)
            // 获取所有图片数据
            for (const imgUrl of e.img) {
                try {
                    // 如果已经是base64格式，直接使用
                    if (typeof imgUrl === 'string' && (imgUrl.startsWith('data:image') || imgUrl.match(/^[A-Za-z0-9+/=]+$/))) {
                        // 如果是完整的data URL，提取base64部分
                        const base64Data = imgUrl.startsWith('data:image') ? imgUrl.split(',')[1] : imgUrl;
                        currentImages.push(base64Data);
                        continue;
                    }

                    // 尝试转换为base64
                    const base64Image = await url2Base64(imgUrl);
                    if (!base64Image) {
                        logger.error(`[SF插件][ss]图片处理失败: ${imgUrl}`);
                        continue;
                    }
                    currentImages.push(base64Image);
                } catch (error) {
                    logger.error(`[SF插件][ss]处理图片时出错: ${error.message}`);
                    continue;
                }
            }

            // 如果所有图片都处理失败
            if (currentImages.length === 0 && e.img.length > 0) {
                e.reply('处理图片失败，请重新发送', true);
                return false;
            }
        }

        result_member.record();

        let msg = e.msg.replace(/^#(ss|SS)/, '').trim()
        /** 发送给AI的信息 */
        let toAiMessage = msg;

        // 处理预设
        if (paintModel) {
            const presetResult = applyPresets(toAiMessage, Config.getConfig("presets"))
            toAiMessage = presetResult.processedText + "\n你将总是按照要求返回图片"
            msg = presetResult.originalText
            e.reply(`人家开始生成啦，请等待1-10分钟`, true);
        }

        // 如果有引用的文本,添加两个换行来分隔
        const quotedText = e.sourceMsg ? e.sourceMsg + '\n\n' : ''
        msg = quotedText + msg

        // 处理消息中的URL
        // logger.mark(`[SF插件][URL处理]开始处理消息中的URL: ${msg}`)
        let extractedContent = '';
        try {
            // 根据是否为图片模式决定是否在消息中显示提取的内容
            const { message: processedMsg, extractedContent: extracted } = await processMessageWithUrls(msg, false);
            msg = processedMsg;
            extractedContent = extracted;

            if (extractedContent) {
                logger.debug(`[SF插件][URL处理]URL处理成功`)
            } else {
                logger.debug(`[SF插件][URL处理]消息中未发现需要处理的URL`)
            }
        } catch (error) {
            logger.error(`[SF插件][URL处理]处理URL时发生错误，将使用原始消息继续处理: ${error.message}`)
        }
        // 发送给AI的信息（加上 url 提取的内容）
        toAiMessage += extractedContent;

        // 保存用户消息到历史记录
        if (config_date.gg_ss_useContext && !paintModel) {
            const senderValue = e.sender ? `${e.sender.card || e.sender.nickname}(${e.user_id})` : undefined;

            // 保存用户消息
            await saveContext(contextKey, {
                role: 'user',
                content: toAiMessage,
                // extractedContent: extractedContent, // 实际内容早就加在 toAiMessage 中了
                // imageBase64: currentImages.length > 0 ? currentImages : undefined, // 不需要每次都让 AI 读取历史聊条的图片
                sender: senderValue
            }, (isMaster || e.sf_is_from_first_person_call) ? config_date.ss_usingAPI : e.sf_llm_user_API || await findIndexByRemark(e, "ss", config_date), 'ss')
        }

        // 获取历史对话
        let historyMessages = []
        if (config_date.gg_ss_useContext && !paintModel) {
            historyMessages = await loadContext(contextKey, (isMaster || e.sf_is_from_first_person_call) ? config_date.ss_usingAPI : e.sf_llm_user_API || await findIndexByRemark(e, "ss", config_date), 'ss')
            logger.debug(`[SF插件][ss]加载历史对话: ${historyMessages.length} 条`)
        }

        // 收集历史图片
        let historyImages = [];
        // 从历史消息中收集图片
        if (enableImageUpload) {
            historyMessages.forEach(msg => {
                if (msg.imageBase64) {
                    historyImages = historyImages.concat(msg.imageBase64);
                }
            });
        }

        // 允许机器人读取近期的最多群聊聊天记录条数
        if (e.isGroup && groupContextLength > 0) {
            let chatHistory = []
            try {
                chatHistory = await getChatHistory_w(e.group ?? (e.bot.pickGroup ? e.bot.pickGroup(e.group_id) : (e.bot[e.group_id] ? e.bot[e.group_id].pickGroup(e.group_id) : null)), groupContextLength)
                logger.debug(`[群自动打招呼] 群 ${e.group_id} 获取到 ${chatHistory.length} 条聊天记录`)
            } catch (error) {
                logger.error(`[群自动打招呼] 获取群 ${e.group_id} 聊天记录失败: ${error}`)
            }
            // 构造打招呼的prompt
            const prompt = 'There is the conversation history in the group, you must chat according to the conversation history context"'
            systemPrompt += "\n\n" + buildChatHistoryPrompt(chatHistory, prompt, e.self_id)
        }

        const opt = {
            currentImages: currentImages.length > 0 ? currentImages : undefined,
            historyImages: historyImages.length > 0 ? historyImages : undefined,
            systemPrompt: systemPrompt,
            mustReturnImgRetriesTimes: mustReturnImgRetriesTimes
        }

        logger.info(`[sf prompt]${toAiMessage}`)
        let { content: answer, imageBase64Array: generatedImageArray, isError } = await this.generatePrompt(toAiMessage, use_sf_key, config_date, true, apiBaseUrl, model, opt, historyMessages, e)

        // 如果是错误返回，不保存聊天记录，直接回复错误信息
        if (isError) {
            await e.reply(hidePrivacyInfo(answer), quoteMessage);
            return;
        }

        // 移除 CQ
        answer = removeCQCode(answer);

        // 处理思考过程
        let thinkingContent = '';
        let cleanedAnswer = answer;

        // 尝试从reasoning_content中获取思考过程
        if (answer.reasoning_content) {
            thinkingContent = answer.reasoning_content;
            cleanedAnswer = answer.content;
        } else {
            // 尝试从<think>标签中获取思考过程
            const thinkMatch = answer.match(/<think>([\s\S]*?)<\/think>/);
            if (thinkMatch) {
                thinkingContent = thinkMatch[1].trim();
                cleanedAnswer = answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            }
        }

        // 保存AI回复
        if (config_date.gg_ss_useContext && !paintModel) {
            await saveContext(contextKey, {
                role: 'assistant',
                content: cleanedAnswer,
                imageBase64: undefined
            }, (isMaster || e.sf_is_from_first_person_call) ? config_date.ss_usingAPI : e.sf_llm_user_API || await findIndexByRemark(e, "ss", config_date), 'ss')
        }

        // 发送消息
        try {
            if (generatedImageArray && generatedImageArray.length > 0) {
                if (useMarkdown) {
                    // 在markdown模式下，将图片融入到markdown内容中
                    let imgMarkdown = cleanedAnswer + '\n\n';
                    generatedImageArray.forEach((imageBase64, index) => {
                        imgMarkdown += `![生成的图片${index + 1}](${imageBase64})\n\n`;
                    });

                    const img = await markdown_screenshot(e.user_id, e.self_id, e.img ? e.img.map(url => `<img src="${url}" width="256">`).join('\n') + "\n\n" + msg : msg, imgMarkdown);
                    if (img) {
                        await e.reply({ ...img, origin: true }, quoteMessage);
                    } else {
                        logger.error('[sf插件] markdown图片生成失败，使用普通方式发送');
                        // 如果markdown生成失败，使用普通方式发送
                        const replyArray = [cleanedAnswer];
                        generatedImageArray.forEach((imageBase64) => {
                            replyArray.push({ ...segment.image(`base64://${imageBase64.replace(/data:image\/\w+;base64,/g, "")}`), origin: true });
                        });
                        await e.reply(replyArray, quoteMessage);
                    }

                    if (forwardMessage) {
                        const forwardMsg = [];
                        generatedImageArray.forEach((imageBase64) => {
                            forwardMsg.push({ ...segment.image(`base64://${imageBase64.replace(/data:image\/\w+;base64,/g, "")}`), origin: true });
                        });
                        forwardMsg.push(cleanedAnswer);
                        // 如果有思考过程且开启了转发思考
                        if (thinkingContent && forwardThinking) {
                            forwardMsg.push('[thinking]', thinkingContent);
                        }
                        e.reply(await common.makeForwardMsg(e, forwardMsg, `${e.sender.card || e.sender.nickname || e.user_id}的对话`));
                    }
                } else {
                    // 非markdown模式，使用普通方式发送
                    const replyArray = [];
                    if (!paintModel)
                        replyArray.push(cleanedAnswer)
                    generatedImageArray.forEach((imageBase64) => {
                        replyArray.push({ ...segment.image(`base64://${imageBase64.replace(/data:image\/\w+;base64,/g, "")}`), origin: true });
                    });
                    await e.reply(replyArray, quoteMessage);

                    // 如果有思考过程且开启了转发思考，单独发送转发消息
                    if (thinkingContent && forwardThinking) {
                        const forwardMsg = ['[thinking]', thinkingContent];
                        e.reply(await common.makeForwardMsg(e, forwardMsg, `思考过程`));
                    }
                }

                return true;
            }

            if (useMarkdown) {
                const img = await markdown_screenshot(e.user_id, e.self_id, e.img ? e.img.map(url => `<img src="${url}" width="256">`).join('\n') + "\n\n" + msg : msg, cleanedAnswer);
                if (img) {
                    await e.reply({ ...img, origin: true }, quoteMessage)
                } else {
                    logger.error('[sf插件] markdown图片生成失败')
                }
                if (forwardMessage) {
                    const forwardMsg = [cleanedAnswer];
                    // 如果有思考过程且开启了转发思考
                    if (thinkingContent && forwardThinking) {
                        forwardMsg.unshift('[thinking]', thinkingContent);
                    }
                    e.reply(await common.makeForwardMsg(e, forwardMsg, `${e.sender.card || e.sender.nickname || e.user_id}的对话`));
                }
            } else {
                await e.reply(cleanedAnswer, quoteMessage)
                // 如果有思考过程且开启了转发思考，单独发送转发消息
                if (thinkingContent && forwardThinking) {
                    const forwardMsg = ['[thinking]', thinkingContent];
                    e.reply(await common.makeForwardMsg(e, forwardMsg, `思考过程`));
                }
            }
        } catch (error) {
            logger.error('[sf插件] 回复消息时发生错误：', error)
            await e.reply('消息处理失败，请稍后再试')
        }
    }

    /**
     * @description: 自动提示词
     * @param {*} input
     * @param {*} use_sf_key
     * @param {*} config_date
     * @param {*} forChat 聊天调用
     * @param {*} apiBaseUrl 使用的API地址
     * @param {*} model 使用的API模型
     * @param {*} opt 可选参数
     * @return {Object} 返回 {content, imageBase64Array}
     */
    async generatePrompt(input, use_sf_key, config_date, forChat = false, apiBaseUrl = "", model = "", opt = {}, historyMessages = [], e) {
        // 获取重试次数配置
        const mustReturnImgRetriesTimes = opt.mustReturnImgRetriesTimes || 0;
        const errorRetryTimes = opt.errorRetryTimes || 10; // 错误重试次数，默认10次
        const needRetryForImage = mustReturnImgRetriesTimes > 0;

        // 执行主要逻辑
        const executeRequest = async () => {
            return await this._generatePromptInternal(input, use_sf_key, config_date, forChat, apiBaseUrl, model, opt, historyMessages, e);
        };

        // 错误重试逻辑
        let lastResult = null;
        for (let errorAttempt = 0; errorAttempt <= errorRetryTimes; errorAttempt++) {
            if (errorAttempt > 0) {
                logger.info(`[sf插件][generatePrompt] 第 ${errorAttempt} 次错误重试`);
                // 等待一段时间再重试，避免频繁请求
                await new Promise(resolve => setTimeout(resolve, 1000 * errorAttempt));
            }

            // 如果需要重试检查图片
            if (needRetryForImage) {
                for (let attempt = 0; attempt <= mustReturnImgRetriesTimes; attempt++) {
                    if (attempt > 0) {
                        logger.info(`[sf插件][generatePrompt] 第 ${attempt} 次重试，原因：未返回图片`);
                    }

                    lastResult = await executeRequest();

                    // 如果返回错误，跳出图片重试循环，进入错误重试
                    if (lastResult.isError) {
                        logger.warn(`[sf插件][generatePrompt] 检测到错误返回: ${lastResult.content}`);
                        break;
                    }

                    // 如果返回了图片，直接返回结果
                    if (lastResult.imageBase64Array && lastResult.imageBase64Array.length > 0) {
                        if (attempt > 0) {
                            logger.info(`[sf插件][generatePrompt] 重试成功，第 ${attempt} 次重试返回了图片`);
                        }
                        return lastResult;
                    }

                    // 如果还有重试次数，继续；否则返回最后的结果
                    if (attempt < mustReturnImgRetriesTimes) {
                        logger.debug(`[sf插件][generatePrompt] 未返回图片，准备重试 (${attempt + 1}/${mustReturnImgRetriesTimes})`);
                    }
                }

                // 如果不是错误，直接返回结果（可能是未返回图片的正常结果）
                if (!lastResult.isError) {
                    if (mustReturnImgRetriesTimes > 0) {
                        logger.warn(`[sf插件][generatePrompt] 重试 ${mustReturnImgRetriesTimes} 次后仍未返回图片`);
                    }
                    return lastResult;
                }
            } else {
                // 不需要检查图片，直接执行
                lastResult = await executeRequest();

                // 如果没有错误，直接返回
                if (!lastResult.isError) {
                    return lastResult;
                }

                logger.warn(`[sf插件][generatePrompt] 检测到错误返回: ${lastResult.content}`);
            }

            // 如果还有错误重试次数，继续重试
            if (errorAttempt < errorRetryTimes) {
                logger.debug(`[sf插件][generatePrompt] 准备进行错误重试 (${errorAttempt + 1}/${errorRetryTimes})`);
            }
        }

        // 所有重试都失败了
        logger.error(`[sf插件][generatePrompt] 错误重试 ${errorRetryTimes} 次后仍然失败`);
        return lastResult;
    }

    /**
     * @description: 自动提示词内部实现
     * @param {*} input
     * @param {*} use_sf_key
     * @param {*} config_date
     * @param {*} forChat 聊天调用
     * @param {*} apiBaseUrl 使用的API地址
     * @param {*} model 使用的API模型
     * @param {*} opt 可选参数
     * @return {Object} 返回 {content, imageBase64Array}
     */
    async _generatePromptInternal(input, use_sf_key, config_date, forChat = false, apiBaseUrl = "", model = "", opt = {}, historyMessages = [], e) {
        // 获取用户名并替换prompt中的变量
        const userName = e?.sender?.card || e?.sender?.nickname || "用户";
        logger.debug(`[sf插件] 生成提示词 - 用户名: ${userName}`);

        const systemPrompt = (!forChat ? config_date.sf_textToPaint_Prompt : opt.systemPrompt)
            .replace(/{{user_name}}/g, userName);
        //logger.mark(`[sf插件] 生成提示词 - 系统提示词: ${systemPrompt}`);

        // 构造请求体
        const requestBody = {
            model: model || config_date.translateModel,
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                }
            ],
            stream: false
        };
        logger.debug(`[sf插件] 生成提示词 - 使用模型: ${requestBody.model}`);

        // 添加历史对话
        if (historyMessages && historyMessages.length > 0) {
            historyMessages.forEach(msg => {
                if (msg.role === 'user') {
                    requestBody.messages.push({
                        role: 'user',
                        content: msg.content
                    });
                } else if (msg.role === 'assistant') {
                    requestBody.messages.push({
                        role: 'assistant',
                        content: msg.content
                    });
                }
            });
        }

        // 构造当前消息
        try {
            if (opt.currentImages?.length > 0 || opt.historyImages?.length > 0) {
                // 有图片时使用数组格式
                let allContent = [];

                // 添加当前引用的图片
                if (opt.currentImages && opt.currentImages.length > 0) {
                    allContent.push({
                        type: "text",
                        text: "当前引用的图片:\n" + input
                    });
                    opt.currentImages.forEach(image => {
                        allContent.push({
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${image}`
                            }
                        });
                    });
                }

                // 添加历史图片
                if (opt.historyImages && opt.historyImages.length > 0) {
                    allContent.push({
                        type: "text",
                        text: "\n历史对话中的图片:"
                    });
                    opt.historyImages.forEach(image => {
                        allContent.push({
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${image}`
                            }
                        });
                    });
                }

                // 带图片的消息格式
                requestBody.messages.push({
                    role: "user",
                    content: allContent
                });
            } else {
                // 纯文本消息使用简单格式
                requestBody.messages.push({
                    role: "user",
                    content: input
                });
            }
        } catch (error) {
            logger.error("[sf插件]消息处理失败\n", error);
            // 如果处理失败，至少保留用户输入
            requestBody.messages.push({
                role: "user",
                content: input
            });
        }

        logger.debug("[sf插件]API调用LLM msg：\n" + input + "\nrequestBody:\n" + JSON.stringify(requestBody))
        try {
            // 处理API URL，移除末尾斜杠并确保正确路径
            let apiUrl = apiBaseUrl || config_date.sfBaseUrl;

            // 移除末尾的斜杠
            if (apiUrl.endsWith('/')) {
                apiUrl = apiUrl.slice(0, -1);
            }

            // 如果不包含 /chat/completions 就添加
            if (!apiUrl.match(/\/chat\/completions$/)) {
                apiUrl = `${apiUrl}/chat/completions`;
            }

            // 构造请求头，为OpenRouter等API添加必要的头部
            const headers = {
                'Authorization': `Bearer ${use_sf_key}`,
                'Content-Type': 'application/json'
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            })

            const data = await response.json()
            // logger.mark(`[sf插件]API返回 data：\n` + JSON.stringify(data, createTruncatingReplacer(), 2));

            if (data?.choices?.[0]?.message?.content) {
                // 检查是否有生成的图片
                const images = data?.choices?.[0]?.message?.images;
                let imageBase64Array = null;

                if (images && images.length > 0) {
                    imageBase64Array = [];
                    images.forEach((img, index) => {
                        if (img?.image_url?.url) {
                            imageBase64Array.push(img.image_url.url);
                        }
                    });

                    if (imageBase64Array.length > 0) {
                        logger.info(`[sf插件] 检测到API返回的 ${imageBase64Array.length} 张生成图片`);
                    } else {
                        imageBase64Array = null;
                    }
                }

                return {
                    content: data.choices[0].message.content,
                    imageBase64Array: imageBase64Array,
                    isError: false
                };
            } else {
                logger.error("[sf插件]LLM调用错误：\n", JSON.stringify(data, null, 2))
                const errorMessage = !forChat ? input : data.error?.message || data.message || "[sf插件]LLM调用错误，详情请查阅控制台。";
                return {
                    content: errorMessage,
                    imageBase64Array: null,
                    isError: true
                };
            }
        } catch (error) {
            logger.error("[sf插件]LLM调用失败\n", error)
            const errorMessage = !forChat ? ("[sf插件]LLM调用失败:\n" + input) : ("[sf插件]LLM调用失败:\n" + error.message);
            return {
                content: errorMessage,
                imageBase64Array: null,
                isError: true
            };
        }
    }

    async sf_help(e) {
        const helpMessage = [`SF插件设置帮助：
1. 设置画图API Key：#sf设置画图key [值]
2. 设置翻译模型：#sf设置翻译模型 [模型名]
3. 开关提示词生成：#sf设置生成提示词 开/关
4. 设置推理步数：#sf设置推理步数 [值]
5. 设置ss图片模式：#sf设置ss图片模式 开/关
6. 设置Gemini Key：#sf设置ggkey [值]
7. 设置Gemini URL：#sf设置ggbaseurl [值]
8. 设置gg图片模式：#sf设置gg图片模式 开/关
9. 设置上下文功能：#sf设置上下文 开/关
10. 设置ss/gg转发消息：#sf设置[ss|gg]转发消息 开/关
11. 设置ss/gg必需图片：#sf设置[ss|gg]必需图片 [num]
12. 设置ss/gg必需图片：#sf设置[ss|gg]群聊聊天记录条数 [num]
13. 设置gg搜索功能：#sf设置gg搜索 开/关
14. 设置ss引用原消息：#sf设置ss引用原消息 开/关
15. 设置gg引用原消息：#sf设置gg引用原消息 开/关
16. 设置WebSocket服务：#sf设置ws服务 开/关
17. 设置思考过程转发：#sf设置ss转发思考 开/关
18. 查看帮助：#sf帮助`,

            `对话指令：
1. #gg [内容]：使用Gemini对话
2. #ss [内容]：使用SF对话
3. #s[数字/命令] [内容]：临时使用指定的ss接口对话，如#s1 #s2 #stest，使用#s0表示使用默认配置
4. #g[数字/命令] [内容]：临时使用指定的gg接口对话，如#g1 #g2 #gtest，使用#g0表示使用默认配置
5. #s[数字/命令]结束对话：结束指定ss接口的对话，如#s1结束对话 #stest结束对话
6. #g[数字/命令]结束对话：结束指定gg接口的对话，如#g1结束对话 #gtest结束对话
7. #s[数字/命令]结束对话[QQ号]：结束指定用户的指定ss接口对话（仅限主人）
8. #g[数字/命令]结束对话[QQ号]：结束指定用户的指定gg接口对话（仅限主人）
9. #sf结束对话：结束当前用户的默认配置对话
10. #sf结束ss对话：结束当前用户的SS系统对话
11. #sf结束gg对话：结束当前用户的GG系统对话
12. #sf结束dd对话：结束当前用户的DD系统对话（绘图历史）
13. #sf结束全部对话：结束所有用户的对话（仅限主人）
14. #sf删除前n条对话：删除默认配置的最近n条对话
15. #sf删除ss前n条对话：删除SS系统的最近n条对话
16. #sf删除gg前n条对话：删除GG系统的最近n条对话`,

            `接口管理：
1. #sfss接口列表：查看ss接口列表
2. #sfgg接口列表：查看gg接口列表
3. #sfss使用接口[数字]：切换ss接口
4. #sfgg使用接口[数字]：切换gg接口
注：使用0表示使用默认配置`,

            `接口列表命令说明：
1. 基本格式：
   - #sfss接口列表：查看所有ss接口
   - #sfgg接口列表：查看所有gg接口
2. 筛选功能：
   - #sfs[关键词]接口列表：筛选ss接口(匹配自定义命令或备注)
   - #sfg[关键词]接口列表：筛选gg接口(匹配自定义命令或备注)
3. 显示信息：
   - 接口编号和备注
   - 自定义命令(如果有)
   - 是否为主人专属
   - 是否为当前使用的接口
4. 权限说明：
   - 主人可以看到所有接口
   - 普通用户只能看到非主人专属接口`,

            `画图指令：
1. #sf画图 [描述]：生成图片
2. #flux画图 [描述]：生成图片
3. 支持图生图功能，引用图片即可`,

            `其他说明：
1. 支持图片识别和多轮对话
2. 支持URL内容提取和处理
3. 支持markdown格式回复
4. 支持搜索引擎集成（仅限GG）
5. 支持多API接口切换
6. 支持WebSocket服务（可选）
7. 支持绘图历史记录（DD模式）
`]

        await e.reply(await common.makeForwardMsg(e, helpMessage, e.msg))
    }

    async sf_send_pic(e, finalPrompt, use_sf_key, config_date, param, canImg2Img, souce_image_base64, userPrompt) {
        try {
            const response = await fetch(`${config_date.sfBaseUrl}/image/generations`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${use_sf_key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    "prompt": finalPrompt,
                    "model": param.parameters.imageModel,
                    "num_inference_steps": param.parameters.steps,
                    "image_size": `${param.parameters.width}x${param.parameters.height}`,
                    "image": canImg2Img ? "data:image/png;base64," + souce_image_base64 : undefined,
                    "seed": param.parameters.seed,
                    "negative_prompt": param.parameters.negative_prompt
                })
            })

            const data = await response.json()
            // logger.mark(`[sf插件]API返回 data：\n` + JSON.stringify(data, createTruncatingReplacer(), 2));

            if (data?.images?.[0]?.url) {
                const imageUrl = data.images[0].url

                const str_1 = `@${e.sender.card || e.sender.nickname} ${e.user_id}您的${canImg2Img ? "图生图" : "文生图"}已完成：`
                const str_2 = `原始提示词：${userPrompt}
最终提示词：${finalPrompt}
负面提示词：${param.parameters.negative_prompt ? param.parameters.negative_prompt : "sf默认"}
绘图模型：${param.parameters.imageModel}
步数：${param.parameters.steps}
图片大小：${param.parameters.width}x${param.parameters.height}
生成时间：${data.timings.inference.toFixed(2)}秒
种子：${data.seed}
${e.sfRuntime.isgeneratePrompt === undefined ? "Tags中可用：--自动提示词[开|关]" : ""}`
                const str_3 = `图片URL：${imageUrl}`

                // 发送图片
                if (e.ws) {
                    // WebSocket连接，直接发送图片URL
                    const msgx = [str_1, str_2, str_3].join('\n\n');
                    this.sendMessage(e.ws, 'sf', {
                        type: 'image',
                        file: imageUrl,
                        text: msgx
                    },
                        config_date);

                    // 保存绘画记录到Redis
                    const userQQ = e.user_id || 'web_user';
                    const historyKey = `CHATBOT:HISTORY:${userQQ}:dd`;
                    const messages = [
                        {
                            role: 'user',
                            content: userPrompt || finalPrompt
                        },
                        {
                            role: 'assistant',
                            content: `![生成的图片](${imageUrl})\n\n${msgx}`
                        }
                    ];
                    redis.lPush(historyKey, JSON.stringify(messages));
                    // 限制历史记录长度为50条对话(100条消息)
                    redis.lTrim(historyKey, 0, 99);
                } else {
                    // 普通聊天，使用原有的转发消息方式
                    if (config_date.simpleMode) {
                        const msgx = await common.makeForwardMsg(e, [str_1, { ...segment.image(imageUrl), origin: true }, str_2, str_3], `${e.sender.card || e.sender.nickname} 的${canImg2Img ? "图生图" : "文生图"}`)
                        e.reply(msgx)
                    } else {
                        const msgx = await common.makeForwardMsg(e, [str_1, str_2, str_3], `${e.sender.card || e.sender.nickname} 的${canImg2Img ? "图生图" : "文生图"}`)
                        e.reply(msgx)
                        e.reply({ ...segment.image(imageUrl), origin: true })
                    }
                }

                return true;
            } else {
                logger.error("[sf插件]返回错误：\n", JSON.stringify(data, null, 2))
                if (e.ws) {
                    this.sendError(e.ws, `生成图片失败：${data.message || '未知错误'}`);
                } else {
                    e.reply(`生成图片失败：${data.message || '未知错误'}`);
                }
                return false;
            }
        } catch (error) {
            logger.error("[sf插件]API调用失败\n", error)
            if (e.ws) {
                this.sendError(e.ws, '生成图片时遇到了一个错误，请稍后再试。');
            } else {
                e.reply('生成图片时遇到了一个错误，请稍后再试。');
            }
            return false;
        }
    }

    async gg_chat(e, config_date = undefined) {
        // 读取配置
        if (!config_date)
            config_date = Config.getConfig()

        // 如果消息包含"自动回复"，则不处理
        if (!e.isGroup && e.msg && e.msg.includes("自动回复")) {
            logger.info("消息包含自动回复，不触发AI对话")
            return false
        }

        // 判断用户身份
        const isMaster = e.isMaster

        // 获取接口配置
        let ggBaseUrl = "", ggKey = "", model = "", systemPrompt = "", useMarkdown = false, forwardMessage = true, quoteMessage = true, useSearch = true, enableImageGeneration = false, mustNeedImgLength = 0, mustReturnImgRetriesTimes = 0, paintModel = false, useVertexAI = false
        let cdtime = 0, dailyLimit = 0, unlimitedUsers = [], onlyGroupID = [], memberConfigName = 'gg_default', groupContextLength = 0

        // 根据用户身份选择使用的接口索引
        const usingApiIndex = (isMaster || e.sf_is_from_first_person_call) ? config_date.gg_usingAPI : e.sf_llm_user_API || await findIndexByRemark(e, "gg", config_date)

        // 处理群聊多人对话
        let contextKey = e.user_id;
        if (e.isGroup && config_date.groupMultiChat) {
            contextKey = `group_${e.group_id}`;
        }

        if (usingApiIndex > 0 && config_date.gg_APIList && config_date.gg_APIList[usingApiIndex - 1]) {
            // 使用接口列表中的配置
            const apiConfig = config_date.gg_APIList[usingApiIndex - 1]

            // 检查接口是否仅限主人使用
            if (!isMaster && apiConfig.isOnlyMaster) {
                // await e.reply('该接口仅限主人使用')
                logger.info("[sf对话]该接口仅限主人使用");
                return false
            }
            // 只有当APIList中的字段有值时才使用该值
            ggBaseUrl = apiConfig.apiBaseUrl || config_date.ggBaseUrl || "https://sfgemini.vledx.ggff.net" || "https://gemini.maliy.top"
            ggKey = this.get_random_key(apiConfig.apiKey) || this.get_random_key(config_date.ggKey) || "sf-plugin" || this.get_random_key(this.ggKeyFreeDecode(config_date.ggKey_free_250825))
            model = apiConfig.model || config_date.gg_model || "gemini-2.0-flash-exp"
            systemPrompt = apiConfig.prompt || config_date.gg_Prompt || "你是一个有用的助手，你更喜欢说中文。你会根据用户的问题，通过搜索引擎获取最新的信息来回答问题。你的回答会尽可能准确、客观。"
            useMarkdown = (typeof apiConfig.useMarkdown !== 'undefined') ? apiConfig.useMarkdown : false
            forwardMessage = (typeof apiConfig.forwardMessage !== 'undefined') ? apiConfig.forwardMessage : false
            mustNeedImgLength = (typeof apiConfig.mustNeedImgLength !== 'undefined') ? apiConfig.mustNeedImgLength : 0
            mustReturnImgRetriesTimes = (typeof apiConfig.mustReturnImgRetriesTimes !== 'undefined') ? apiConfig.mustReturnImgRetriesTimes : 0
            paintModel = (typeof apiConfig.paintModel !== 'undefined') ? apiConfig.paintModel : false
            groupContextLength = (typeof apiConfig.groupContextLength !== 'undefined') ? apiConfig.groupContextLength : 0
            quoteMessage = (typeof apiConfig.quoteMessage !== 'undefined') ? apiConfig.quoteMessage : false
            useSearch = (typeof apiConfig.useSearch !== 'undefined') ? apiConfig.useSearch : false
            enableImageGeneration = (typeof apiConfig.enableImageGeneration !== 'undefined') ? apiConfig.enableImageGeneration : false
            memberConfigName = (typeof apiConfig.customCommand !== 'undefined' && apiConfig.customCommand) ? `gg_${apiConfig.customCommand}` : memberConfigName
            cdtime = (typeof apiConfig.cdtime !== 'undefined') ? apiConfig.cdtime : cdtime
            dailyLimit = (typeof apiConfig.dailyLimit !== 'undefined') ? apiConfig.dailyLimit : dailyLimit
            unlimitedUsers = (typeof apiConfig.unlimitedUsers !== 'undefined') ? apiConfig.unlimitedUsers : unlimitedUsers
            onlyGroupID = (typeof apiConfig.onlyGroupID !== 'undefined') ? apiConfig.onlyGroupID : onlyGroupID
            useVertexAI = (typeof apiConfig.useVertexAI !== 'undefined') ? apiConfig.useVertexAI : useVertexAI
        } else {
            // 检查默认配置是否仅限主人使用
            if (!isMaster && config_date.gg_isOnlyMaster) {
                // await e.reply('默认配置仅限主人使用')
                logger.info("[sf对话]已开启仅限主人使用默认配置");
                return false
            }
            // 使用默认配置
            ggBaseUrl = config_date.ggBaseUrl || "https://sfgemini.vledx.ggff.net" || "https://gemini.maliy.top"
            ggKey = this.get_random_key(config_date.ggKey) || "sf-plugin" || this.get_random_key(this.ggKeyFreeDecode(config_date.ggKey_free_250825))
            model = config_date.gg_model || "gemini-2.0-flash-exp"
            systemPrompt = config_date.gg_Prompt || "你是一个有用的助手，你更喜欢说中文。你会根据用户的问题，通过搜索引擎获取最新的信息来回答问题。你的回答会尽可能准确、客观。"
            useMarkdown = config_date.gg_useMarkdown
            forwardMessage = config_date.gg_forwardMessage
            mustNeedImgLength = config_date.gg_mustNeedImgLength
            mustReturnImgRetriesTimes = config_date.gg_mustReturnImgRetriesTimes
            groupContextLength = config_date.gg_groupContextLength
            quoteMessage = config_date.gg_quoteMessage
            useSearch = config_date.gg_useSearch
            enableImageGeneration = config_date.gg_enableImageGeneration
            useVertexAI = config_date.useVertexAI
        }

        // CD次数限制
        const memberConfig = {
            feature: memberConfigName,
            cdTime: cdtime,
            dailyLimit: dailyLimit,
            unlimitedUsers: unlimitedUsers,
            onlyGroupID: onlyGroupID,
        }
        const result_member = await memberControlProcess(e, memberConfig);
        if (!result_member.allowed) {
            if (result_member.message)
                e.reply(result_member.message, true, { recallMsg: 60 });
            return false;
        }

        // 处理引用消息,获取图片和文本
        await parseSourceImg(e)
        if (mustNeedImgLength) {
            await getImgFrom_awaitContext(e, mustNeedImgLength, memberConfigName, this)
            if (e.img.length < mustNeedImgLength)
                return true;
        }
        let currentImages = [];
        if (e.img && e.img.length > 0) {
            // 记录获取到的图片链接
            logger.info(`[SF插件][gg]获取到图片链接:\n${e.img.join('\n')}`)
            // 获取所有图片数据
            for (const imgUrl of e.img) {
                try {
                    // 如果已经是base64格式，直接使用
                    if (typeof imgUrl === 'string' && (imgUrl.startsWith('data:image') || imgUrl.match(/^[A-Za-z0-9+/=]+$/))) {
                        // 如果是完整的data URL，提取base64部分
                        const base64Data = imgUrl.startsWith('data:image') ? imgUrl.split(',')[1] : imgUrl;
                        currentImages.push(base64Data);
                        continue;
                    }

                    // 尝试转换为base64
                    const base64Image = await url2Base64(imgUrl);
                    if (!base64Image) {
                        logger.error(`[SF插件][gg]图片获取失败: ${imgUrl}`);
                        continue;
                    }
                    currentImages.push(base64Image);
                } catch (error) {
                    logger.error(`[SF插件][gg]获取图片时出错: ${error.message}`);
                    continue;
                }
            }

            // 如果所有图片都处理失败
            if (currentImages.length === 0 && e.img.length > 0) {
                e.reply('获取图片失败，请重新发送', true);
                return false;
            }
        }

        result_member.record();

        let msg = e.msg.replace(/^#(gg|GG)/, '').trim()
        /** 发送给AI的信息 */
        let toAiMessage = msg;

        // 处理预设
        if (paintModel) {
            const presetResult = applyPresets(toAiMessage, Config.getConfig("presets"))
            toAiMessage = presetResult.processedText + "\n你将总是按照要求返回图片"
            msg = presetResult.originalText
            e.reply(`人家开始生成啦，请等待1-10分钟`, true);
        }

        // 如果有引用的文本,添加两个换行来分隔
        const quotedText = e.sourceMsg ? e.sourceMsg + '\n\n' : ''
        msg = quotedText + msg

        // 处理消息中的URL
        // logger.mark(`[SF插件][URL处理]开始处理消息中的URL: ${msg}`)
        let extractedContent = '';
        try {
            // 根据是否为图片模式决定是否在消息中显示提取的内容
            const { message: processedMsg, extractedContent: extracted } = await processMessageWithUrls(msg, false);
            msg = processedMsg;
            extractedContent = extracted;

            if (extractedContent) {
                logger.debug(`[SF插件][URL处理]URL处理成功`)
            } else {
                logger.debug(`[SF插件][URL处理]消息中未发现需要处理的URL`)
            }
        } catch (error) {
            logger.error(`[SF插件][URL处理]处理URL时发生错误，将使用原始消息继续处理: ${error.message}`)
        }
        // 发送给AI的信息（加上 url 提取的内容）
        toAiMessage += extractedContent;

        // 保存用户消息到历史记录
        if (config_date.gg_ss_useContext && !paintModel) {
            const senderValue = e.sender ? `${e.sender.card || e.sender.nickname}(${e.user_id})` : undefined;

            // 保存用户消息
            await saveContext(contextKey, {
                role: 'user',
                content: toAiMessage,
                // extractedContent: extractedContent, // 实际内容早就加在 toAiMessage 中了
                // imageBase64: currentImages.length > 0 ? currentImages : undefined, // 不需要每次都让 AI 读取历史聊条的图片
                sender: senderValue
            }, (isMaster || e.sf_is_from_first_person_call) ? config_date.gg_usingAPI : e.sf_llm_user_API || await findIndexByRemark(e, "gg", config_date), 'gg')
        }

        // 获取历史对话
        let historyMessages = []
        if (config_date.gg_ss_useContext && !paintModel) {
            historyMessages = await loadContext(contextKey, (isMaster || e.sf_is_from_first_person_call) ? config_date.gg_usingAPI : e.sf_llm_user_API || await findIndexByRemark(e, "gg", config_date), 'gg')
            logger.debug(`[SF插件][gg]加载历史对话: ${historyMessages.length} 条`)
        }

        // 收集历史图片
        let historyImages = [];
        // 从历史消息中收集图片
        historyMessages.forEach(msg => {
            if (msg.imageBase64) {
                historyImages = historyImages.concat(msg.imageBase64);
            }
        });

        // 允许机器人读取近期的最多群聊聊天记录条数
        if (e.isGroup && groupContextLength > 0) {
            let chatHistory = []
            try {
                chatHistory = await getChatHistory_w(e.group ?? (e.bot.pickGroup ? e.bot.pickGroup(e.group_id) : (e.bot[e.group_id] ? e.bot[e.group_id].pickGroup(e.group_id) : null)), groupContextLength)
                logger.debug(`[群自动打招呼] 群 ${e.group_id} 获取到 ${chatHistory.length} 条聊天记录`)
            } catch (error) {
                logger.error(`[群自动打招呼] 获取群 ${e.group_id} 聊天记录失败: ${error}`)
            }
            // 构造打招呼的prompt
            const prompt = 'There is the conversation history in the group, you must chat according to the conversation history context"'
            systemPrompt += "\n\n" + buildChatHistoryPrompt(chatHistory, prompt, e.self_id)
        }

        const opt = {
            currentImages: currentImages.length > 0 ? currentImages : undefined,
            historyImages: historyImages.length > 0 ? historyImages : undefined,
            systemPrompt,
            model,
            useSearch,
            enableImageGeneration,
            mustReturnImgRetriesTimes,
            useVertexAI,
        }

        logger.info(`[sf prompt]${toAiMessage}`)
        let { answer, sources, imageBase64, textImagePairs, isError } = await this.generateGeminiPrompt(toAiMessage, ggBaseUrl, ggKey, config_date, opt, historyMessages, e)

        // 如果是错误返回，不保存聊天记录，直接回复错误信息
        if (isError) {
            await e.reply(hidePrivacyInfo(answer), quoteMessage);
            return;
        }

        // 移除 CQ
        answer = removeCQCode(answer);

        // 保存AI回复
        if (config_date.gg_ss_useContext && !paintModel) {
            await saveContext(contextKey, {
                role: 'assistant',
                content: answer,
                sources: sources,
                imageBase64: undefined
            }, (isMaster || e.sf_is_from_first_person_call) ? config_date.gg_usingAPI : e.sf_llm_user_API || await findIndexByRemark(e, "gg", config_date), 'gg')
        }

        // 发送消息
        try {
            if (imageBase64 && imageBase64.length > 0) {
                if (useMarkdown) {
                    let imgMarkdown = "";

                    // 如果有配对信息，使用配对信息来组织内容
                    if (textImagePairs && textImagePairs.length > 0) {
                        textImagePairs.forEach((pair, index) => {
                            if (pair.text) {
                                imgMarkdown += `${pair.text}\n\n`;
                            }
                            imgMarkdown += `![${pair.text || `图片${index + 1}`}](${pair.image})\n\n`;
                        });
                    } else {
                        // 没有配对信息时使用原来的方式
                        imgMarkdown = answer + '\n\n';
                        imageBase64.forEach((img, index) => {
                            imgMarkdown += `![生成的图片${index + 1}](${img})\n\n`;
                        });
                    }

                    // 生成markdown图片
                    const img = await markdown_screenshot(e.user_id, e.self_id, e.img ? e.img.map(url => `<img src="${url}" width="256">`).join('\n') + "\n\n" + msg : msg, imgMarkdown);
                    if (img) {
                        await e.reply({ ...img, origin: true }, quoteMessage);
                    } else {
                        logger.error('[sf插件] markdown图片生成失败，使用普通方式发送');
                        // 如果markdown生成失败，使用配对方式发送
                        await this.sendPairedReply(e, textImagePairs, imageBase64, answer, quoteMessage);
                    }

                    // 构建转发消息，包含回答和来源
                    if (forwardMessage) {
                        const forwardMsg = [];
                        if (textImagePairs && textImagePairs.length > 0) {
                            textImagePairs.forEach((pair) => {
                                if (pair.text) {
                                    forwardMsg.push(pair.text);
                                }
                                forwardMsg.push({ ...segment.image(`base64://${pair.image.replace(/data:image\/\w+;base64,/g, "")}`), origin: true });
                            });
                        } else {
                            imageBase64.forEach((imgData) => {
                                forwardMsg.push({ ...segment.image(`base64://${imgData.replace(/data:image\/\w+;base64,/g, "")}`), origin: true });
                            });
                            forwardMsg.push(answer);
                        }

                        if (sources && sources.length > 0) {
                            forwardMsg.push('信息来源：');
                            sources.forEach((source, index) => {
                                forwardMsg.push(`${index + 1}. ${source.title}\n${source.url}`);
                            });
                        }
                        e.reply(await common.makeForwardMsg(e, forwardMsg, `回复${e.sender.card || e.sender.nickname || e.user_id}`));
                    }
                } else {
                    if (paintModel) {
                        const replyArray = [];
                        imageBase64.forEach((imageBase64) => {
                            replyArray.push({ ...segment.image(`base64://${imageBase64.replace(/data:image\/\w+;base64,/g, "")}`), origin: true });
                        });
                        await e.reply(replyArray, quoteMessage);
                    }
                    // 非markdown模式，使用配对方式发送
                    else {
                        await this.sendPairedReply(e, textImagePairs, imageBase64, answer, quoteMessage);
                    }
                }

                return true;
            }

            if (useMarkdown) {
                // 如果开启了markdown，生成图片并将回答放入转发消息
                const img = await markdown_screenshot(e.user_id, e.self_id, e.img ? e.img.map(url => `<img src="${url}" width="256">`).join('\n') + "\n\n" + msg : msg, answer);
                if (img) {
                    await e.reply({ ...img, origin: true }, quoteMessage)
                } else {
                    logger.error('[sf插件] markdown图片生成失败')
                }

                // 构建转发消息，包含回答和来源
                if (forwardMessage) {
                    const forwardMsg = [answer];
                    if (sources && sources.length > 0) {
                        forwardMsg.push('信息来源：');
                        sources.forEach((source, index) => {
                            forwardMsg.push(`${index + 1}. ${source.title}\n${source.url}`);
                        });
                    }
                    e.reply(await common.makeForwardMsg(e, forwardMsg, `回复${e.sender.card || e.sender.nickname || e.user_id}`));
                }
            } else {
                // 如果没开启markdown，直接回复答案
                await e.reply(answer, quoteMessage)

                // 如果有来源，单独发送转发消息显示来源
                if (sources && sources.length > 0 && forwardMessage) {
                    const sourceMsg = ['信息来源：'];
                    sources.forEach((source, index) => {
                        sourceMsg.push(`${index + 1}. ${source.title}\n${source.url}`);
                    });
                    e.reply(await common.makeForwardMsg(e, sourceMsg, `${e.sender.card || e.sender.nickname || e.user_id}的搜索来源`));
                }
            }
        } catch (error) {
            logger.error('[sf插件] 回复消息时发生错误：', error)
            await e.reply('消息处理失败，请稍后再试')
        }
    }

    /**
     * @description: 发送文本图片配对的回复
     * @param {*} e 
     * @param {*} textImagePairs 文本图片配对数组
     * @param {*} imageBase64 图片数组（备用）
     * @param {*} answer 完整文本（备用）
     * @param {*} quoteMessage 是否引用消息
     */
    async sendPairedReply(e, textImagePairs, imageBase64, answer, quoteMessage) {
        try {
            if (textImagePairs && textImagePairs.length > 0) {
                // 使用配对信息发送
                for (const pair of textImagePairs) {
                    const replyArray = [];
                    if (pair.text) {
                        replyArray.push(pair.text);
                    }
                    replyArray.push({ ...segment.image(`base64://${pair.image.replace(/data:image\/\w+;base64,/g, "")}`), origin: true });
                    await e.reply(replyArray, quoteMessage);
                }
            } else {
                // 没有配对信息时使用原来的方式
                const replyArray = [answer];
                imageBase64.forEach((imgData) => {
                    replyArray.push({ ...segment.image(`base64://${imgData.replace(/data:image\/\w+;base64,/g, "")}`), origin: true });
                });
                await e.reply(replyArray, quoteMessage);
            }
        } catch (error) {
            logger.error('[sf插件] 发送配对回复时发生错误：', error);
            // 如果配对发送失败，使用普通方式
            const replyArray = [answer];
            imageBase64.forEach((imgData) => {
                replyArray.push({ ...segment.image(`base64://${imgData.replace(/data:image\/\w+;base64,/g, "")}`), origin: true });
            });
            await e.reply(replyArray, quoteMessage);
        }
    }

    /**
     * @description: Gemini API 调用
     * @param {string} input 用户输入
     * @param {string} ggBaseUrl API 基础 URL
     * @param {string} ggKey API 密钥
     * @param {Object} config_date 配置信息
     * @param {Object} opt 可选参数
     * @param {Array} historyMessages 历史对话记录
     * @return {Object} 包含答案和来源的对象
     */
    async generateGeminiPrompt(input, ggBaseUrl, ggKey, config_date, opt = {}, historyMessages = [], e) {
        // 获取重试次数配置
        const mustReturnImgRetriesTimes = opt.mustReturnImgRetriesTimes || 0;
        const errorRetryTimes = opt.errorRetryTimes || 10; // 错误重试次数，默认10次
        const needRetryForImage = mustReturnImgRetriesTimes > 0;

        // 执行主要逻辑
        const executeRequest = async () => {
            return await this._generateGeminiPromptInternal(input, ggBaseUrl, ggKey, config_date, opt, historyMessages, e);
        };

        // 错误重试逻辑
        let lastResult = null;
        for (let errorAttempt = 0; errorAttempt <= errorRetryTimes; errorAttempt++) {
            if (errorAttempt > 0) {
                logger.info(`[sf插件][generateGeminiPrompt] 第 ${errorAttempt} 次错误重试`);
                // 等待一段时间再重试，避免频繁请求
                await new Promise(resolve => setTimeout(resolve, 1000 * errorAttempt));
            }

            // 如果需要重试检查图片
            if (needRetryForImage) {
                for (let attempt = 0; attempt <= mustReturnImgRetriesTimes; attempt++) {
                    if (attempt > 0) {
                        logger.info(`[sf插件][generateGeminiPrompt] 第 ${attempt} 次重试，原因：未返回图片`);
                    }

                    lastResult = await executeRequest();

                    // 如果返回错误，跳出图片重试循环，进入错误重试
                    if (lastResult.isError) {
                        logger.warn(`[sf插件][generateGeminiPrompt] 检测到错误返回: ${lastResult.answer}`);
                        break;
                    }

                    // 如果返回了图片，直接返回结果
                    if (lastResult.imageBase64 && lastResult.imageBase64.length > 0) {
                        if (attempt > 0) {
                            logger.info(`[sf插件][generateGeminiPrompt] 重试成功，第 ${attempt} 次重试返回了图片`);
                        }
                        return lastResult;
                    }

                    // 如果还有重试次数，继续；否则返回最后的结果
                    if (attempt < mustReturnImgRetriesTimes) {
                        logger.debug(`[sf插件][generateGeminiPrompt] 未返回图片，准备重试 (${attempt + 1}/${mustReturnImgRetriesTimes})`);
                    }
                }

                // 如果不是错误，直接返回结果（可能是未返回图片的正常结果）
                if (!lastResult.isError) {
                    if (mustReturnImgRetriesTimes > 0) {
                        logger.warn(`[sf插件][generateGeminiPrompt] 重试 ${mustReturnImgRetriesTimes} 次后仍未返回图片`);
                    }
                    return lastResult;
                }
            } else {
                // 不需要检查图片，直接执行
                lastResult = await executeRequest();

                // 如果没有错误，直接返回
                if (!lastResult.isError) {
                    return lastResult;
                }

                logger.warn(`[sf插件][generateGeminiPrompt] 检测到错误返回: ${lastResult.answer}`);
            }

            // 如果还有错误重试次数，继续重试
            if (errorAttempt < errorRetryTimes) {
                logger.debug(`[sf插件][generateGeminiPrompt] 准备进行错误重试 (${errorAttempt + 1}/${errorRetryTimes})`);
            }
        }

        // 所有重试都失败了
        logger.error(`[sf插件][generateGeminiPrompt] 错误重试 ${errorRetryTimes} 次后仍然失败`);
        return lastResult;
    }

    /**
     * @description: Gemini API 调用内部实现
     * @param {string} input 用户输入
     * @param {string} ggBaseUrl API 基础 URL
     * @param {string} ggKey API 密钥
     * @param {Object} config_date 配置信息
     * @param {Object} opt 可选参数
     * @param {Array} historyMessages 历史对话记录
     * @return {Object} 包含答案和来源的对象
     */
    async _generateGeminiPromptInternal(input, ggBaseUrl, ggKey, config_date, opt = {}, historyMessages = [], e) {
        logger.debug("[sf插件]API调用Gemini msg：\n" + input)

        // 获取用户名并替换prompt中的变量
        const userName = e?.sender?.card || e?.sender?.nickname || "用户";
        const systemPrompt = opt.systemPrompt.replace(/{{user_name}}/g, userName);

        // // 安全设置常量定义
        // const SAFETY_SETTINGS_STRICT = [
        //     { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        //     { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        //     { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        //     { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        //     { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" }
        // ];

        // const SAFETY_SETTINGS_LOOSE = [
        //     { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
        //     { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
        //     { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
        //     { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" },
        //     { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "OFF" }
        // ];

        // // 定义模型到安全设置的映射
        // const MODEL_SAFETY_SETTINGS = {
        //     // 最宽松安全设置的模型
        //     LOOSE_SAFETY_MODELS: new Set([
        //         'gemini-1.5-flash-8b-latest', 'gemini-1.5-flash', 'gemini-1.5-flash-8b-001',
        //         'gemini-1.5-flash-002', 'gemini-2.0-flash-001', 'gemini-2.0-flash',
        //         'gemini-1.5-pro', 'gemini-1.5-flash-8b', 'gemini-1.5-pro-002',
        //         'gemini-1.5-flash-latest', 'gemini-1.5-pro-latest', 'gemini-2.0-flash-exp',
        //         'gemini-2.0-flash-lite-preview-02-05', 'gemini-2.0-pro-exp-02-05',
        //         'gemini-2.0-pro-exp', 'gemini-2.0-flash-thinking-exp',
        //         'gemini-2.0-flash-thinking-exp-01-21', 'gemini-exp-1206',
        //         'gemini-2.0-flash-lite-preview', 'gemini-2.0-flash-thinking-exp-1219',
        //     ]),
        //     // 最严格安全设置的模型
        //     STRICT_SAFETY_MODELS: new Set([
        //         'gemini-pro-vision', 'gemini-1.5-flash-001-tuning', 'gemini-1.5-flash-8b-exp-0924',
        //         'gemini-1.5-pro-001', 'gemini-1.0-pro', 'gemini-1.0-pro-vision-latest',
        //         'gemini-1.0-pro-latest', 'gemini-pro', 'gemini-1.5-flash-8b-exp-0827',
        //         'gemini-1.0-pro-001', 'gemini-1.5-flash-001'
        //     ])
        // };

        // // 获取安全设置
        // function getSafetySettings(modelName) {
        //     if (MODEL_SAFETY_SETTINGS.LOOSE_SAFETY_MODELS.has(modelName)) {
        //         logger.debug(`[sf插件]模型 ${modelName} 使用最宽松安全设置`);
        //         return SAFETY_SETTINGS_LOOSE;
        //     } else {
        //         logger.debug(`[sf插件]模型 ${modelName} 使用最严格安全设置`);
        //         return SAFETY_SETTINGS_STRICT;
        //     }
        // }
        /** 安全设置常量 - 通用模型（文本/多模态） */
        const SAFETY_SETTINGS_General = [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" }
        ];

        /** 安全设置常量 - 图像生成专用模型 */
        const SAFETY_SETTINGS_Image = [
            // 通用类别
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" },
            // 图像专用类别
            { category: "HARM_CATEGORY_IMAGE_HATE", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_IMAGE_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_IMAGE_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_IMAGE_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_JAILBREAK", threshold: "BLOCK_NONE" }
        ];

        /** 图像生成专用模型匹配规则 */
        const IMAGE_GENERATION_MODEL_PATTERN = /^gemini-.*-image/; // 匹配 gemini-2.5-flash-image,gemini-2.5-flash-image-preview,gemini-3.0-flash-image-preview

        // 设置安全设置
        function getSafetySettings(modelName) {
            // 判断是否为图像生成专用模型
            if (IMAGE_GENERATION_MODEL_PATTERN.test(modelName)) {
                logger.debug(`[sf插件]模型 ${modelName} 使用图像生成安全设置（包含图像专用类别）`);
                return SAFETY_SETTINGS_Image;
            } else {
                logger.debug(`[sf插件]模型 ${modelName} 使用通用安全设置`);
                return SAFETY_SETTINGS_General;
            }
        }

        // 构造请求体
        const requestBody = {
            "contents": [],
            // 只要开启了搜索功能就添加搜索工具，不再限制模型，需要模型支持才可以联网
            "tools": opt.useSearch ? [{
                "googleSearch": {}
            }] : [],
            // 添加安全设置
            "safetySettings": getSafetySettings(opt.model || "")
        };

        // 如果启用了文生图功能，添加generation_config字段
        if (opt.enableImageGeneration) {
            requestBody.generation_config = {
                "response_modalities": [
                    "TEXT",
                    "IMAGE"
                ]
            };
            logger.debug("[sf插件]启用文生图功能");
        }

        // 统一使用systemInstruction（包括文生图模式）
        requestBody.systemInstruction = {
            "parts": [{
                "text": systemPrompt
            }]
        };

        // 添加历史对话
        if (historyMessages.length > 0) {
            requestBody.contents = formatContextForGemini(historyMessages)
        }

        // 添加当前用户输入和图片
        const currentParts = [];

        // 如果使用 Vertex AI 格式
        if (opt.useVertexAI) {
            // Vertex AI 使用扁平的 contents 数组格式，可以直接混合字符串和对象
            const vertexContents = [];

            // 添加用户输入文本
            vertexContents.push(input);

            // 如果有图片，添加图片（Vertex AI 使用 inlineData，驼峰命名）
            if (opt.currentImages && opt.currentImages.length > 0) {
                opt.currentImages.forEach(image => {
                    vertexContents.push({
                        "inlineData": {
                            "mimeType": "image/jpeg",
                            "data": image
                        }
                    });
                });
            }

            // 添加历史图片（Vertex AI 格式）
            if (opt.historyImages && opt.historyImages.length > 0) {
                opt.historyImages.forEach(image => {
                    vertexContents.push({
                        "inlineData": {
                            "mimeType": "image/jpeg",
                            "data": image
                        }
                    });
                });
            }

            // Vertex AI 的 contents 是扁平数组
            requestBody.contents = vertexContents;
        } else {
            // 标准 Gemini API 格式
            // 添加用户输入文本
            currentParts.push({
                "text": input
            });

            // 如果有图片，添加图片
            if (opt.currentImages && opt.currentImages.length > 0) {
                currentParts.push({
                    "text": "\n当前引用的图片:"
                });
                opt.currentImages.forEach(image => {
                    currentParts.push({
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": image
                        }
                    });
                });
            }

            // 添加历史图片
            if (opt.historyImages && opt.historyImages.length > 0) {
                currentParts.push({
                    "text": "\n历史对话中的图片:"
                });
                opt.historyImages.forEach(image => {
                    currentParts.push({
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": image
                        }
                    });
                });
            }

            requestBody.contents.push({
                "parts": currentParts,
                "role": "user"
            });
        }

        // // TODO: nano banana 生成图片的宽高比设置，考虑到 #gg 主要用于LLM对话，宽高比应该仅在 #dd 中控制，参考： https://ai.google.dev/gemini-api/docs/image-generation?hl=zh-cn#rest_14
        // requestBody.generationConfig = {
        //     "imageConfig": {
        //         "aspectRatio": "16:9"
        //     }
        // };

        try {
            const response = await fetch(`${ggBaseUrl}/v1beta/models/${opt.model}:generateContent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': ggKey
                },
                body: JSON.stringify(requestBody)
            })

            const data = await response.json()
            // logger.mark(`[sf插件]API返回 data：\n` + JSON.stringify(data, createTruncatingReplacer(), 2));

            if (data?.candidates?.[0]?.content?.parts) {
                // 处理返回的内容
                let answer = "";
                let imageBase64Array = [];
                let textImagePairs = []; // 存储文本和图片的配对关系

                // 遍历所有parts，将文本和图片进行配对
                let currentText = "";
                for (let i = 0; i < data.candidates[0].content.parts.length; i++) {
                    const part = data.candidates[0].content.parts[i];

                    // 跳过空对象或无效的part
                    if (!part || (typeof part === 'object' && Object.keys(part).length === 0)) {
                        continue;
                    }

                    if (part.text) {
                        currentText += part.text;
                        answer += part.text;
                    } else if (part.inlineData && part.inlineData.data) {
                        // 处理图片数据
                        const imageData = "data:image/png;base64," + part.inlineData.data;
                        imageBase64Array.push(imageData);

                        // 将当前收集的文本与图片配对
                        textImagePairs.push({
                            text: currentText.trim(),
                            image: imageData,
                            index: imageBase64Array.length - 1
                        });

                        logger.debug(`[sf插件]检测到图片配对：文本"${currentText.trim()}" -> 图片${imageBase64Array.length}`);
                        currentText = ""; // 重置当前文本
                    }
                }

                if (imageBase64Array.length > 0)
                    logger.info(`[sf插件]总共检测到 ${imageBase64Array.length} 张图片，${textImagePairs.length} 个图文配对`);

                // 获取信息来源（搜索结果）
                let sources = [];
                if (data.candidates?.[0]?.groundingMetadata?.groundingChunks) {
                    sources = data.candidates[0].groundingMetadata.groundingChunks
                        .filter(chunk => chunk.web) // 只保留web类型的来源
                        .map(chunk => ({
                            title: chunk.web.title,
                            url: chunk.web.uri.replace(
                                'https://vertexaisearch.cloud.google.com/grounding-api-redirect',
                                'https://miao.news'
                            )
                        }))
                        .filter((v, i, a) => a.findIndex(t => (t.title === v.title && t.url === v.url)) === i); // 去重
                }

                if (sources.length > 0)
                    logger.debug("[sf插件]信息来源：" + JSON.stringify(sources))

                // 返回结果，包含图片数组和配对信息
                return {
                    answer,
                    sources,
                    imageBase64: imageBase64Array.length > 0 ? imageBase64Array : null,
                    textImagePairs: textImagePairs.length > 0 ? textImagePairs : null,
                    isError: false
                };
            } else {
                logger.error("[sf插件]gg调用错误：\n", JSON.stringify(data, null, 2))

                // 构造详细的错误消息
                let errorMessage = "[sf插件]";

                // 处理API返回的错误信息
                if (data.error?.message) {
                    errorMessage += data.error.message;
                } else if (data.message) {
                    errorMessage += data.message;
                } else if (data.candidates?.[0]?.finishReason) {
                    const finishReason = data.candidates[0].finishReason;
                    switch (finishReason) {
                        case "PROHIBITED_CONTENT":
                            errorMessage += "内容被禁止，可能包含违规内容，涩涩被抓到啦。\n原始错误：" + JSON.stringify(data);
                            break;
                        case "SAFETY":
                            errorMessage += "内容被安全系统拦截，请修改输入内容后重试。\n原始错误：" + JSON.stringify(data);
                            break;
                        case "RECITATION":
                            errorMessage += "内容可能涉及版权问题，请重新组织语言。\n原始错误：" + JSON.stringify(data);
                            break;
                        case "OTHER":
                            errorMessage += "请求被拦截，原因未知。\n原始错误：" + JSON.stringify(data);
                            break;
                        default:
                            errorMessage += `请求被拦截，原因：${finishReason}` + JSON.stringify(data);
                            break;
                    }
                } else if (data.promptFeedback?.blockReason) {
                    const blockReason = data.promptFeedback.blockReason;
                    switch (blockReason) {
                        case "PROHIBITED_CONTENT":
                            errorMessage += "内容被禁止，提示词包含违规内容，请修改后重试。";
                            break;
                        case "SAFETY":
                            errorMessage += "内容被安全系统拦截，请修改输入内容后重试。";
                            break;
                        case "OTHER":
                            errorMessage += "请求被拦截，可能是由于内容不合规。";
                            break;
                        default:
                            errorMessage += `请求被拦截，原因：${blockReason}`;
                            break;
                    }
                } else {
                    errorMessage += "gg调用错误，详情请查阅控制台。\n原始错误：" + JSON.stringify(data);
                }

                // 隐藏错误信息中的key
                if (ggKey && errorMessage.includes(ggKey)) {
                    errorMessage = errorMessage.replace(new RegExp(ggKey, 'g'), '****');
                }

                // 截断错误信息，避免回复过长
                const displayMessage = errorMessage.length > 100
                    ? errorMessage.substring(0, 100) + "...\n详情请查阅控制台。"
                    : errorMessage;

                return {
                    answer: displayMessage,
                    sources: [],
                    isError: true
                };
            }
        } catch (error) {
            logger.error("[sf插件]gg调用失败\n", error)
            // 隐藏错误信息中的key
            let errorMsg = "[sf插件]gg调用失败:\n" + error.message;
            if (ggKey && errorMsg.includes(ggKey)) {
                errorMsg = errorMsg.replace(new RegExp(ggKey, 'g'), '****');
            }
            return {
                answer: errorMsg,
                sources: [],
                isError: true
            };
        }
    }

    /** ^#(sf|SF)结束((ss|gg|dd)?)对话(\\d+)?.*$ */
    async sf_end_chat(e, config_date) {
        if (!config_date)
            config_date = Config.getConfig()

        // 获取目标用户ID和系统类型
        const match = e.msg.match(/^#(sf|SF)结束((ss|gg|dd)?)对话(?:(\d+))?$/)
        if (!match) return false

        const systemType = match[2]?.toLowerCase() // ss或gg或dd或undefined
        let targetId = e.at  // 优先获取@的用户
        let targetName = ''

        // 处理群聊多人对话
        let contextKey = e.user_id;
        if (e.isGroup && config_date.groupMultiChat) {
            contextKey = `group_${e.group_id}`;
        }

        // 如果没有@用户，尝试从消息中提取QQ号
        if (!targetId && match[4]) {
            targetId = match[4]
        }

        // 如果有目标用户（通过@或QQ号指定）
        if (targetId) {
            // 检查权限
            if (!e.isMaster) {
                e.reply('只有主人才能结束其他用户的对话', true)
                return
            }

            // 获取目标用户的昵称
            if (e.isGroup) {
                try {
                    const member = await e.group.pickMember(Number(targetId))
                    targetName = member.card || member.nickname
                } catch (error) {
                    logger.warn(`[sf插件]获取群成员信息失败: ${error}`)
                    targetName = targetId
                }
            } else {
                targetName = targetId
            }
        } else {
            // 如果没有指定目标用户，则结束自己的对话
            targetId = e.user_id
            targetName = e.sender.card || e.sender.nickname
        }

        // 如果是dd模式，直接清除Redis中的历史记录
        if (systemType === 'dd') {
            try {
                const historyKey = `CHATBOT:HISTORY:${targetId}:dd`;
                await redis.del(historyKey);
                const systemName = 'DD';
                if (targetId === e.user_id) {
                    await e.reply(`已结束当前${systemName}系统对话，历史记录已清除`, true)
                } else {
                    await e.reply(`已结束${targetName}的${systemName}系统对话，历史记录已清除`, true)
                }
                return true;
            } catch (error) {
                logger.error(`[sf插件]清除DD历史记录失败: ${error}`);
                await e.reply('结束对话失败，请稍后再试', true)
                return false;
            }
        }

        // 清除对话记录
        const success = await clearUserContext(contextKey, systemType)
        if (success) {
            const contextStatus = config_date.gg_ss_useContext ? '' : '\n（上下文功能未开启）'
            const systemName = systemType ? systemType.toUpperCase() : '默认'
            if (e.isGroup && config_date.groupMultiChat) {
                await e.reply(`已结束当前群聊的${systemName}系统对话，历史记录已清除${contextStatus}`, true)
            } else if (targetId === e.user_id) {
                await e.reply(`已结束当前${systemName}系统对话，历史记录已清除${contextStatus}`, true)
            } else {
                await e.reply(`已结束${targetName}的${systemName}系统对话，历史记录已清除${contextStatus}`, true)
            }
        } else {
            await e.reply('结束对话失败，请稍后再试', true)
        }
    }

    async sf_end_all_chat(e) {
        const config_date = Config.getConfig()
        if (await clearAllContext()) {
            await e.reply('已结束所有对话，所有历史记录已清除' + `${config_date.gg_ss_useContext ? '' : '\n（上下文功能未开启）'}`, true)
        } else {
            await e.reply('结束所有对话失败，请稍后再试', true)
        }
    }

    /** ^#(sf|SF)(清除|删除)((ss|gg)?)?(前面?|最近的?)(\d+)条对话$ */
    async sf_clearContextByCount(e) {
        const config_date = Config.getConfig()
        // 判断用户身份
        const isMaster = e.isMaster

        const match = e.msg.trim().match(/^#(sf|SF)(清除|删除)((ss|gg)?)?(前面?|最近的?)(\d+)条对话$/)
        if (match) {
            // 获取系统类型和对应的promptNum
            const systemType = match[4]?.toLowerCase() // ss或gg或undefined
            let promptNum = 0
            if (systemType === 'ss') {
                promptNum = config_date.ss_usingAPI
            } else if (systemType === 'gg') {
                promptNum = config_date.gg_usingAPI
            }
            // 如果未指定系统类型，则使用默认配置(promptNum=0)

            // 获取用户ID，如果是群聊则使用发送者的ID
            const userId = e.isGroup ? e.sender.user_id : e.user_id

            const result = await clearContextByCount(userId, parseInt(match[6]) > 0 ? parseInt(match[6]) : 1, promptNum, systemType)
            if (result.success) {
                const systemName = systemType ? systemType.toUpperCase() : '默认'
                e.reply(`[sf插件]成功删除你的${systemName}系统最近的 ${result.deletedCount} 条历史对话` + `${config_date.gg_ss_useContext ? '' : '\n（上下文功能未开启）'}`, true)
            } else {
                e.reply('[sf插件]删除失败:\n' + result.error, true)
            }
        }
    }

    /** 列出接口列表 */
    async sf_list_api(e) {
        // 读取配置
        const config_date = Config.getConfig()

        // 判断是ss还是gg
        const match = e.msg.match(/^#(sf|SF)(s|g)(.*)接口列表$/)
        if (!match) return false

        const baseType = match[2] === 's' ? 'ss' : 'gg'
        const filterStr = match[3] || ''
        const apiList = baseType === 'ss' ? config_date.ss_APIList : config_date.gg_APIList
        const currentApi = baseType === 'ss' ? (e.isMaster ? config_date.ss_usingAPI : e.sf_llm_user_API || await findIndexByRemark(e, "ss", config_date)) : (e.isMaster ? config_date.gg_usingAPI : e.sf_llm_user_API || await findIndexByRemark(e, "gg", config_date))

        if (!apiList || apiList.length === 0) {
            await e.reply(`当前没有配置任何${baseType}接口`, true)
            return
        }

        // 过滤出用户可以使用的接口
        const availableApis = e.isMaster ?
            apiList : // 主人可以看到所有接口
            apiList.filter(api => !api.isOnlyMaster) // 普通用户只能看到非主人专属接口

        // 检查默认配置是否可用
        const defaultConfigAvailable = e.isMaster ||
            !((baseType === 'ss' && config_date.ss_isOnlyMaster) ||
                (baseType === 'gg' && config_date.gg_isOnlyMaster))

        if (!defaultConfigAvailable && availableApis.length === 0) {
            await e.reply('当前没有可用的接口', true)
            return
        }

        let msg = []

        // 如果是完整的ss或gg，显示所有可用接口
        if (filterStr === baseType[1]) {
            msg.push(`当前${baseType}接口列表：`)
            availableApis.forEach((api, index) => {
                const originalIndex = apiList.indexOf(api) + 1
                const isUsing = currentApi === originalIndex
                const customCmd = api.customCommand ? ` (#${baseType[0]}${api.customCommand})` : ''
                const remark = api.remark ? ` - ${api.remark}` : ''
                const masterOnly = api.isOnlyMaster ? ' [主人专属]' : ''
                msg.push(`${originalIndex}. 接口${originalIndex}${remark}${customCmd}${masterOnly}${isUsing ? ' [当前使用]' : ''}`)
            })

            // 添加默认配置的状态
            if (defaultConfigAvailable) {
                const isUsingDefault = currentApi === 0
                const defaultMasterOnly = (baseType === 'ss' && config_date.ss_isOnlyMaster) ||
                    (baseType === 'gg' && config_date.gg_isOnlyMaster) ?
                    ' [主人专属]' : ''
                if (msg.length > 1) msg.push('') // 如果有其他接口，添加空行
                msg.push(`默认配置${defaultMasterOnly}${isUsingDefault ? ' [当前使用]' : ''}`)
            }
        } else {
            // 只根据自定义命令筛选接口
            const filteredApis = availableApis.filter(api => {
                const customCmd = api.customCommand || ''
                return customCmd.includes(filterStr)
            })

            if (filteredApis.length === 0) {
                await e.reply(`未找到自定义命令包含 "${filterStr}" 的可用接口`, true)
                return
            }

            msg.push(`筛选结果 "${filterStr}"：`)
            filteredApis.forEach((api, index) => {
                const originalIndex = apiList.indexOf(api) + 1
                const isUsing = currentApi === originalIndex
                const customCmd = api.customCommand ? ` (#${baseType[0]}${api.customCommand})` : ''
                const remark = api.remark ? ` - ${api.remark}` : ''
                const masterOnly = api.isOnlyMaster ? ' [主人专属]' : ''
                msg.push(`${originalIndex}. 接口${originalIndex}${remark}${customCmd}${masterOnly}${isUsing ? ' [当前使用]' : ''}`)
            })
        }

        // 如果接口数量超过10个，使用转发消息
        if (msg.length > 12) { // 标题占一行，默认配置占1行，所以是12
            await e.reply(await common.makeForwardMsg(e, msg.filter(Boolean), `${baseType}接口列表`))
        } else {
            await e.reply(msg.join('\n'))
        }
    }

    /** 选择使用的接口 */
    async sf_select_api(e) {
        // 读取配置
        const config_date = Config.getConfig()

        // 判断用户身份
        const isMaster = e.isMaster

        // 解析命令
        const match = e.msg.match(/^#(sf|SF)(ss|gg)使用接口(\d+)$/)
        const type = match[2].toLowerCase()
        const index = parseInt(match[3])

        // 验证索引
        const apiList = type === 'ss' ? config_date.ss_APIList : config_date.gg_APIList
        if (index < 0 || (index > 0 && (!apiList || index > apiList.length))) {
            await e.reply(`无效的接口索引，请使用 #sf${type}接口列表 查看可用的接口`, true)
            return
        }

        // 如果是非主人用户,检查接口是否可用
        if (!isMaster && index > 0) {
            const api = apiList[index - 1]
            if (api.isOnlyMaster) {
                // await e.reply('该接口仅限主人使用')
                return false
            }
        }

        // 如果是非主人用户,检查默认配置是否可用
        if (!isMaster && index === 0) {
            if ((type === 'ss' && config_date.ss_isOnlyMaster) ||
                (type === 'gg' && config_date.gg_isOnlyMaster)) {
                // await e.reply('默认配置仅限主人使用')
                logger.info("已开启仅限主人使用默认配置");
                return
            }
        }

        // 根据用户身份更新配置
        if (type === 'ss') {
            if (isMaster) {
                config_date.ss_usingAPI = index
            } else {
                redis.set(`sf_plugin:llm:ss_chat_user:${e.user_id}`, apiList[index - 1].remark, { EX: 60 * 24 * 60 * 60 }); // 写入redis，有效期60天
            }
        } else {
            if (isMaster) {
                config_date.gg_usingAPI = index
            } else {
                redis.set(`sf_plugin:llm:gg_chat_user:${e.user_id}`, apiList[index - 1].remark, { EX: 60 * 24 * 60 * 60 }); // 写入redis，有效期60天
            }
        }

        // 保存配置
        if (isMaster)
            Config.setConfig(config_date)

        // 返回结果
        if (index === 0) {
            await e.reply(`已切换为使用${type}默认配置`, true)
        } else {
            const api = apiList[index - 1]
            await e.reply(`已切换为使用${type}接口：${api.remark || `接口${index}`}`, true)
        }
    }

    /** 通用选择处理器工厂函数 */
    createSelectHandler(options) {
        const { type, chatMethod } = options;

        return async (e) => {
            let config_date = Config.getConfig();
            const fullMsg = e.msg.trim();
            const withoutPrefix = fullMsg.substring(2);

            // 处理命令和内容
            const processCommand = async (cmd, content) => {
                const apiList = config_date[`${type}_APIList`];
                let apiIndex = -1;

                // 处理数字索引
                if (!isNaN(cmd)) {
                    const index = parseInt(cmd);
                    if (!apiList || index < 0 || (index > 0 && index > apiList.length)) {
                        logger.warn(`无效的接口索引，请使用 #sf${type}接口列表 查看可用的接口`);
                        return false;
                    }
                    apiIndex = index - 1;
                } else {
                    // 处理自定义命令
                    apiIndex = apiList?.findIndex(api => api.customCommand === cmd) ?? -1;
                    if (apiIndex === -1) {
                        logger.debug(`未找到命令 ${cmd} 对应的接口`);
                        return false;
                    }
                }

                // 检查接口权限
                if (apiIndex >= 0 && !e.isMaster && apiList[apiIndex].isOnlyMaster) {
                    // await e.reply('该接口仅限主人使用');
                    return false;
                }

                // 检查默认配置权限
                if (apiIndex === -1 && !e.isMaster) {
                    if ((type === 'ss' && config_date.ss_isOnlyMaster) ||
                        (type === 'gg' && config_date.gg_isOnlyMaster)) {
                        // await e.reply('默认配置仅限主人使用')
                        logger.info("已开启仅限主人使用默认配置");
                        return false;
                    }
                }

                // 根据用户身份设置对应的API
                if (e.isMaster) {
                    config_date[`${type}_usingAPI`] = apiIndex + 1;
                } else {
                    e.sf_llm_user_API = apiIndex + 1;
                }

                // 判断 是否开启 上下文功能
                if (apiIndex > -1)
                    config_date.gg_ss_useContext = apiList[apiIndex].useContext ? true : false;

                e.msg = `#${type} ${content}`;
                // 调用 ss 或 gg 对话函数
                await this[chatMethod](e, config_date);
                return true;
            };

            // 尝试匹配自定义命令
            const apiList = config_date[`${type}_APIList`];
            if (apiList) {
                // 获取第一行内容用于命令匹配
                const firstLine = withoutPrefix.split('\n')[0].trim();
                const matchedCmd = apiList
                    .filter(api => api.customCommand && firstLine.startsWith(api.customCommand))
                    .sort((a, b) => b.customCommand.length - a.customCommand.length)[0];

                if (matchedCmd) {
                    // 提取内容并保持格式
                    const cmdLength = matchedCmd.customCommand.length;
                    let content;

                    // 如果命令在第一行，需要特殊处理第一行的内容
                    const lines = withoutPrefix.split('\n');
                    if (lines[0].trim().startsWith(matchedCmd.customCommand)) {
                        // 保留第一行命令后的内容（处理有空格和无空格的情况）
                        const firstLineContent = lines[0].substring(cmdLength).trimLeft();
                        // 如果第一行除了命令还有其他内容，或者只有一行
                        if (firstLineContent || lines.length === 1) {
                            content = firstLineContent + (lines.length > 1 ? '\n' + lines.slice(1).join('\n') : '');
                        } else {
                            // 如果第一行只有命令，从第二行开始
                            content = lines.slice(1).join('\n');
                        }
                    } else {
                        // 处理命令和内容在同一行且无空格分隔的情况
                        content = withoutPrefix.substring(cmdLength).trimLeft();
                    }

                    // 如果提取的内容为空，尝试获取下一行
                    if (!content.trim() && lines.length > 1) {
                        content = lines.slice(1).join('\n');
                    }

                    return await processCommand(matchedCmd.customCommand, content);
                }
            }

            // 尝试匹配数字命令（支持无空格情况）
            const numberMatch = withoutPrefix.match(/^(\d+)(?:\s+|\n)?([\s\S]*)/);
            if (numberMatch) {
                const [, cmd, content] = numberMatch;
                // 确保内容部分不是空的
                if (content && content.trim()) {
                    return await processCommand(cmd, content);
                }
            }

            // 尝试匹配空格分隔的命令
            const firstSpaceIndex = withoutPrefix.search(/\s/);
            if (firstSpaceIndex !== -1) {
                const cmd = withoutPrefix.substring(0, firstSpaceIndex);
                const content = withoutPrefix.substring(firstSpaceIndex + 1);
                // 确保内容部分不是空的
                if (content && content.trim()) {
                    return await processCommand(cmd, content);
                }
            }

            // logger.error('命令格式错误');
            return false;
        };
    }

    /** 通用结束对话处理器工厂函数 */
    createEndChatHandler(options) {
        const { type } = options;

        return async (e) => {
            let config_date = Config.getConfig();
            const fullMsg = e.msg.trim();
            const withoutPrefix = fullMsg.substring(2);

            const endChatIndex = withoutPrefix.indexOf('结束对话');
            if (endChatIndex === -1) {
                // logger.error('[sf插件] 命令格式错误');
                return false;
            }

            const cmdPart = withoutPrefix.substring(0, endChatIndex).trim();
            const afterEndChat = withoutPrefix.substring(endChatIndex + 4);
            const number = afterEndChat.match(/(\d+)/)?.[1] || '';

            const processEndChat = async (apiIndex) => {
                // 检查接口权限
                if (apiIndex > 0 && !e.isMaster) {
                    const apiList = config_date[`${type}_APIList`];
                    if (apiList[apiIndex - 1].isOnlyMaster) {
                        // await e.reply('该接口仅限主人使用');
                        return false;
                    }
                }

                // 检查默认配置权限
                if (apiIndex === 0 && !e.isMaster) {
                    if ((type === 'ss' && config_date.ss_isOnlyMaster) ||
                        (type === 'gg' && config_date.gg_isOnlyMaster)) {
                        // await e.reply('默认配置仅限主人使用')
                        logger.info("已开启仅限主人使用默认配置");
                        return false;
                    }
                }

                // 根据用户身份设置对应的API
                if (e.isMaster) {
                    config_date[`${type}_usingAPI`] = apiIndex;
                } else {
                    e.sf_llm_user_API = apiIndex;
                }

                // 判断 是否开启 上下文功能
                config_date.gg_ss_useContext = apiList[apiIndex - 1].useContext ? true : false;

                e.msg = `#sf结束${type}对话${number}`;
                await this.sf_end_chat(e, config_date);
                return true;
            };

            // 尝试匹配自定义命令
            const apiList = config_date[`${type}_APIList`];
            if (apiList) {
                const apiIndex = apiList.findIndex(api => api.customCommand === cmdPart);
                if (apiIndex !== -1) {
                    return await processEndChat(apiIndex + 1);
                }
            }

            // 尝试匹配数字
            const index = parseInt(cmdPart);
            if (!isNaN(index)) {
                if (!apiList || index < 0 || (index > 0 && index > apiList.length)) {
                    await e.reply(`无效的接口索引，请使用 #sf${type}接口列表 查看可用的接口`);
                    return false;
                }
                return await processEndChat(index);
            }

            logger.debug(`未找到命令 ${cmdPart} 对应的接口`);
            return false;
        };
    }

    // 使用工厂函数创建处理器
    sf_select_and_chat = this.createSelectHandler({
        type: 'ss',
        chatMethod: 'sf_chat'
    });

    gg_select_and_chat = this.createSelectHandler({
        type: 'gg',
        chatMethod: 'gg_chat'
    });

    sf_select_and_end_chat = this.createEndChatHandler({
        type: 'ss'
    });

    gg_select_and_end_chat = this.createEndChatHandler({
        type: 'gg'
    });

    // 处理命令
    async handleCommands(ws, msg, userQQ = 'web_user', config = undefined) {
        // 读取配置
        if (!config)
            config = Config.getConfig();

        // 构造模拟的e对象
        const e = {
            msg: msg,
            reply: (content, quote = false) => {
                this.sendMessage(ws, 'system', content, config);
            },
            user_id: userQQ,
            self_id: this.e?.self_id || Bot.uin,
            sender: this.e?.sender || {
                card: config.wsDefaultUser || '小白',
                nickname: config.wsDefaultUser || '小白'
            },
            isMaster: true, // WebSocket连接默认有管理权限
            ws: ws // 添加ws属性以支持WebSocket通信
        };

        try {
            // 创建MJ实例
            const mjPainting = new MJ_Painting();

            // 合并SF和MJ的规则
            const allRules = [
                ...this.rule.map(rule => ({ ...rule, instance: this })),
                ...mjPainting.rule.map(rule => ({ ...rule, instance: mjPainting }))
            ];

            // 遍历所有规则并尝试匹配
            for (const rule of allRules) {
                const reg = rule.reg;
                const fnc = rule.fnc;

                // 如果是字符串，转换为正则
                const regex = typeof reg === 'string' ? new RegExp(reg) : reg;

                // 尝试匹配命令
                if (regex.test(msg)) {
                    // 检查权限
                    if (rule.permission === 'master' && !e.isMaster) {
                        this.sendError(ws, '该命令仅限管理员使用');
                        return true;
                    }

                    // 调用对应实例的处理函数
                    await rule.instance[fnc](e);
                    return true;
                }
            }
        } catch (error) {
            logger.error('[sf插件] 处理命令时出错:', error);
            this.sendError(ws, error.message);
            return true;
        }

        return false; // 不是支持的命令
    }

    // 添加处理加载历史记录的方法
    async handleLoadHistory(ws, msgObj, logLevel = 'debug') {
        try {
            const { userQQ, mode } = msgObj;
            if (!userQQ) {
                logger.warn('[sf插件] 加载历史记录失败: 未提供用户QQ');
                this.sendError(ws, '未提供用户QQ');
                return;
            }

            let messages = [];
            if (mode === 'dd') {
                // 从Redis加载绘画历史记录
                const historyKey = `CHATBOT:HISTORY:${userQQ}:dd`;
                const historyData = await redis.lRange(historyKey, 0, -1);
                messages = historyData.map(item => JSON.parse(item)).flat();
                if (logLevel === 'debug' || logLevel === 'info')
                    logger.debug(`[sf插件] 成功加载绘画历史记录: ${messages.length}条消息`);
            } else {
                // 原有的SS和GG模式历史记录加载逻辑
                const config = Config.getConfig();
                let promptNum = 0;
                if (mode === 'ss') {
                    promptNum = config.ss_usingAPI;
                } else if (mode === 'gg') {
                    promptNum = config.gg_usingAPI;
                }
                if (logLevel === 'debug' || logLevel === 'info')
                    logger.debug(`[sf插件] 加载历史记录: userQQ=${userQQ}, mode=${mode}, promptNum=${promptNum}`);
                messages = await loadContext(userQQ, promptNum, mode);
                if (logLevel === 'debug' || logLevel === 'info')
                    logger.debug(`[sf插件] 成功加载历史记录: ${messages.length}条消息`);
            }

            // 发送历史记录给客户端
            const response = {
                type: 'history',
                messages: messages
            };
            ws.send(JSON.stringify(response));
            logger.debug(`[sf插件] ${messages.length}条历史记录已发送给客户端`);
        } catch (error) {
            logger.error('[sf插件] 加载历史记录失败:', error);
            this.sendError(ws, '加载历史记录失败: ' + error.message);
        }
    }
}

/** 初始化 ws 服务端 */
async function init_server() {
    // 检查配置是否启用ws服务
    const config = Config.getConfig();
    if (!config.enableWS) {
        return;
    }

    // 使用全局对象存储服务器实例
    if (!Ws_Server.sfPluginServer) {
        // 创建HTTP服务器
        Ws_Server.sfPluginServer = createServer();

        // 创建WebSocket服务器
        const wsOptions = {
            server: Ws_Server.sfPluginServer,
            maxPayload: 50 * 1024 * 1024, // 50MB
        };

        Ws_Server.sfPluginWSServer = new WebSocketServer(wsOptions);

        // 启动服务器
        const port = config.wsPort || 8081;
        Ws_Server.sfPluginServer.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                // 如果端口被占用，尝试使用其他端口
                logger.mark(`[sf插件] 端口 ${port} 已被占用，尝试使用随机端口`);
                Ws_Server.sfPluginServer.listen(0);
            } else {
                logger.error('[sf插件] WebSocket服务器错误:', error);
            }
        });

        Ws_Server.sfPluginServer.listen(port, () => {
            const address = Ws_Server.sfPluginServer.address();
            logger.mark(`[sf插件] WebSocket服务器运行在端口 ${address.port}`);
        });

        // WebSocket连接处理
        Ws_Server.sfPluginWSServer.on('connection', (ws, req) => {
            // 根据日志级别记录
            const logLevel = config.wsLogLevel || 'info';
            if (logLevel === 'debug') {
                logger.info(`[sf插件] 新的WebSocket连接 来自: ${req.socket.remoteAddress}`);
            } else if (logLevel === 'info') {
                logger.info('[sf插件] 新的WebSocket连接');
            }

            // 添加密码验证处理
            ws.isAuthenticated = false;

            ws.on('message', async (message) => {
                try {
                    const msgObj = JSON.parse(message);

                    // 处理密码验证
                    if (msgObj.type === 'auth') {
                        if (msgObj.password === config.wsPassword) {
                            ws.isAuthenticated = true;
                            ws.send(JSON.stringify({
                                type: 'auth',
                                success: true
                            }));
                            return;
                        } else {
                            ws.send(JSON.stringify({
                                type: 'auth',
                                success: false,
                                message: '密码错误'
                            }));
                            return;
                        }
                    }

                    // 验证是否已认证
                    if (!ws.isAuthenticated) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: '请先进行密码验证'
                        }));
                        return;
                    }

                    if (logLevel === 'debug') {
                        logger.mark(`[sf插件] 收到WebSocket消息: ${JSON.stringify(msgObj)}`);
                    }
                    const { type, content, images, userQQ } = msgObj;
                    const sfPainting = new SF_Painting();

                    // 根据类型处理消息
                    switch (type) {
                        case 'loadHistory':
                            if (logLevel === 'debug' || logLevel === 'info') {
                                logger.mark(`[sf插件] 处理加载历史记录请求: userQQ=${msgObj.userQQ}, mode=${msgObj.mode}`);
                            }
                            await sfPainting.handleLoadHistory(ws, msgObj, logLevel);
                            break;
                        case 'ss':
                            if (logLevel === 'debug' || logLevel === 'info') {
                                logger.mark(`[sf插件] 处理SS消息: ${content}`);
                            }
                            await sfPainting.handleSSMessage(ws, content, images, userQQ);
                            break;
                        case 'gg':
                            if (logLevel === 'debug' || logLevel === 'info') {
                                logger.mark(`[sf插件] 处理GG消息: ${content}`);
                            }
                            await sfPainting.handleGGMessage(ws, content, images, userQQ);
                            break;
                        case 'dd':
                            if (logLevel === 'debug' || logLevel === 'info') {
                                logger.mark(`[sf插件] 处理DD消息: ${content}`);
                            }
                            await sfPainting.handleCommands(ws, content, userQQ);
                            break;
                        default:
                            if (logLevel !== 'error') {
                                logger.warn(`[sf插件] 未知的消息类型: ${type}`);
                            }
                            sfPainting.sendError(ws, '未知的消息类型');
                    }
                } catch (error) {
                    if (logLevel !== 'error') {
                        logger.error('[sf插件] 处理WebSocket消息错误:', error);
                    }
                    sfPainting.sendError(ws, error.message);
                }
            });

            ws.on('close', () => {
                if (logLevel === 'debug' || logLevel === 'info') {
                    logger.mark('[sf插件] WebSocket连接关闭');
                }
            });

            ws.on('error', (error) => {
                if (logLevel !== 'error') {
                    logger.error('[sf插件] WebSocket错误:', error);
                }
            });
        });
    }
}

/**
 * @description: 根据接口文件名（备注）查找对应的索引，如果没有找到则返回0
 * @param {object} e
 * @param {string} type 填写 ss 或 gg
 * @param {object} config_date
 * @return {number} 返回索引
 */
async function findIndexByRemark(e, type, config_date) {
    const remark = await redis.get(`sf_plugin:llm:${type}_chat_user:${e.user_id}`)
    const index = config_date[`${type}_APIList`]?.findIndex(item => item.remark === remark);
    return index + 1;
}
