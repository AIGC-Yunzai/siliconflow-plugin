
import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import Config from '../components/Config.js'
import common from '../../../lib/common/common.js';
import {
    parseSourceImg,
    url2Base64,
} from '../utils/getImg.js'
import { handleParam } from '../utils/parse.js'

export class SF_Painting extends plugin {
    constructor() {
        super({
            name: 'SF_Painting插件',
            dsc: 'SF_Painting生成图片',
            event: 'message',
            priority: 6,
            rule: [
                {
                    reg: '^#(flux|FLUX|(sf|SF)(画图|绘图|绘画))(.*)$',
                    fnc: 'sf_draw'
                },
                {
                    reg: '^#(sf|SF|siliconflow|硅基流动)设置(画图key|翻译key|翻译baseurl|翻译模型|生成提示词|推理步数|fish发音人)\\s*(.*)$',
                    fnc: 'sf_setConfig',
                    permission: 'master'
                },
                {
                    reg: '^#(sf|SF|siliconflow|硅基流动)设置帮助$',
                    fnc: 'sf_help',
                    permission: 'master'
                },
                {
                    reg: '^#(ss|SS)[sS]*',
                    fnc: 'sf_chat',
                },
                {
                    reg: '^#搜索fish发音人(.*)$',
                    fnc: 'searchFishVoices'
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
        const match = e.msg.match(/^#(sf|SF|siliconflow|硅基流动)设置(画图key|翻译key|翻译baseurl|翻译模型|生成提示词|推理步数|fish发音人)\s*(.*)$/)
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
                    config_date.generatePrompt = value.toLowerCase() === '开'
                    break
                case '推理步数':
                    config_date.num_inference_steps = parseInt(value)
                    break
                case 'fish发音人':
                    config_date.fish_reference_id = value
                    break
                default:
                    return
            }
            Config.setConfig(config_date)
            await this.reply(`${type}已设置：${value}`)
        }
        return
    }

    async sf_draw(e) {
        // 读取配置
        const config_date = Config.getConfig()
        e.sfRuntime = { config: config_date }
        // logger.mark("draw方法被调用，消息内容:", e.msg)

        if (config_date.sf_keys.length == 0) {
            await this.reply('请先设置画图API Key。使用命令：#sf设置画图key [值]（仅限主人设置）')
            return false
        }

        // 处理图生图模型
        let canImg2Img = false;
        if (config_date.imageModel.match(/stabilityai\/stable-diffusion-3-medium|stabilityai\/stable-diffusion-xl-base-1.0|stabilityai\/stable-diffusion-2-1/)) {
            canImg2Img = true;
        }

        // 处理引用图片
        await parseSourceImg(e)
        let souce_image_base64
        if (e.img && canImg2Img) {
            souce_image_base64 = await url2Base64(e.img[0])
            if (!souce_image_base64) {
                this.reply('引用的图片地址已失效，请重新发送图片', true)
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
                this.reply(`@${e.sender.card || e.sender.nickname} ${e.user_id}正在为您生成提示词并绘图...`)
                onleReplyOnce++
            }
            finalPrompt = await this.generatePrompt(userPrompt, use_sf_key, config_date)
            if (!finalPrompt) {
                await this.reply('生成提示词失败，请稍后再试。')
                return false
            }
        }
        if (!onleReplyOnce && !config_date.simpleMode) {
            this.reply(`@${e.sender.card || e.sender.nickname} ${e.user_id}正在为您生成图片...`)
            onleReplyOnce++
        }

        logger.mark("[sf插件]开始图片生成API调用")
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
                    this.reply(msgx)
                } else {
                    const msgx = await common.makeForwardMsg(e, [str_1, str_2, str_3], `${e.sender.card || e.sender.nickname} 的${canImg2Img ? "图生图" : "文生图"}`)
                    this.reply(msgx)
                    this.reply({ ...segment.image(imageUrl), origin: true })
                }

                return true;
            } else {
                logger.error("[sf插件]返回错误：\n", data)
                this.reply(`生成图片失败：${data.message || '未知错误'}`)
                return false;
            }
        } catch (error) {
            logger.error("[sf插件]API调用失败\n", error)
            this.reply('生成图片时遇到了一个错误，请稍后再试。')
            return false;
        }
    }

    async searchFishVoices(e) {
        // 读取配置
        const config_date = Config.getConfig()

        if (config_date.fishApiKey.length == 0) {
            e.reply("请先在锅巴中设置fish.audio的Api Key", true);
            return
        }
        const keyword = e.msg.replace(/^#搜索fish发音人/, '').trim();

        const options = {
            method: 'GET',
            headers: { Authorization: `Bearer ${config_date.fishApiKey}` }
        };

        let optionMsg = "可用指令：#sf设置fish发音人"
        let msgArr = [`Fish发音人：`];
        await fetch(`https://api.fish.audio/model?tag=${encodeURIComponent(keyword)}`, options)
            .then(response => response.json())
            .then(response => {
                for (let index = 0; index < response.total; index++) {
                    if (0 == index) optionMsg += response.items[0]._id
                    msgArr.push(`名称：${response.items[index].title}\n发音人ID：${response.items[index]._id}`)
                }
            })
            .catch(err => logger.error(err));

        msgArr.push(optionMsg)
        const msgx = await common.makeForwardMsg(e, msgArr, `Fish发音人`)
        await e.reply(msgx, true);
    }

    async sf_chat(e) {
        // 读取配置
        const config_date = Config.getConfig()

        if (config_date.sf_keys.length == 0) {
            await this.reply('请先设置API Key。使用命令：#sf设置画图key [值]（仅限主人设置）')
            return false
        }

        let msg = e.msg.replace(/^#(sf|SF)/, '').trim()
        const use_sf_key = this.get_use_sf_key(config_date);

        const answer = await this.generatePrompt(msg, use_sf_key, config_date, true)

        this.reply(answer, true)
    }


    /**
     * @description: 自动提示词
     * @param {*} input
     * @param {*} use_sf_key
     * @param {*} config_date
     * @param {*} forChat 聊天调用
     * @return {string}
     */
    async generatePrompt(input, use_sf_key, config_date, forChat = false) {
        if (config_date.sf_keys.length == 0) {
            return input
        }

        logger.info("[sf插件]API调用LLM")
        try {
            const response = await fetch(`${config_date.sfBaseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${use_sf_key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    "model": config_date.translateModel,
                    "messages": [
                        {
                            "role": "system",
                            "content": !forChat ? config_date.sf_textToPaint_Prompt : "请回答我"
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
                return !forChat ? input : "[sf插件]LLM调用错误"
            }
        } catch (error) {
            logger.error("[sf插件]LLM调用失败\n", error)
            return !forChat ? input : "[sf插件]LLM调用失败"
        }
    }

    async sf_help(e) {
        const helpMessage = `
SF插件设置帮助：
1. 设置画图API Key：#flux设置画图key [值]
2. 设置翻译模型：#flux设置翻译模型 [模型名]
3. 开关提示词生成：#flux设置生成提示词 开/关
4. 开关提示词生成：#flux设置推理步数 [值]
5. 查看帮助：#sf帮助

注意：设置命令仅限主人使用。
可用别名：#flux绘画
        `.trim()

        await this.reply(helpMessage)
    }
}
