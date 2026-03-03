import plugin from '../../../lib/plugins/plugin.js'
import Config from '../components/Config.js'
import common from '../../../lib/common/common.js'
import {
    parseSourceImg,
    url2Base64,
    getMediaFrom_awaitContext,
} from '../utils/getImg.js'
import { memberControlProcess } from '../utils/memberControl.js'
import { applyPresets } from '../utils/applyPresets.js'
import { handleParam } from '../utils/Jimeng/parse_Jimeng.js'
import {
    getConversationId,
    saveConversationId,
    deleteConversationId,
    hasActiveConversation
} from '../utils/doubaoContext.js'

export class Doubao extends plugin {
    constructor() {
        super({
            name: 'sf插件-豆包api',
            dsc: '豆包对话和绘画功能',
            event: 'message',
            priority: 1011,
            rule: [
                // { // 该API已失效，将于一个月后移除源码和配置文件
                //     reg: '^#豆包(对话|聊天)',
                //     fnc: 'doubaoChat'
                // },
                // {
                //     reg: '^#豆包绘画',
                //     fnc: 'doubaoPainting'
                // },
                // {
                //     reg: '^#豆包结束对话',
                //     fnc: 'endConversation'
                // },
            ]
        })
    }

    /**
     * 豆包对话功能
     */
    async doubaoChat(e) {
        let msg = e.msg.replace(/^#豆包(对话|聊天)(\n*)?/, '').trim()
        if (msg === '帮助') {
            const helpMsg = `[sf插件][豆包对话]帮助：
 支持图文对话，可以上传图片进行识别
 支持连续对话，自动保持上下文记忆
 （Doubao-API存在Bug并不支持）

使用方法：
 #豆包对话 [对话内容]           - 发起对话
 #豆包对话 [对话内容] [图片]    - 图文对话（可引用图片）
 #豆包结束对话                  - 结束当前对话上下文`
            await e.reply(helpMsg, true)
            return true
        }

        const config_date = Config.getConfig()
        if (!config_date.Doubao?.sessionid) {
            await e.reply('请先使用锅巴设置豆包 Sessionid', true)
            return true
        }

        // CD次数限制
        const memberConfig = {
            feature: 'Doubao_Chat',
            cdTime: config_date.Doubao.cdtime,
            dailyLimit: config_date.Doubao.dailyLimit,
            unlimitedUsers: config_date.Doubao.unlimitedUsers,
            onlyGroupID: config_date.Doubao.onlyGroupID,
        }
        const result_member = await memberControlProcess(e, memberConfig)
        if (!result_member.allowed) {
            if (result_member.message)
                e.reply(result_member.message, true, { recallMsg: 60 })
            return true
        }

        // 检查是否有消息内容
        if (!msg) {
            await e.reply('请输入对话内容', true)
            return true
        }

        // 处理引用图片
        await parseSourceImg(e)
        if (e.img) {
            let souce_image_base64 = await url2Base64(e.img[0], false, true)
            if (!souce_image_base64) {
                e.reply('引用的图片地址已失效，请重新发送图片', true)
                return true
            }
        }

        // 获取用户的 conversation_id
        const userId = e.user_id
        const conversationId = await getConversationId(userId)

        try {
            // 选择sessionid（支持轮询）
            const sessionid = Config.get_random_Str(config_date.Doubao.sessionid, "Doubao-Sessionid")

            // 构建请求体
            const requestBody = {
                model: "doubao",
                messages: [
                    {
                        role: "user",
                        content: msg
                    }
                ],
                stream: false
            }

            // 如果有 conversation_id，则添加到请求中以接续上下文
            if (conversationId) {
                requestBody.conversation_id = conversationId
            }

            // 如果有图片，使用图文对话补全
            if (e.img && e.img.length > 0) {
                const imageUrl = e.img[0]
                requestBody.messages[0].content = [
                    {
                        type: "text",
                        text: msg
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: imageUrl
                        }
                    }
                ]
            }

            logger.info(`[sf插件][豆包对话]开始执行:\n${JSON.stringify(requestBody)}`)
            // e.reply("豆包正在思考中，请稍候...", true, { recallMsg: 60 })

            result_member.record()

            // 发送API请求
            const response = await fetch(`${config_date.Doubao.base_url}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionid}`
                },
                body: JSON.stringify(requestBody)
            })

