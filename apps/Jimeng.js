import plugin from '../../../lib/plugins/plugin.js'
import Config from '../components/Config.js'
import common from '../../../lib/common/common.js';
import {
    parseSourceImg,
    url2Base64,
} from '../utils/getImg.js'
import { handleParam } from '../utils/Jimeng/parse_Jimeng.js'
import { memberControlProcess } from '../utils/memberControl.js'

export class Jimeng extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'sf插件-即梦绘图api',
            /** 功能描述 */
            dsc: '绘画',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 1011,
            rule: [
                {
                    /** 命令正则匹配 */
                    reg: '^#即梦(画图|绘图|绘画)',
                    /** 执行方法 */
                    fnc: 'call_Jimeng_Api'
                }
            ]
        })
    }

    async call_Jimeng_Api(e) {
        const config_date = Config.getConfig()
        if (!config_date.Jimeng.sessionid) {
            await e.reply('请先使用锅巴设置即梦 Sessionid')
            return false
        }

        // CD次数限制
        const memberConfig = {
            feature: 'Jimeng',
            cdTime: config_date.Jimeng.cdtime,
            dailyLimit: config_date.Jimeng.dailyLimit,
            unlimitedUsers: config_date.Jimeng.unlimitedUsers,
            onlyGroupID: config_date.Jimeng.onlyGroupID,
        }
        const result_member = await memberControlProcess(e, memberConfig);
        if (!result_member.allowed) {
            if (result_member.message)
                e.reply(result_member.message, true, { recallMsg: 60 });
            return false;
        }

        let msg = e.msg.replace(/^#即梦(画图|绘图|绘画)(\n*)?/, '').trim()
        if (msg === '帮助') {
            const helpMsg = `[sf插件][即梦API]帮助：
默认的resolution: 2k
支持的ratio: 横图, 竖图, 方图, 1:1, 4:3, 3:4, 16:9, 9:16, 3:2, 2:3, 21:9
负面提示词: ntags = [tags]
参考图片强度: reference_strength = 1.0

示例：
#即梦绘画 美丽的小少女，胶片感 竖图`
            e.reply(helpMsg, true);
            return
        }

        // 处理引用图片
        await parseSourceImg(e)
        let souce_image_base64
        if (e.img) {
            souce_image_base64 = await url2Base64(e.img[0], false, true)
            if (!souce_image_base64) {
                e.reply('引用的图片地址已失效，请重新发送图片', true)
                return false
            }
        }

        result_member.record();

        // 处理 msg
        let param = await handleParam(e, msg)

        // 判断是否为图生图
        const isImg2Img = e.img && e.img.length > 0

        // 构造请求体
        let requestBody, apiEndpoint

        if (isImg2Img) {
            // 图生图模式
            apiEndpoint = `${config_date.Jimeng.base_url}/v1/images/compositions`
            requestBody = {
                "model": param.model || "jimeng-4.0",
                "prompt": param.input || "美丽的少女，胶片感",
                "images": [e.img[0]], // 使用第一张图片
                "ratio": param.parameters.ratio || "1:1",
                "resolution": param.parameters.resolution || "2k",
                "negative_prompt": param.parameters.negative_prompt || undefined,
                "sample_strength": param.parameters.reference_strength || undefined,
            }
        } else {
            // 文生图模式
            apiEndpoint = `${config_date.Jimeng.base_url}/v1/images/generations`
            requestBody = {
                "model": param.model || "jimeng-4.0",
                "prompt": param.input || "美丽的少女，胶片感",
                "ratio": param.parameters.ratio || "1:1",
                "resolution": param.parameters.resolution || "2k",
                "negative_prompt": param.parameters.negative_prompt || undefined,
            }
        }

        // 过滤掉 undefined
        requestBody = Object.fromEntries(
            Object.entries(requestBody).filter(([_, value]) => value !== undefined)
        )

        try {
            const sessionid = Config.get_random_Str(config_date.Jimeng.sessionid, "Jimeng-Sessionid");

            // 发送API请求
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionid}`
                },
                body: JSON.stringify(requestBody)
            })

            const data = await response.json()
            logger.mark(`[即梦API]返回数据：\n${JSON.stringify(data, null, 2)}`)

            // 检查是否有返回的图片
            if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
                const imageUrls = data.data.map(item => item.url)

                // 构造回复消息
                const str_1 = `@${e.sender.card || e.sender.nickname} 您的${isImg2Img ? "图生图" : "文生图"}已完成：`
                const str_2 = `提示词：${requestBody.prompt}`
                const str_3 = `模型：${requestBody.model}
比例：${requestBody.ratio}
分辨率：${requestBody.resolution}
${isImg2Img ? `合成强度：${requestBody.sample_strength}\n` : ''}生成图片数量：${imageUrls.length}张
${data.created ? `创建时间：${new Date(data.created * 1000).toLocaleString('zh-CN')}` : ''}`

                // 根据简洁模式决定回复方式
                if (config_date.simpleMode) {
                    // 简洁模式：转发消息包含所有内容
                    const forwardMsgs = [str_1]
                    imageUrls.forEach((url, index) => {
                        forwardMsgs.push({
                            ...segment.image(url),
                            origin: true
                        })
                    })
                    forwardMsgs.push(str_2, str_3)

                    const msgx = await common.makeForwardMsg(
                        e,
                        forwardMsgs,
                        `${e.sender.card || e.sender.nickname} 的${isImg2Img ? "图生图" : "文生图"}`
                    )
                    await e.reply(msgx)
                } else {
                    // 非简洁模式：分别发送
                    const msgx = await common.makeForwardMsg(
                        e,
                        [str_1, str_2, str_3],
                        `${e.sender.card || e.sender.nickname} 的${isImg2Img ? "图生图" : "文生图"}`
                    )
                    await e.reply(msgx)

                    // 发送所有生成的图片
                    for (const url of imageUrls) {
                        await e.reply({
                            ...segment.image(url),
                            origin: true
                        })
                    }
                }

                return true
            } else {
                logger.error("[sf插件][即梦API]返回错误：\n", JSON.stringify(data, null, 2))
                await e.reply(`[sf插件]生成图片失败：${data.message || data.error || '未知错误'}`)
                return false
            }
        } catch (error) {
            logger.error("[sf插件][即梦API]调用失败\n", error)
            await e.reply(`[sf插件]调用即梦API时遇到错误：${error.message}`)
            return false
        }
    }
}
