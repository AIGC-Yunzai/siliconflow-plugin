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

export class SF_Painting extends plugin {
    constructor() {
        super({
            name: 'SF_Painting插件',
            dsc: 'SF_Painting生成图片',
            event: 'message',
            priority: 6,
            rule: [
                {
                    reg: '^#(flux|FLUX|(sf|SF)(画图|绘图|绘画))',
                    fnc: 'sf_draw'
                },
                {
                    reg: '^#(sf|SF|siliconflow|硅基流动)设置(画图key|翻译key|翻译baseurl|翻译模型|生成提示词|推理步数|fish发音人|markdown开关)',
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
            ]
        })
        this.sf_keys_index = -1
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

    async sf_setConfig(e) {
        // 读取配置
        let config_date = Config.getConfig()
        const match = e.msg.match(/^#(sf|SF|siliconflow|硅基流动)设置(画图key|翻译key|翻译baseurl|翻译模型|生成提示词|推理步数|fish发音人|markdown开关)([\s\S]*)/)
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
                case 'markdown开关':
                    config_date.ss_useMarkdown = value === '开'
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

        let use_sf_key = "", apiBaseUrl = "", model = ""
        if (config_date.ss_apiBaseUrl) {
            use_sf_key = config_date.ss_Key;
            apiBaseUrl = config_date.ss_apiBaseUrl;
            model = config_date.ss_model || "gpt-4";
        } else if (config_date.sf_keys.length == 0) {
            await e.reply('请先设置API Key。使用命令：#sf设置画图key [值]（仅限主人设置）')
            return false
        } else {
            use_sf_key = this.get_use_sf_key(config_date);
        }

        let msg = e.msg.replace(/^#(ss|SS)/, '').trim()

        const answer = await this.generatePrompt(msg, use_sf_key, config_date, true, apiBaseUrl, model)

        // 获取markdown开关配置，默认为false
        const useMarkdown = config_date?.ss_useMarkdown ?? false

        try {
            if (useMarkdown) {
                const img = await markdown_screenshot(e.user_id, e.self_id, e.img ? e.img.map(url => `<img src="${url}" width="256">`).join('\n') + "\n\n" + msg : msg, answer);
                if (img) {
                    await e.reply({ ...img, origin: true }, true)
                } else {
                    logger.error('[sf插件] markdown图片生成失败')
                }
                e.reply(await common.makeForwardMsg(e, [answer], (e.sender.card || e.sender.nickname || e.user_id) + "：" + msg.substring(0, 50)));
            } else {
                await e.reply(answer, true)
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
     * @return {string}
     */
    async generatePrompt(input, use_sf_key, config_date, forChat = false, apiBaseUrl = "", model = "") {
        if (config_date.sf_keys.length == 0) {
            return input
        }

        logger.debug("[sf插件]API调用LLM msg：\n" + input)
        try {
            const response = await fetch(`${apiBaseUrl || config_date.sfBaseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${use_sf_key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    "model": model || config_date.translateModel,
                    "messages": [
                        {
                            "role": "system",
                            "content": !forChat ? config_date.sf_textToPaint_Prompt : config_date.ss_Prompt || "You are a helpful assistant, you prefer to speak Chinese"
                        },
                        {
                            "role": "user",
                            "content": input
                        }
                    ],
                    "stream": false
                })
            })

            const data = await response.json()

            if (data?.choices?.[0]?.message?.content) {
                return data.choices[0].message.content
            } else {
                logger.error("[sf插件]LLM调用错误：\n", data)
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
5. 设置对话显示：#sf设置markdown开关 开/关
6. 查看帮助：#sf帮助

注意：设置命令仅限主人使用。
可用别名：#flux绘画
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
                logger.error("[sf插件]返回错误：\n", data)
                e.reply(`生成图片失败：${data.message || '未知错误'}`)
                return false;
            }
        } catch (error) {
            logger.error("[sf插件]API调用失败\n", error)
            e.reply('生成图片时遇到了一个错误，请稍后再试。')
            return false;
        }
    }
}