            const data = await response.json()
            logger.mark(`[豆包API]返回数据：\n${JSON.stringify(data)}`)

            // 检查响应
            if (data?.choices && data.choices.length > 0) {
                const reply = data.choices[0].message.content
                const newConversationId = data.id

                // 保存新的 conversation_id
                if (newConversationId) {
                    await saveConversationId(userId, newConversationId)
                }

                // 检查回复内容是否为空
                if (!reply || reply.trim() === '') {
                    await e.reply('[sf插件]豆包返回了空回复', true)
                    return true
                }

                // 发送回复
                await e.reply(reply, true)
                return true
            } else {
                logger.error("[sf插件][豆包API]返回错误：\n", JSON.stringify(data, null, 2))
                await e.reply(`[sf插件]豆包对话失败：${data.message || data.error || '未知错误'}`, true)
                return true
            }
        } catch (error) {
            logger.error("[sf插件][豆包API]调用失败\n", error)
            await e.reply(`[sf插件]调用豆包API时遇到错误：${error.message}`, true)
            return true
        }
    }

    /**
     * 豆包绘画功能
     */
    async doubaoPainting(e) {
        let msg = e.msg.replace(/^#豆包绘画(\n*)?/, '').trim()
        if (msg === '帮助') {
            const helpMsg = `[sf插件][豆包绘画]帮助：
 支持文生图和图生图两种模式
 支持的ratio: 横图, 竖图, 方图, --1:1, --4:3, --3:4, --16:9, --9:16, --3:2, --2:3, --21:9
 支持的风格：--style 人像摄影，电影写真，中国风，动漫，3D 渲染，赛博朋克，CG 动画，水墨画，油画，古典，水彩画，卡通，平面插画，风景，港风动漫，像素风格，荧光绘画，彩铅画，手办，儿童绘画，抽象，锐笔插画，二次元，油墨印刷，版画，莫奈，毕加索，伦勃朗，马蒂斯，巴洛克，复古动漫，绘本
 上传图片数: --upimgs 2

示例：
 #豆包绘画 猫咪 --style 绘本 --4:3 --upimgs 1`
            await e.reply(helpMsg, true)
            return true
        }

        const config_date = Config.getConfig()
        if (!config_date.Doubao?.sessionid) {
            await e.reply('请先使用锅巴设置豆包 Sessionid', true)
            return true
        }

        // CD次数限制
        const memberConfig = {
            feature: 'Doubao_Painting',
            cdTime: config_date.Doubao.cdtime,
            dailyLimit: config_date.Doubao.dailyLimit,
            unlimitedUsers: config_date.Doubao.unlimitedUsers,
            onlyGroupID: config_date.Doubao.onlyGroupID,
        }
        const result_member = await memberControlProcess(e, memberConfig)
        if (!result_member.allowed) {
            if (result_member.message)
                e.reply(result_member.message, true, { recallMsg: 60 })
            return true
        }

        // 检查是否有消息内容
        if (!msg) {
            await e.reply('请输入绘画提示词', true)
            return true
        }

        // 处理引用图片
        await parseSourceImg(e)
        if (e.img) {
            let souce_image_base64 = await url2Base64(e.img[0], false, true)
            if (!souce_image_base64) {
                e.reply('引用的图片地址已失效，请重新发送图片', true)
                return true
            }
        }

        // 处理预设
        const presetResult = applyPresets(msg, Config.getConfig("presets"), e)
        msg = presetResult.processedText

        // 处理 msg，使用 handleParam 解析参数
        let param = await handleParam(e, msg)

        // 要求上传更多图片
        if (param.parameters.upimgs) {
            if (!(await getMediaFrom_awaitContext(e, this, param.parameters.upimgs, "upimgs")))
                return true
        }

        // 检查是否有参考图片
        let imageUrl = null
        if (e.img && e.img.length > 0) {
            imageUrl = e.img[0]
        }

        try {
            // 选择sessionid（支持轮询）
            const sessionid = Config.get_random_Str(config_date.Doubao.sessionid, "Doubao-Sessionid")

            // 构建请求体
            const requestBody = {
                model: "Seedream 4.0",
                prompt: param.input,
                ratio: param.parameters.ratio || "1:1",
                style: param.parameters.style || "动漫",
                stream: false
            }

            // 如果有参考图片，则为图生图
            if (imageUrl) {
                requestBody.image = imageUrl
            }

            logger.info(`[sf插件][豆包绘画]开始执行:\n${JSON.stringify(requestBody)}`)
            e.reply("人家开始生成啦，请等待1-5分钟", true, { recallMsg: 60 });

            result_member.record()

            // 发送API请求
            const response = await fetch(`${config_date.Doubao.base_url}/v1/images/generations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionid}`
                },
                body: JSON.stringify(requestBody)
            })

            const data = await response.json()
            logger.mark(`[豆包绘画API]返回数据：\n${JSON.stringify(data)}`)

            // 检查响应
            if (data?.choices && data.choices.length > 0) {
                const message = data.choices[0].message
                const images = message.images
                const content = message.content || ''

                if (images && images.length > 0) {
                    // 构造回复消息
                    const str_1 = `@${e.sender.card || e.sender.nickname} 豆包绘画完成：`
                    const str_2 = `提示词：\n${presetResult.originalText}`
                    const str_3 = `模型：${requestBody.model}
比例：${requestBody.ratio}
风格：${requestBody.style}${imageUrl ? '\n模式：图生图' : '\n模式：文生图'}
生成图片数量：${images.length}张${content ? '\n\n豆包回复：\n' + content : ''}`

                    // 根据简洁模式决定回复方式
                    if (config_date.simpleMode) {
                        // 简洁模式：转发消息包含所有内容
                        const forwardMsgs = [str_1]
                        images.forEach((url) => {
                            forwardMsgs.push({
                                ...segment.image(url),
                                origin: true
                            })
                        })
                        forwardMsgs.push(str_2, str_3)

                        const msgx = await common.makeForwardMsg(
                            e,
                            forwardMsgs,
                            `${e.sender.card || e.sender.nickname} 的豆包绘画`
                        )
                        await e.reply(msgx)
                    } else {
                        // 非简洁模式：分别发送
                        const msgx = await common.makeForwardMsg(
                            e,
                            [str_1, str_2, str_3],
                            `${e.sender.card || e.sender.nickname} 的豆包绘画`
                        )
                        await e.reply(msgx)

                        // 发送所有生成的图片
                        for (const url of images) {
                            await e.reply({
                                ...segment.image(url),
                                origin: true
                            })
                        }
                    }

                    return true
                } else {
                    await e.reply(`[sf插件]豆包绘画成功，但未返回图片`, true)
                    return true
                }
            } else {
                logger.error("[sf插件][豆包绘画API]返回错误：\n", JSON.stringify(data, null, 2))
                await e.reply(`[sf插件]豆包绘画失败：${data.message || data.error || '未知错误'}`, true)
                return true
            }
        } catch (error) {
            logger.error("[sf插件][豆包绘画API]调用失败\n", error)
            await e.reply(`[sf插件]调用豆包绘画API时遇到错误：${error.message}`, true)
            return true
        }
    }


    /**
     * 结束对话
     */
    async endConversation(e) {
        const userId = e.user_id
        const hasConversation = await hasActiveConversation(userId)

        if (!hasConversation) {
            await e.reply('您当前没有进行中的对话', true)
            return true
        }

        const success = await deleteConversationId(userId)
        if (success) {
            await e.reply('已结束当前对话，下次对话将开启新的上下文', true)
        } else {
            await e.reply('结束对话失败，请稍后重试', true)
        }
        return true
    }
}