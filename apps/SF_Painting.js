import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import Config from '../components/Config.js'
import common from '../../../lib/common/common.js';
import {
    parseSourceImg,
    url2Base64,
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

// 使机器人可以对其第一人称回应
const reg_chatgpt_for_firstperson_call = new RegExp(Config.getConfig()?.botName || `sf-plugin-bot-name-${Math.floor(10000 + Math.random() * 90000)}`, "g");

export class SF_Painting extends plugin {
    constructor() {
        super({
            name: 'SF_对话&绘图',
            dsc: 'SF_对话&绘图',
            event: 'message',
            priority: 6,
            rule: [
                {
                    reg: '^#(flux|FLUX|(sf|SF)(画图|绘图|绘画))',
                    fnc: 'sf_draw'
                },
                {
                    reg: '^#(sf|SF|siliconflow|硅基流动)设置(画图key|翻译key|翻译baseurl|翻译模型|生成提示词|推理步数|fish发音人|ss图片模式|ggkey|ggbaseurl|gg图片模式|上下文|ss转发消息|gg转发消息|gg搜索|ss引用原消息|gg引用原消息)',
                    fnc: 'sf_setConfig',
                    permission: 'master'
                },
                {
                    reg: '^#(sf|SF|siliconflow|硅基流动)设置帮助$',
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
                    reg: '^#(sf|SF)结束((ss|gg)?)对话(\\d+)?.*$',
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
                    log: false
                },
                {
                    reg: '^#(sf|SF)(ss|gg)接口列表$',
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
                    reg: '^#(s|S)(?!f|F|s|S)(.+?).*$',
                    fnc: 'sf_select_and_chat',
                },
                {
                    reg: '^#(g|G)(?!g|G)(.+?).*$',
                    fnc: 'gg_select_and_chat',
                }
            ]
        })
        this.sf_keys_index = -1
        this.currentKeyIndex_ggKey = 0
    }

    // 处理第一人称呼叫
    async sf_first_person_call(e) {
        // 读取配置
        const config = Config.getConfig()
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

        // 根据配置和搜索关键词决定使用哪个命令
        let useCommand = '#gg'
        if (config.defaultCommand === 'ss' && !hasSearchKeyword) {
            useCommand = '#ss'
        }

        // 构造新的消息内容，不再移除机器人名字
        const newMsg = useCommand + ' ' + msg.trim()

        // 修改消息内容并调用对应的处理函数
        e.msg = newMsg
        if (useCommand === '#ss') {
            return await this.sf_chat(e)
        } else {
            return await this.gg_chat(e)
        }
    }

    /** 轮询 sf_keys */
    get_use_sf_key(config_date) {
        let use_sf_key = null
        let count = 0;
        while (!use_sf_key && count < config_date.sf_keys.length) {
            count++
            if (this.sf_keys_index < config_date.sf_keys.length - 1) {
                this.sf_keys_index++
            } else
                this.sf_keys_index = 0

            if (config_date.sf_keys[this.sf_keys_index].isDisable)
                continue
            else {
                use_sf_key = config_date.sf_keys[this.sf_keys_index].sf_key
            }
        }
        return use_sf_key
    }

    /** 轮询 ggKey */
    get_use_ggKey(config_date) {
        if (!config_date?.ggKey) return '';
        const keysArr = config_date.ggKey.split(/[,，]/).map(key => key.trim()).filter(Boolean);
        if (keysArr.length === 0) return '';

        // 获取当前key并更新索引
        const currentKey = keysArr[this.currentKeyIndex_ggKey];
        this.currentKeyIndex_ggKey = (this.currentKeyIndex_ggKey + 1) % keysArr.length;

        return currentKey;
    }

    async sf_setConfig(e) {
        // 读取配置
        let config_date = Config.getConfig()
        const match = e.msg.match(/^#(sf|SF|siliconflow|硅基流动)设置(画图key|翻译key|翻译baseurl|翻译模型|生成提示词|推理步数|fish发音人|ss图片模式|ggkey|ggbaseurl|gg图片模式|上下文|ss转发消息|gg转发消息|gg搜索|ss引用原消息|gg引用原消息)([\s\S]*)/)
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
                    config_date.gg_useContext = value === '开'
                    break
                case 'ss转发消息':
                    config_date.ss_forwardMessage = value === '开'
                    break
                case 'gg转发消息':
                    config_date.gg_forwardMessage = value === '开'
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
        // logger.mark("draw方法被调用，消息内容:", e.msg)

        if (config_date.sf_keys.length == 0) {
            await e.reply('请先设置画图API Key。使用命令：#sf设置画图key [值]（仅限主人设置）')
            return false
        }

        // 处理图生图模型
        let canImg2Img = false;
        if (config_date.imageModel.match(/stabilityai\/stable-diffusion-3-medium|stabilityai\/stable-diffusion-xl-base-1.0|stabilityai\/stable-diffusion-2-1|stabilityai\/stable-diffusion-3-5-large/)) {
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

        let msg = e.msg.replace(/^#(flux|FLUX|(sf|SF)(画图|绘图|绘画))/, '').trim()

        // 处理 msg
        let param = await handleParam(e, msg)

        let userPrompt = param.input

        let finalPrompt = userPrompt
        let onleReplyOnce = 0;
        const use_sf_key = this.get_use_sf_key(config_date);
        if (config_date.generatePrompt) {
            if (!onleReplyOnce && !config_date.simpleMode) {
                e.reply(`@${e.sender.card || e.sender.nickname} ${e.user_id}正在为您生成提示词并绘图...`)
                onleReplyOnce++
            }
            finalPrompt = await this.generatePrompt(userPrompt, use_sf_key, config_date)
            if (!finalPrompt) {
                await e.reply('生成提示词失败，请稍后再试。')
                return false
            }
        }
        if (!onleReplyOnce && !config_date.simpleMode) {
            e.reply(`@${e.sender.card || e.sender.nickname} ${e.user_id}正在为您生成图片...`)
            onleReplyOnce++
        }

        logger.mark("[sf插件]开始图片生成API调用")
        this.sf_send_pic(e, finalPrompt, use_sf_key, config_date, param, canImg2Img, souce_image_base64, userPrompt)
        return true;
    }

    async sf_chat(e) {
        // 读取配置
        const config_date = Config.getConfig()

        // 获取接口配置
        let use_sf_key = "", apiBaseUrl = "", model = "", systemPrompt = "", useMarkdown = false, forwardMessage = true, quoteMessage = true
        if (config_date.ss_usingAPI > 0 && config_date.ss_APIList && config_date.ss_APIList[config_date.ss_usingAPI - 1]) {
            // 使用接口列表中的配置
            const apiConfig = config_date.ss_APIList[config_date.ss_usingAPI - 1]
            // 只有当APIList中的字段有值时才使用该值
            use_sf_key = apiConfig.apiKey || config_date.ss_Key || ""
            apiBaseUrl = apiConfig.apiBaseUrl || config_date.ss_apiBaseUrl || config_date.sfBaseUrl
            model = apiConfig.model || config_date.ss_model || config_date.translateModel
            systemPrompt = apiConfig.prompt || config_date.ss_Prompt || "You are a helpful assistant, you prefer to speak Chinese"
            useMarkdown = typeof apiConfig.useMarkdown !== 'undefined' ? apiConfig.useMarkdown : config_date.ss_useMarkdown
            forwardMessage = typeof apiConfig.forwardMessage !== 'undefined' ? apiConfig.forwardMessage : config_date.ss_forwardMessage
            quoteMessage = typeof apiConfig.quoteMessage !== 'undefined' ? apiConfig.quoteMessage : config_date.ss_quoteMessage
        } else if (config_date.ss_apiBaseUrl) {
            // 使用默认配置
            use_sf_key = config_date.ss_Key
            apiBaseUrl = config_date.ss_apiBaseUrl
            model = config_date.ss_model
            systemPrompt = config_date.ss_Prompt || "You are a helpful assistant, you prefer to speak Chinese"
            useMarkdown = config_date.ss_useMarkdown
            forwardMessage = config_date.ss_forwardMessage
            quoteMessage = config_date.ss_quoteMessage
        } else if (config_date.sf_keys.length == 0) {
            await e.reply('请先设置API Key。使用命令：#sf设置画图key [值]（仅限主人设置）')
            return false
        } else {
            use_sf_key = this.get_use_sf_key(config_date)
            apiBaseUrl = config_date.sfBaseUrl
            model = config_date.translateModel
            useMarkdown = config_date.ss_useMarkdown
            forwardMessage = config_date.ss_forwardMessage
            quoteMessage = config_date.ss_quoteMessage
        }

        // 处理引用消息,获取图片和文本
        await parseSourceImg(e)
        let currentImages = [];
        if (e.img && e.img.length > 0) {
            // 记录获取到的图片链接
            logger.mark(`[SF插件][ss]获取到图片链接:\n${e.img.join('\n')}`)
            // 获取所有图片数据
            for (const imgUrl of e.img) {
                const base64Image = await url2Base64(imgUrl);
                if (!base64Image) {
                    e.reply('引用的图片地址已失效，请重新发送图片', true)
                    return false
                }
                currentImages.push(base64Image);
            }
        }

        let msg = e.msg.replace(/^#(ss|SS)/, '').trim()

        // 如果有引用的文本,添加两个换行来分隔
        const quotedText = e.sourceMsg ? e.sourceMsg + '\n\n' : ''
        msg = quotedText + msg

        // 处理消息中的URL
        // logger.mark(`[SF插件][URL处理]开始处理消息中的URL: ${msg}`)
        let extractedContent = '';
        try {
            // 根据是否为图片模式决定是否在消息中显示提取的内容
            const { message: processedMsg, extractedContent: extracted } = await processMessageWithUrls(msg, !config_date.ss_useMarkdown);
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

        // 获取历史对话
        let historyMessages = []
        if (config_date.gg_useContext) {
            historyMessages = await loadContext(e.user_id, config_date.ss_usingAPI)
            logger.mark(`[SF插件][ss]加载历史对话: ${historyMessages.length / 2} 条`)
        }

        // 如果是图片模式，在发送给AI时将提取的内容加回去
        const aiMessage = config_date.ss_useMarkdown ? msg + extractedContent : msg;

        // 收集历史图片
        let historyImages = [];
        // 从历史消息中收集图片
        historyMessages.forEach(msg => {
            if (msg.imageBase64) {
                historyImages = historyImages.concat(msg.imageBase64);
            }
        });

        const opt = {
            currentImages: currentImages.length > 0 ? currentImages : undefined,
            historyImages: historyImages.length > 0 ? historyImages : undefined,
            systemPrompt: systemPrompt
        }

        const answer = await this.generatePrompt(aiMessage, use_sf_key, config_date, true, apiBaseUrl, model, opt, historyMessages, e)

        // 保存对话记录
        if (config_date.gg_useContext) {
            // 保存用户消息
            await saveContext(e.user_id, {
                role: 'user',
                content: aiMessage,
                extractedContent: extractedContent,
                imageBase64: currentImages.length > 0 ? currentImages : undefined
            }, config_date.ss_usingAPI)
            // 保存AI回复
            await saveContext(e.user_id, {
                role: 'assistant',
                content: answer
            }, config_date.ss_usingAPI)
        }

        try {
            if (useMarkdown) {
                const img = await markdown_screenshot(e.user_id, e.self_id, e.img ? e.img.map(url => `<img src="${url}" width="256">`).join('\n') + "\n\n" + msg : msg, answer);
                if (img) {
                    await e.reply({ ...img, origin: true }, quoteMessage)
                } else {
                    logger.error('[sf插件] markdown图片生成失败')
                }
                if (forwardMessage) {
                    e.reply(await common.makeForwardMsg(e, [answer], `${e.sender.card || e.sender.nickname || e.user_id}的对话`));
                }
            } else {
                await e.reply(answer, quoteMessage)
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
     * @return {string}
     */
    async generatePrompt(input, use_sf_key, config_date, forChat = false, apiBaseUrl = "", model = "", opt = {}, historyMessages = [], e) {
        // 获取用户名并替换prompt中的变量
        const userName = e?.sender?.card || e?.sender?.nickname || "用户";
        const systemPrompt = !forChat ?
            config_date.sf_textToPaint_Prompt :
            (opt.systemPrompt || config_date.ss_Prompt || "You are a helpful assistant, you prefer to speak Chinese").replace(/{{user_name}}/g, userName);

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

        logger.debug("[sf插件]API调用LLM msg：\n" + input)
        try {
            const response = await fetch(`${apiBaseUrl || config_date.sfBaseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${use_sf_key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            })

            const data = await response.json()

            if (data?.choices?.[0]?.message?.content) {
                return data.choices[0].message.content
            } else {
                logger.error("[sf插件]LLM调用错误：\n", JSON.stringify(data, null, 2))
                return !forChat ? input : "[sf插件]LLM调用错误，详情请查阅控制台。"
            }
        } catch (error) {
            logger.error("[sf插件]LLM调用失败\n", error)
            return !forChat ? input : "[sf插件]LLM调用失败，详情请查阅控制台。"
        }
    }

    async sf_help(e) {
        const helpMessage = `
SF插件设置帮助：
1. 设置画图API Key：#sf设置画图key [值]
2. 设置翻译模型：#sf设置翻译模型 [模型名]
3. 开关提示词生成：#sf设置生成提示词 开/关
4. 设置推理步数：#sf设置推理步数 [值]
5. 设置ss图片模式：#sf设置ss图片模式 开/关
6. 设置Gemini Key：#sf设置ggkey [值]
7. 设置Gemini URL：#sf设置ggbaseurl [值]
8. 设置gg图片模式：#sf设置gg图片模式 开/关
9. 设置上下文功能：#sf设置上下文 开/关
10. 设置ss转发消息：#sf设置ss转发消息 开/关
11. 设置gg转发消息：#sf设置gg转发消息 开/关
12. 设置gg搜索功能：#sf设置gg搜索 开/关
13. 设置ss引用原消息：#sf设置ss引用原消息 开/关
14. 设置gg引用原消息：#sf设置gg引用原消息 开/关
15. 查看帮助：#sf帮助

对话指令：
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
12. #sf结束全部对话：结束所有用户的对话（仅限主人）
13. #sf删除前n条对话：删除默认配置的最近n条对话
14. #sf删除ss前n条对话：删除SS系统的最近n条对话
15. #sf删除gg前n条对话：删除GG系统的最近n条对话

接口管理：
1. #sfss接口列表：查看ss接口列表
2. #sfgg接口列表：查看gg接口列表
3. #sfss使用接口[数字]：切换ss接口
4. #sfgg使用接口[数字]：切换gg接口
注：使用0表示使用默认配置

画图指令：
1. #sf画图 [描述]：生成图片
2. #flux画图 [描述]：生成图片
3. 支持图生图功能，引用图片即可

其他说明：
1. 支持图片识别和多轮对话
2. 支持URL内容提取和处理
3. 支持markdown格式回复
4. 支持搜索引擎集成（仅限GG）
5. 支持多API接口切换
        `.trim()

        await e.reply(helpMessage)
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
种子：${data.seed}`
                const str_3 = `图片URL：${imageUrl}`

                // 发送图片
                if (config_date.simpleMode) {
                    const msgx = await common.makeForwardMsg(e, [str_1, { ...segment.image(imageUrl), origin: true }, str_2, str_3], `${e.sender.card || e.sender.nickname} 的${canImg2Img ? "图生图" : "文生图"}`)
                    e.reply(msgx)
                } else {
                    const msgx = await common.makeForwardMsg(e, [str_1, str_2, str_3], `${e.sender.card || e.sender.nickname} 的${canImg2Img ? "图生图" : "文生图"}`)
                    e.reply(msgx)
                    e.reply({ ...segment.image(imageUrl), origin: true })
                }

                return true;
            } else {
                logger.error("[sf插件]返回错误：\n", JSON.stringify(data, null, 2))
                e.reply(`生成图片失败：${data.message || '未知错误'}`)
                return false;
            }
        } catch (error) {
            logger.error("[sf插件]API调用失败\n", error)
            e.reply('生成图片时遇到了一个错误，请稍后再试。')
            return false;
        }
    }

    async gg_chat(e) {
        // 读取配置
        const config_date = Config.getConfig()

        // 获取接口配置
        let ggBaseUrl = "", ggKey = "", model = "", systemPrompt = "", useMarkdown = false, forwardMessage = true, quoteMessage = true, useSearch = true
        if (config_date.gg_usingAPI > 0 && config_date.gg_APIList && config_date.gg_APIList[config_date.gg_usingAPI - 1]) {
            // 使用接口列表中的配置
            const apiConfig = config_date.gg_APIList[config_date.gg_usingAPI - 1]
            // 只有当APIList中的字段有值时才使用该值
            ggBaseUrl = apiConfig.apiBaseUrl || config_date.ggBaseUrl || "https://bright-donkey-63.deno.dev"
            ggKey = apiConfig.apiKey || this.get_use_ggKey(config_date) || "sk-xuanku"
            model = apiConfig.model || config_date.gg_model || "gemini-2.0-flash-exp"
            systemPrompt = apiConfig.prompt || config_date.gg_Prompt || "你是一个有用的助手，你更喜欢说中文。你会根据用户的问题，通过搜索引擎获取最新的信息来回答问题。你的回答会尽可能准确、客观。"
            useMarkdown = typeof apiConfig.useMarkdown !== 'undefined' ? apiConfig.useMarkdown : config_date.gg_useMarkdown
            forwardMessage = typeof apiConfig.forwardMessage !== 'undefined' ? apiConfig.forwardMessage : config_date.gg_forwardMessage
            quoteMessage = typeof apiConfig.quoteMessage !== 'undefined' ? apiConfig.quoteMessage : config_date.gg_quoteMessage
            useSearch = typeof apiConfig.useSearch !== 'undefined' ? apiConfig.useSearch : config_date.gg_useSearch
        } else {
            // 使用默认配置
            ggBaseUrl = config_date.ggBaseUrl || "https://bright-donkey-63.deno.dev"
            ggKey = this.get_use_ggKey(config_date) || "sk-xuanku"
            model = config_date.gg_model || "gemini-2.0-flash-exp"
            systemPrompt = config_date.gg_Prompt || "你是一个有用的助手，你更喜欢说中文。你会根据用户的问题，通过搜索引擎获取最新的信息来回答问题。你的回答会尽可能准确、客观。"
            useMarkdown = config_date.gg_useMarkdown
            forwardMessage = config_date.gg_forwardMessage
            quoteMessage = config_date.gg_quoteMessage
            useSearch = config_date.gg_useSearch
        }

        // 处理引用消息,获取图片和文本
        await parseSourceImg(e)
        let currentImages = [];
        if (e.img && e.img.length > 0) {
            // 记录获取到的图片链接
            logger.mark(`[SF插件][gg]获取到图片链接:\n${e.img.join('\n')}`)
            // 获取所有图片数据
            for (const imgUrl of e.img) {
                const base64Image = await url2Base64(imgUrl);
                if (!base64Image) {
                    e.reply('引用的图片地址已失效，请重新发送图片', true)
                    return false
                }
                currentImages.push(base64Image);
            }
        }

        let msg = e.msg.replace(/^#(gg|GG)/, '').trim()

        // 如果有引用的文本,添加两个换行来分隔
        const quotedText = e.sourceMsg ? e.sourceMsg + '\n\n' : ''
        msg = quotedText + msg

        // 处理消息中的URL
        // logger.mark(`[SF插件][URL处理]开始处理消息中的URL: ${msg}`)
        let extractedContent = '';
        try {
            // 根据是否为图片模式决定是否在消息中显示提取的内容
            const { message: processedMsg, extractedContent: extracted } = await processMessageWithUrls(msg, !config_date.gg_useMarkdown);
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

        // 获取历史对话
        let historyMessages = []
        if (config_date.gg_useContext) {
            historyMessages = await loadContext(e.user_id, config_date.gg_usingAPI)
            logger.mark(`[SF插件][gg]加载历史对话: ${historyMessages.length / 2} 条`)
        }

        // 如果是图片模式，在发送给AI时将提取的内容加回去
        const aiMessage = config_date.gg_useMarkdown ? msg + extractedContent : msg;

        // 收集历史图片
        let historyImages = [];
        // 从历史消息中收集图片
        historyMessages.forEach(msg => {
            if (msg.imageBase64) {
                historyImages = historyImages.concat(msg.imageBase64);
            }
        });

        const opt = {
            currentImages: currentImages.length > 0 ? currentImages : undefined,
            historyImages: historyImages.length > 0 ? historyImages : undefined,
            systemPrompt: systemPrompt,
            model: model,
            useSearch: useSearch
        }

        const { answer, sources } = await this.generateGeminiPrompt(aiMessage, ggBaseUrl, ggKey, config_date, opt, historyMessages, e)

        // 保存对话记录
        if (config_date.gg_useContext) {
            // 保存用户消息
            await saveContext(e.user_id, {
                role: 'user',
                content: aiMessage,
                extractedContent: extractedContent,
                imageBase64: currentImages.length > 0 ? currentImages : undefined
            }, config_date.gg_usingAPI)
            // 保存AI回复
            await saveContext(e.user_id, {
                role: 'assistant',
                content: answer,
                sources: sources
            }, config_date.gg_usingAPI)
        }

        try {
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
                    e.reply(await common.makeForwardMsg(e, forwardMsg, `${e.sender.card || e.sender.nickname || e.user_id}的搜索结果`));
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
        logger.debug("[sf插件]API调用Gemini msg：\n" + input)

        // 获取用户名并替换prompt中的变量
        const userName = e?.sender?.card || e?.sender?.nickname || "用户";
        const systemPrompt = (opt.systemPrompt || config_date.gg_Prompt || "你是一个有用的助手，你更喜欢说中文。你会根据用户的问题，通过搜索引擎获取最新的信息来回答问题。你的回答会尽可能准确、客观。").replace(/{{user_name}}/g, userName);

        // 从opt中获取useSearch，如果未定义则从config_date中获取
        const useSearch = typeof opt.useSearch !== 'undefined' ? opt.useSearch : config_date.gg_useSearch;

        // 构造请求体
        const requestBody = {
            "systemInstruction": {
                "parts": [{
                    "text": systemPrompt
                }]
            },
            "contents": [],
            // 只有在使用gemini-2.0-flash-exp模型且开启搜索功能时才添加搜索工具
            "tools": (useSearch && opt.model === "gemini-2.0-flash-exp") ? [{
                "googleSearch": {}
            }] : []
        };

        // 添加历史对话
        if (historyMessages.length > 0) {
            requestBody.contents = formatContextForGemini(historyMessages)
        }

        // 添加当前用户输入和图片
        const currentParts = [];

        // 添加文本和当前图片
        if (opt.currentImages && opt.currentImages.length > 0) {
            currentParts.push({
                "text": "当前引用的图片:\n" + input
            });
            opt.currentImages.forEach(image => {
                currentParts.push({
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": image
                    }
                });
            });
        } else {
            currentParts.push({
                "text": input
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

        try {
            const response = await fetch(`${ggBaseUrl}/v1beta/models/${opt.model}:generateContent?key=${ggKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            })

            const data = await response.json()

            if (data?.candidates?.[0]?.content?.parts) {
                // 合并所有text部分
                let answer = data.candidates[0].content.parts
                    .map(part => part.text)
                    .join('');

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

                return { answer, sources };
            } else {
                logger.error("[sf插件]gg调用错误：\n", JSON.stringify(data, null, 2))
                return { answer: "[sf插件]gg调用错误", sources: [] };
            }
        } catch (error) {
            logger.error("[sf插件]gg调用失败\n", error)
            return { answer: "[sf插件]gg调用失败", sources: [] };
        }
    }

    async sf_end_chat(e) {
        const config_date = Config.getConfig()
        
        // 获取目标用户ID和系统类型
        const match = e.msg.match(/^#(sf|SF)结束((ss|gg)?)对话(?:(\d+))?$/)
        if (!match) return false
        
        const systemType = match[2]?.toLowerCase() // ss或gg或undefined
        let targetId = e.at  // 优先获取@的用户
        let targetName = ''
        
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
                    logger.mark(`[sf插件]获取群成员信息失败: ${error}`)
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

        // 设置对应的promptNum
        let promptNum = 0
        if (systemType === 'ss') {
            promptNum = config_date.ss_usingAPI
        } else if (systemType === 'gg') {
            promptNum = config_date.gg_usingAPI
        }
        // 如果未指定系统类型，则使用默认配置(promptNum=0)
        
        // 清除对话记录
        const success = await clearUserContext(targetId, promptNum)
        if (success) {
            const contextStatus = config_date.gg_useContext ? '' : '\n（上下文功能未开启）'
            const systemName = systemType ? systemType.toUpperCase() : '默认'
            if (targetId === e.user_id) {
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
            await e.reply('已结束所有对话，所有历史记录已清除' + `${config_date.gg_useContext ? '' : '\n（上下文功能未开启）'}`, true)
        } else {
            await e.reply('结束所有对话失败，请稍后再试', true)
        }
    }

    /** ^#(sf|SF)(清除|删除)((ss|gg)?)?(前面?|最近的?)(\\d+)条对话$ */
    async sf_clearContextByCount(e) {
        const config_date = Config.getConfig()
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

            const result = await clearContextByCount(e.user_id, parseInt(match[6]) > 0 ? parseInt(match[6]) : 1, promptNum)
            if (result.success) {
                const systemName = systemType ? systemType.toUpperCase() : '默认'
                e.reply(`[sf插件]成功删除你的${systemName}系统最近的 ${result.deletedCount} 条历史对话` + `${config_date.gg_useContext ? '' : '\n（上下文功能未开启）'}`, true)
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
        const type = e.msg.match(/^#(sf|SF)(ss|gg)/)[2].toLowerCase()
        const apiList = type === 'ss' ? config_date.ss_APIList : config_date.gg_APIList
        const currentApi = type === 'ss' ? config_date.ss_usingAPI : config_date.gg_usingAPI
        
        if (!apiList || apiList.length === 0) {
            await e.reply(`当前没有配置任何${type}接口`)
            return
        }
        
        let msg = [`当前${type}接口列表：`]
        apiList.forEach((api, index) => {
            const isUsing = currentApi === (index + 1)
            const customCmd = api.customCommand ? ` (#${type}${api.customCommand})` : ''
            const remark = api.remark ? ` - ${api.remark}` : ''
            msg.push(`${index + 1}. 接口${index + 1}${remark}${customCmd}${isUsing ? ' [当前使用]' : ''}`)
        })
        
        // 添加默认配置的状态
        if (currentApi === 0) {
            msg.push('\n当前使用：默认配置')
        }
        
        await e.reply(msg.join('\n'))
    }
    
    /** 选择使用的接口 */
    async sf_select_api(e) {
        // 读取配置
        const config_date = Config.getConfig()
        
        // 解析命令
        const match = e.msg.match(/^#(sf|SF)(ss|gg)使用接口(\d+)$/)
        const type = match[2].toLowerCase()
        const index = parseInt(match[3])
        
        // 验证索引
        const apiList = type === 'ss' ? config_date.ss_APIList : config_date.gg_APIList
        if (index < 0 || (index > 0 && (!apiList || index > apiList.length))) {
            await e.reply(`无效的接口索引，请使用 #sf${type}接口列表 查看可用的接口`)
            return
        }
        
        // 更新配置
        if (type === 'ss') {
            config_date.ss_usingAPI = index
        } else {
            config_date.gg_usingAPI = index
        }
        
        // 保存配置
        Config.setConfig(config_date)
        
        // 返回结果
        if (index === 0) {
            await e.reply(`已切换为使用${type}默认配置`)
        } else {
            const api = apiList[index - 1]
            await e.reply(`已切换为使用${type}接口：${api.remark || `接口${index}`}`)
        }
    }

    async sf_select_and_chat(e) {
        // 读取配置
        const config_date = Config.getConfig()
        
        // 获取完整消息内容
        const fullMsg = e.msg.trim()
        
        // 移除开头的 #s 或 #S
        const withoutPrefix = fullMsg.substring(2)
        
        // 尝试在配置中找到所有匹配的命令
        let matchedCmds = []
        
        if (config_date.ss_APIList) {
            // 收集所有匹配的自定义命令
            for (const api of config_date.ss_APIList) {
                if (api.customCommand && withoutPrefix.startsWith(api.customCommand)) {
                    matchedCmds.push({
                        cmd: api.customCommand,
                        content: withoutPrefix.substring(api.customCommand.length).trim()
                    })
                }
            }
            
            // 按命令长度降序排序，选择最长的匹配
            if (matchedCmds.length > 0) {
                matchedCmds.sort((a, b) => b.cmd.length - a.cmd.length)
                const { cmd: matchedCmd, content: remainingContent } = matchedCmds[0]
                
                // 如果没有内容
                if (!remainingContent) {
                    await e.reply('请输入要发送的内容')
                    return false
                }
                
                // 查找对应的接口索引
                const apiIndex = config_date.ss_APIList.findIndex(api => api.customCommand === matchedCmd)
                if (apiIndex === -1) {
                    await e.reply(`未找到命令 ${matchedCmd} 对应的接口，请使用 #sfss接口列表 查看可用的接口`)
                    return false
                }
                
                // 保存原来的设置
                const originalUsingAPI = config_date.ss_usingAPI
                
                // 临时设置当前使用的接口
                config_date.ss_usingAPI = apiIndex + 1
                Config.setConfig(config_date)
                
                try {
                    // 修改消息内容并调用ss对话
                    e.msg = '#ss ' + remainingContent
                    await this.sf_chat(e)
                } finally {
                    // 还原设置
                    config_date.ss_usingAPI = originalUsingAPI
                    Config.setConfig(config_date)
                }
                
                return true
            }
        }
        
        // 如果没找到自定义命令，尝试解析数字
        const numberMatch = withoutPrefix.match(/^(\d+)/)
        if (numberMatch) {
            const matchedCmd = numberMatch[1]
            const remainingContent = withoutPrefix.substring(numberMatch[1].length).trim()
            
            // 如果没有内容
            if (!remainingContent) {
                await e.reply('请输入要发送的内容')
                return false
            }
            
            // 验证数字是否有效
            const index = parseInt(matchedCmd)
            if (!config_date.ss_APIList || index < 0 || (index > 0 && index > config_date.ss_APIList.length)) {
                await e.reply(`无效的接口索引，请使用 #sfss接口列表 查看可用的接口`)
                return false
            }
            
            // 保存原来的设置
            const originalUsingAPI = config_date.ss_usingAPI
            
            // 临时设置当前使用的接口
            config_date.ss_usingAPI = index
            Config.setConfig(config_date)
            
            try {
                // 修改消息内容并调用ss对话
                e.msg = '#ss ' + remainingContent
                await this.sf_chat(e)
            } finally {
                // 还原设置
                config_date.ss_usingAPI = originalUsingAPI
                Config.setConfig(config_date)
            }
            
            return true
        }
        
        // 如果没找到任何匹配，提取第一个空格前的内容作为命令
        const spaceIndex = withoutPrefix.indexOf(' ')
        if (spaceIndex === -1) {
            await e.reply('请输入要发送的内容')
            return false
        }
        
        const matchedCmd = withoutPrefix.substring(0, spaceIndex)
        const remainingContent = withoutPrefix.substring(spaceIndex + 1).trim()
        
        // 如果没有内容
        if (!remainingContent) {
            await e.reply('请输入要发送的内容')
            return false
        }
        
        // 如果不是数字，查找自定义命令
        if (!config_date.ss_APIList) {
            await e.reply(`未配置任何ss接口，请先配置接口`)
            return false
        }
        const apiIndex = config_date.ss_APIList.findIndex(api => api.customCommand === matchedCmd)
        if (apiIndex === -1) {
            await e.reply(`未找到命令 ${matchedCmd} 对应的接口，请使用 #sfss接口列表 查看可用的接口`)
            return false
        }
        
        // 保存原来的设置
        const originalUsingAPI = config_date.ss_usingAPI
        
        // 临时设置当前使用的接口
        config_date.ss_usingAPI = apiIndex + 1
        Config.setConfig(config_date)
        
        try {
            // 修改消息内容并调用ss对话
            e.msg = '#ss ' + remainingContent
            await this.sf_chat(e)
        } finally {
            // 还原设置
            config_date.ss_usingAPI = originalUsingAPI
            Config.setConfig(config_date)
        }
        
        return true
    }

    async gg_select_and_chat(e) {
        // 读取配置
        const config_date = Config.getConfig()
        
        // 获取完整消息内容
        const fullMsg = e.msg.trim()
        
        // 移除开头的 #g 或 #G
        const withoutPrefix = fullMsg.substring(2)
        
        // 尝试在配置中找到所有匹配的命令
        let matchedCmds = []
        
        if (config_date.gg_APIList) {
            // 收集所有匹配的自定义命令
            for (const api of config_date.gg_APIList) {
                if (api.customCommand && withoutPrefix.startsWith(api.customCommand)) {
                    matchedCmds.push({
                        cmd: api.customCommand,
                        content: withoutPrefix.substring(api.customCommand.length).trim()
                    })
                }
            }
            
            // 按命令长度降序排序，选择最长的匹配
            if (matchedCmds.length > 0) {
                matchedCmds.sort((a, b) => b.cmd.length - a.cmd.length)
                const { cmd: matchedCmd, content: remainingContent } = matchedCmds[0]
                
                // 如果没有内容
                if (!remainingContent) {
                    await e.reply('请输入要发送的内容')
                    return false
                }
                
                // 查找对应的接口索引
                const apiIndex = config_date.gg_APIList.findIndex(api => api.customCommand === matchedCmd)
                if (apiIndex === -1) {
                    await e.reply(`未找到命令 ${matchedCmd} 对应的接口，请使用 #sfgg接口列表 查看可用的接口`)
                    return false
                }
                
                // 保存原来的设置
                const originalUsingAPI = config_date.gg_usingAPI
                
                // 临时设置当前使用的接口
                config_date.gg_usingAPI = apiIndex + 1
                Config.setConfig(config_date)
                
                try {
                    // 修改消息内容并调用gg对话
                    e.msg = '#gg ' + remainingContent
                    await this.gg_chat(e)
                } finally {
                    // 还原设置
                    config_date.gg_usingAPI = originalUsingAPI
                    Config.setConfig(config_date)
                }
                
                return true
            }
        }
        
        // 如果没找到自定义命令，尝试解析数字
        const numberMatch = withoutPrefix.match(/^(\d+)/)
        if (numberMatch) {
            const matchedCmd = numberMatch[1]
            const remainingContent = withoutPrefix.substring(numberMatch[1].length).trim()
            
            // 如果没有内容
            if (!remainingContent) {
                await e.reply('请输入要发送的内容')
                return false
            }
            
            // 验证数字是否有效
            const index = parseInt(matchedCmd)
            if (!config_date.gg_APIList || index < 0 || (index > 0 && index > config_date.gg_APIList.length)) {
                await e.reply(`无效的接口索引，请使用 #sfgg接口列表 查看可用的接口`)
                return false
            }
            
            // 保存原来的设置
            const originalUsingAPI = config_date.gg_usingAPI
            
            // 临时设置当前使用的接口
            config_date.gg_usingAPI = index
            Config.setConfig(config_date)
            
            try {
                // 修改消息内容并调用gg对话
                e.msg = '#gg ' + remainingContent
                await this.gg_chat(e)
            } finally {
                // 还原设置
                config_date.gg_usingAPI = originalUsingAPI
                Config.setConfig(config_date)
            }
            
            return true
        }
        
        // 如果没找到任何匹配，提取第一个空格前的内容作为命令
        const spaceIndex = withoutPrefix.indexOf(' ')
        if (spaceIndex === -1) {
            await e.reply('请输入要发送的内容')
            return false
        }
        
        const matchedCmd = withoutPrefix.substring(0, spaceIndex)
        const remainingContent = withoutPrefix.substring(spaceIndex + 1).trim()
        
        // 如果没有内容
        if (!remainingContent) {
            await e.reply('请输入要发送的内容')
            return false
        }
        
        // 如果不是数字，查找自定义命令
        if (!config_date.gg_APIList) {
            await e.reply(`未配置任何gg接口，请先配置接口`)
            return false
        }
        const apiIndex = config_date.gg_APIList.findIndex(api => api.customCommand === matchedCmd)
        if (apiIndex === -1) {
            await e.reply(`未找到命令 ${matchedCmd} 对应的接口，请使用 #sfgg接口列表 查看可用的接口`)
            return false
        }
        
        // 保存原来的设置
        const originalUsingAPI = config_date.gg_usingAPI
        
        // 临时设置当前使用的接口
        config_date.gg_usingAPI = apiIndex + 1
        Config.setConfig(config_date)
        
        try {
            // 修改消息内容并调用gg对话
            e.msg = '#gg ' + remainingContent
            await this.gg_chat(e)
        } finally {
            // 还原设置
            config_date.gg_usingAPI = originalUsingAPI
            Config.setConfig(config_date)
        }
        
        return true
    }

    async sf_select_and_end_chat(e) {
        // 读取配置
        const config_date = Config.getConfig()
        
        // 获取完整消息内容
        const fullMsg = e.msg.trim()
        
        // 移除开头的 #s 或 #S
        const withoutPrefix = fullMsg.substring(2)
        
        // 移除结尾的 "结束对话" 和可能的数字
        const endChatIndex = withoutPrefix.indexOf('结束对话')
        if (endChatIndex === -1) {
            logger.error('[sf插件] 命令格式错误')
            return false
        }
        
        // 提取命令部分和可能的数字
        const cmdPart = withoutPrefix.substring(0, endChatIndex).trim()
        const afterEndChat = withoutPrefix.substring(endChatIndex + 4)
        const numberMatch = afterEndChat.match(/(\d+)/)
        const number = numberMatch ? numberMatch[1] : ''
        
        // 尝试在配置中找到所有匹配的命令
        let matchedCmds = []
        
        if (config_date.ss_APIList) {
            // 收集所有匹配的自定义命令
            for (const api of config_date.ss_APIList) {
                if (api.customCommand && cmdPart === api.customCommand) {
                    matchedCmds.push(api.customCommand)
                }
            }
            
            // 按命令长度降序排序，选择最长的匹配
            if (matchedCmds.length > 0) {
                matchedCmds.sort((a, b) => b.length - a.length)
                const matchedCmd = matchedCmds[0]
                
                // 查找对应的接口索引
                const apiIndex = config_date.ss_APIList.findIndex(api => api.customCommand === matchedCmd)
                if (apiIndex === -1) {
                    await e.reply(`未找到命令 ${matchedCmd} 对应的接口，请使用 #sfss接口列表 查看可用的接口`)
                    return false
                }
                
                // 保存原来的设置
                const originalUsingAPI = config_date.ss_usingAPI
                
                // 临时设置当前使用的接口
                config_date.ss_usingAPI = apiIndex + 1
                Config.setConfig(config_date)
                
                try {
                    // 修改消息内容并调用结束对话
                    e.msg = '#sf结束ss对话' + (number ? number : '')
                    await this.sf_end_chat(e)
                } finally {
                    // 还原设置
                    config_date.ss_usingAPI = originalUsingAPI
                    Config.setConfig(config_date)
                }
                
                return true
            }
        }
        
        // 如果没找到自定义命令，尝试解析数字
        const index = parseInt(cmdPart)
        if (!isNaN(index)) {
            // 如果是数字，使用原来的逻辑
            if (!config_date.ss_APIList || index < 0 || (index > 0 && index > config_date.ss_APIList.length)) {
                await e.reply(`无效的接口索引，请使用 #sfss接口列表 查看可用的接口`)
                return false
            }
            
            // 保存原来的设置
            const originalUsingAPI = config_date.ss_usingAPI
            
            // 临时设置当前使用的接口
            config_date.ss_usingAPI = index
            Config.setConfig(config_date)
            
            try {
                // 修改消息内容并调用结束对话
                e.msg = '#sf结束ss对话' + (number ? number : '')
                await this.sf_end_chat(e)
            } finally {
                // 还原设置
                config_date.ss_usingAPI = originalUsingAPI
                Config.setConfig(config_date)
            }
            
            return true
        }
        
        // 如果不是数字，查找自定义命令
        if (!config_date.ss_APIList) {
            await e.reply(`未配置任何ss接口，请先配置接口`)
            return false
        }
        const apiIndex = config_date.ss_APIList.findIndex(api => api.customCommand === cmdPart)
        if (apiIndex === -1) {
            await e.reply(`未找到命令 ${cmdPart} 对应的接口，请使用 #sfss接口列表 查看可用的接口`)
            return false
        }
        
        // 保存原来的设置
        const originalUsingAPI = config_date.ss_usingAPI
        
        // 临时设置当前使用的接口
        config_date.ss_usingAPI = apiIndex + 1
        Config.setConfig(config_date)
        
        try {
            // 修改消息内容并调用结束对话
            e.msg = '#sf结束ss对话' + (number ? number : '')
            await this.sf_end_chat(e)
        } finally {
            // 还原设置
            config_date.ss_usingAPI = originalUsingAPI
            Config.setConfig(config_date)
        }
        
        return true
    }

    async gg_select_and_end_chat(e) {
        // 读取配置
        const config_date = Config.getConfig()
        
        // 获取完整消息内容
        const fullMsg = e.msg.trim()
        
        // 移除开头的 #g 或 #G
        const withoutPrefix = fullMsg.substring(2)
        
        // 移除结尾的 "结束对话" 和可能的数字
        const endChatIndex = withoutPrefix.indexOf('结束对话')
        if (endChatIndex === -1) {
            logger.error('[sf插件] 命令格式错误')
            return false
        }
        
        // 提取命令部分和可能的数字
        const cmdPart = withoutPrefix.substring(0, endChatIndex).trim()
        const afterEndChat = withoutPrefix.substring(endChatIndex + 4)
        const numberMatch = afterEndChat.match(/(\d+)/)
        const number = numberMatch ? numberMatch[1] : ''
        
        // 尝试在配置中找到所有匹配的命令
        let matchedCmds = []
        
        if (config_date.gg_APIList) {
            // 收集所有匹配的自定义命令
            for (const api of config_date.gg_APIList) {
                if (api.customCommand && cmdPart === api.customCommand) {
                    matchedCmds.push(api.customCommand)
                }
            }
            
            // 按命令长度降序排序，选择最长的匹配
            if (matchedCmds.length > 0) {
                matchedCmds.sort((a, b) => b.length - a.length)
                const matchedCmd = matchedCmds[0]
                
                // 查找对应的接口索引
                const apiIndex = config_date.gg_APIList.findIndex(api => api.customCommand === matchedCmd)
                if (apiIndex === -1) {
                    await e.reply(`未找到命令 ${matchedCmd} 对应的接口，请使用 #sfgg接口列表 查看可用的接口`)
                    return false
                }
                
                // 保存原来的设置
                const originalUsingAPI = config_date.gg_usingAPI
                
                // 临时设置当前使用的接口
                config_date.gg_usingAPI = apiIndex + 1
                Config.setConfig(config_date)
                
                try {
                    // 修改消息内容并调用结束对话
                    e.msg = '#sf结束gg对话' + (number ? number : '')
                    await this.sf_end_chat(e)
                } finally {
                    // 还原设置
                    config_date.gg_usingAPI = originalUsingAPI
                    Config.setConfig(config_date)
                }
                
                return true
            }
        }
        
        // 如果没找到自定义命令，尝试解析数字
        const index = parseInt(cmdPart)
        if (!isNaN(index)) {
            // 如果是数字，使用原来的逻辑
            if (!config_date.gg_APIList || index < 0 || (index > 0 && index > config_date.gg_APIList.length)) {
                await e.reply(`无效的接口索引，请使用 #sfgg接口列表 查看可用的接口`)
                return false
            }
            
            // 保存原来的设置
            const originalUsingAPI = config_date.gg_usingAPI
            
            // 临时设置当前使用的接口
            config_date.gg_usingAPI = index
            Config.setConfig(config_date)
            
            try {
                // 修改消息内容并调用结束对话
                e.msg = '#sf结束gg对话' + (number ? number : '')
                await this.sf_end_chat(e)
            } finally {
                // 还原设置
                config_date.gg_usingAPI = originalUsingAPI
                Config.setConfig(config_date)
            }
            
            return true
        }
        
        // 如果不是数字，查找自定义命令
        if (!config_date.gg_APIList) {
            await e.reply(`未配置任何gg接口，请先配置接口`)
            return false
        }
        const apiIndex = config_date.gg_APIList.findIndex(api => api.customCommand === cmdPart)
        if (apiIndex === -1) {
            await e.reply(`未找到命令 ${cmdPart} 对应的接口，请使用 #sfgg接口列表 查看可用的接口`)
            return false
        }
        
        // 保存原来的设置
        const originalUsingAPI = config_date.gg_usingAPI
        
        // 临时设置当前使用的接口
        config_date.gg_usingAPI = apiIndex + 1
        Config.setConfig(config_date)
        
        try {
            // 修改消息内容并调用结束对话
            e.msg = '#sf结束gg对话' + (number ? number : '')
            await this.sf_end_chat(e)
        } finally {
            // 还原设置
            config_date.gg_usingAPI = originalUsingAPI
            Config.setConfig(config_date)
        }
        
        return true
    }
}
