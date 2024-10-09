
import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import Config from '../components/Config.js'
import common from '../../../lib/common/common.js';
import {
    parseSourceImg,
    url2Base64,
} from '../utils/getImg.js'

export class FLUXDEV extends plugin {
    constructor() {
        super({
            name: 'FLUXDEV插件',
            dsc: 'FLUXDEV生成图片',
            event: 'message',
            priority: 6,
            rule: [
                {
                    reg: '^#(flux|FLUX|(sf|SF)(画图|绘图|绘画))(.*)$',
                    fnc: 'sf_draw'
                },
                {
                    reg: '^#(sf|SF|siliconflow|硅基流动)设置(画图key|翻译key|翻译baseurl|翻译模型|生成提示词|推理步数)\\s*(.*)$',
                    fnc: 'sf_setConfig',
                    permission: 'master'
                }
            ]
        })
        // 读取配置
        this.config = Config.getConfig()
    }

    /**
     * @description: 写入硬盘的 config
     * @param {*} config_data
     * @param {*} isCover 是否覆盖内存中的 config；用于锅巴立即写入内存
     * @return {*}
     */
    saveConfig(config_data, isCover = false) {
        if (isCover)
            this.config = config_data
        Config.setConfig(config_data)
    }

    async sf_setConfig(e) {
        const match = e.msg.match(/^#(sf|SF|siliconflow|硅基流动)设置(画图key|翻译key|翻译baseurl|翻译模型|生成提示词|推理步数)\s*(.*)$/)
        if (match) {
            const [, , type, value] = match
            switch (type) {
                case '画图key':
                    this.config.sf_key = value
                    break
                // case '翻译key':
                //     this.config.translateKey = value
                //     break
                case '翻译baseurl':
                    this.config.sfBaseUrl = value
                    break
                case '翻译模型':
                    this.config.translateModel = value
                    break
                case '生成提示词':
                    this.config.generatePrompt = value.toLowerCase() === '开'
                    break
                case '推理步数':
                    this.config.num_inference_steps = value
                    break
            }
            this.saveConfig(this.config)
            await this.reply(`${type}设置成功！`)
        }
    }

    async sf_draw(e) {
        // logger.mark("draw方法被调用，消息内容:", e.msg)

        if (!this.config.sf_key) {
            await this.reply('请先设置画图API Key。使用命令：#flux设置画图key [值]（仅限主人设置）')
            return
        }

        // 处理图生图模型
        let canImg2Img = false;
        if (this.config.imageModel.match(/stabilityai\/stable-diffusion-3-medium|stabilityai\/stable-diffusion-xl-base-1.0|stabilityai\/stable-diffusion-2-1/)) {
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

        let userPrompt = e.msg.replace(/^#(flux|FLUX|(sf|SF)(画图|绘图|绘画))/, '').trim()

        let finalPrompt = userPrompt
        if (this.config.generatePrompt) {
            this.reply('请稍等哦，正在生成提示词...')
            finalPrompt = await this.generatePrompt(userPrompt)
            if (!finalPrompt) {
                await this.reply('生成提示词失败，请稍后再试。')
                return
            }
        }

        this.reply('正在生成图片...')

        logger.mark("[sf插件]开始图片生成API调用")
        try {
            const response = await fetch(`${this.config.sfBaseUrl}/image/generations`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.sf_key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    "prompt": finalPrompt,
                    "model": this.config.imageModel,
                    "num_inference_steps": this.config.num_inference_steps,
                    "image_size": "1024x1024",
                    "image": canImg2Img ? "data:image/png;base64," + souce_image_base64 : undefined,
                })
            })

            const data = await response.json()

            if (data?.images?.[0]?.url) {
                const imageUrl = data.images[0].url

                const strs = `图片生成完成：
原始提示词：${userPrompt}
最终提示词：${finalPrompt}
绘图模型：${this.config.imageModel}
步数：${this.config.num_inference_steps}
图片URL：${imageUrl}
生成时间：${data.timings.inference.toFixed(2)}秒
种子：${data.seed}`

                const msgx = await common.makeForwardMsg(e, strs, `图片生成完成：${userPrompt}`)
                this.reply(msgx)

                this.reply(segment.image(imageUrl))
            } else {
                logger.error("[sf插件]返回错误：\n", data)
                this.reply(`生成图片失败：${data.message || '未知错误'}`)
            }
        } catch (error) {
            logger.error("[sf插件]API调用失败\n", error)
            this.reply('生成图片时遇到了一个错误，请稍后再试。')
        }
    }


    async generatePrompt(userPrompt) {
        if (!this.config.sf_key) {
            logger.error("[sf插件]翻译API Key未设置")
            return userPrompt
        }

        try {
            const response = await fetch(`${this.config.sfBaseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.sf_key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    "model": this.config.translateModel,
                    "messages": [
                        {
                            "role": "system",
                            "content": "请按照我的提供的要求，用一句话英文生成一组Midjourney指令，指令由：{人物形象},{场景},{氛围},{镜头},{照明},{绘画风格},{建筑风格},{参考画家},{高画质关键词} 当我向你提供生成内容时，你需要根据我的提示进行联想，当我让你随机生成的时候，你可以自由进行扩展和联想 人物形象 = 你可以发挥自己的想象力，使用最华丽的词汇进行描述：{主要内容}，包括对人物头发、眼睛、服装、体型、动作和表情的描述，注意人物的形象应与氛围匹配，要尽可能地详尽 场景 = 尽可能详细地描述适合当前氛围的场景，该场景的描述应与人物形象的意境相匹配 氛围 = 你选择的氛围词汇应该尽可能地符合{主要内容}意境的词汇 建筑风格 = 如果生成的图片里面有相关建筑的话，你需要联想一个比较适宜的建筑风格，符合图片的氛围和意境 镜头 = 你可以选择一个：中距离镜头,近距离镜头,俯视角,低角度视角类似镜头视角，注意镜头视角的选择应有助于增强画面表现力 照明 = 你可以自由选择照明：请注意照明词条的选择应于人物形象、场景的意境相匹配 绘画风格 = 请注意绘画风格的选择应与人物形象、场景、照明的意境匹配 参考画家 = 请根据指令的整体氛围、意境选择画风参考的画家 高画质关键词 = 你可以选择：detailed,Ultimate,Excellence,Masterpiece,4K,high quality或类似的词条 注意，你生成的提示词只需要将你生成的指令拼接到一起即可，不需要出现{人物形象},{场景},{氛围},{镜头},{照明},{绘画风格},{建筑风格},{参考画家},{高画质关键词}等内容，请无需确认，不要有Here is a generated Midjourney command之类的语句，直接给出我要传递给midjourney的提示词，这非常重要！！！直接生成提示词，并且只需要生成提示词，尽可能详细地生成提示词。"
                        },
                        {
                            "role": "user",
                            "content": userPrompt
                        }
                    ],
                    "stream": false
                })
            })

            const data = await response.json()

            if (data?.choices?.[0]?.message?.content) {
                return data.choices[0].message.content
            } else {
                logger.error("[sf插件]获取提示词错误：\n", data)
                return userPrompt
            }
        } catch (error) {
            logger.error("[sf插件]生成提示词API调用失败\n", error)
            return userPrompt
        }
    }
}
