import plugin from '../../../lib/plugins/plugin.js'
import Config from '../components/Config.js'
import common from '../../../lib/common/common.js';
import {
    parseSourceImg,
    url2Base64,
    getImgFrom_awaitContext,
} from '../utils/getImg.js'
import { handleParam } from '../utils/Jimeng/parse_Jimeng.js'
import { memberControlProcess } from '../utils/memberControl.js'
import { applyPresets } from '../utils/applyPresets.js'

export class Jimeng extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'sf插件-即梦api',
            /** 功能描述 */
            dsc: '绘画/视频',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 1011,
            rule: [
                {
                    /** 命令正则匹配 */
                    reg: '^#即梦(画图|绘图|绘画|视频)',
                    /** 执行方法 */
                    fnc: 'call_Jimeng_Api'
                },
                // {
                //     /** 命令正则匹配 */
                //     reg: '^#即梦(聊天|对话)',
                //     /** 执行方法 */
                //     fnc: 'call_Jimeng_Chat'
                // }
            ]
        })
    }

    async call_Jimeng_Api(e) {
        const config_date = Config.getConfig()
        if (!config_date.Jimeng.sessionid && !config_date.Jimeng.sessionid_ITN) {
            await e.reply('请先使用锅巴设置即梦 Sessionid', true)
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

        // 判断是否为视频生成
        const isVideo = /^#即梦视频/.test(e.msg)

        let msg = e.msg.replace(/^#即梦(画图|绘图|绘画|视频)(\n*)?/, '').trim()
        if (msg === '帮助') {
            const helpMsg = isVideo ? `[sf插件][即梦视频API]帮助：
支持的ratio: 横图, 竖图, 方图, --1:1, --4:3, --3:4, --16:9, --9:16, --21:9
 注意：在图生视频模式下（有图片输入时），ratio参数将被忽略，视频比例由输入图片的实际比例决定。
支持的时长：--5秒, --10秒
上传图片数: --upimgs 2
引用图片：
 无图片 → 文生视频模式
 1张图片 → 图生视频模式
 2张图片 → 首尾帧视频模式

示例：
#即梦视频 一个女人在花园里跳舞 --9:16 --5秒` : `[sf插件][即梦API]帮助：
默认的resolution: 2k
支持的ratio: 横图, 竖图, 方图, --1:1, --4:3, --3:4, --16:9, --9:16, --3:2, --2:3, --21:9
负面提示词: ntags = [tags]
上传图片数: --upimgs 2
参考图片强度: reference_strength = 0.8
国际站支持的模型: --nanobanana, --jimeng-4.0

示例：
#即梦绘画 美丽的小少女，胶片感, 竖图, reference_strength = 0.8, --nanobanana, ntags = 丑陋的`
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

        // 处理预设
        const presetResult = applyPresets(msg, Config.getConfig("presets"))
        msg = presetResult.processedText

        // 处理 msg
        let param = await handleParam(e, msg)

        // 要求上传更多图片
        if (param.parameters.upimgs) {
            await getImgFrom_awaitContext(e, param.parameters.upimgs, "upimgs", this)
            if (e.img.length < param.parameters.upimgs)
                return true;
        }

        // 判断是否为图生图（非视频模式）
        const isImg2Img = !isVideo && e.img && e.img.length > 0

        // 构造请求体
        let requestBody, apiEndpoint

        if (isVideo) {
            // 视频生成模式
            apiEndpoint = `${config_date.Jimeng.base_url}/v1/videos/generations`
            requestBody = {
                "model": param.model || "jimeng-video-3.0",
                "prompt": param.input || "一个女人在花园里跳舞",
                "ratio": param.parameters.ratio || "16:9",
                // "resolution": param.parameters.resolution || "720p",
                "duration": param.parameters.video_duration || undefined,
                "filePaths": e.img && e.img.length > 0 ? e.img.slice(0, 2) : undefined, // 最多支持2张图片
            }
        } else if (isImg2Img) {
            // 图生图模式
            apiEndpoint = `${config_date.Jimeng.base_url}/v1/images/compositions`
            requestBody = {
                "model": param.model || "jimeng-4.0",
                "prompt": param.input || "美丽的少女，胶片感",
                "images": e.img.slice(0, 2),
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
            // 根据模型选择 sessionid
            let sessionid;
            if (requestBody.model === "nanobanana") {
                // nanobanana 模型只使用 sessionid_ITN
                sessionid = Config.get_random_Str(config_date.Jimeng.sessionid_ITN, "Jimeng-Sessionid-ITN");
                if (!sessionid) {
                    e.reply('请先使用锅巴设置即梦国际站 Sessionid', true)
                    return
                }
            } else {
                // 其他模型可以从 sessionid 和 sessionid_ITN 中随机选择
                const combinedSessionids = [config_date.Jimeng.sessionid, config_date.Jimeng.sessionid_ITN]
                    .filter(Boolean)
                    .join(',');
                sessionid = Config.get_random_Str(combinedSessionids, "Jimeng-Sessionid");
            }

            // if (!config_date.simpleMode)
            e.reply("人家开始生成啦，请等待1-5分钟", true);
            logger.info(`[sf插件][Jimeng]开始执行:\n` + JSON.stringify(requestBody))

            result_member.record();

            // 发送API请求（设置20分钟超时）
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20 * 60 * 1000); // 20分钟，否则默认5分钟不够等待

            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionid}`
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            })
            clearTimeout(timeoutId);

            const data = await response.json()
            logger.mark(`[即梦API]返回数据：\n${JSON.stringify(data)}`)

            // 检查是否为视频生成
            if (isVideo) {
                if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
                    const videoUrl = data.data[0].url
                    const revisedPrompt = data.data[0].revised_prompt

                    // 构造回复消息
                    const str_1 = `@${e.sender.card || e.sender.nickname} 您的视频已生成完成：`
                    const str_2 = `提示词：\n${presetResult.originalText}`
                    const imageCountStr = requestBody.filePaths ? `参考图片：${requestBody.filePaths.length}张` : '文生视频'
                    const str_3 = `模型：${requestBody.model}
比例：${requestBody.ratio}
模式：${imageCountStr}
${data.created ? `创建时间：${new Date(data.created * 1000).toLocaleString('zh-CN')}` : ''}`

                    // 根据简洁模式决定回复方式
                    if (config_date.simpleMode) {
                        // 简洁模式：转发消息包含所有内容
                        const forwardMsgs = [str_1, str_2, str_3]

                        const msgx = await common.makeForwardMsg(
                            e,
                            forwardMsgs,
                            `${e.sender.card || e.sender.nickname} 的视频生成`
                        )
                        await e.reply(msgx)
                    } else {
                        // 非简洁模式：分别发送
                        const msgx = await common.makeForwardMsg(
                            e,
                            [str_1, str_2, str_3],
                            `${e.sender.card || e.sender.nickname} 的视频生成`
                        )
                        await e.reply(msgx)
                    }

                    // 下载视频并发送
                    try {
                        logger.info(`[即梦视频]开始下载视频: ${videoUrl}`)
                        const videoResponse = await fetch(videoUrl, {
                            headers: {
                                'referer': 'https://jimeng.jianying.com/',
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                            }
                        })

                        if (!videoResponse.ok) {
                            throw new Error(`视频下载失败: HTTP ${videoResponse.status}`)
                        }

                        const videoBuffer = Buffer.from(await videoResponse.arrayBuffer())
                        // logger.info(`[即梦视频]视频下载成功，大小: ${(videoBuffer.length / 1024 / 1024).toFixed(2)}MB`)
                        await e.reply(segment.video(videoBuffer))
                    } catch (videoError) {
                        logger.error("[sf插件][即梦视频]视频下载失败\n", videoError)
                        await e.reply(`视频生成成功，但下载失败。视频链接：${videoUrl}`, true)
                    }

                    return true
                } else {
                    logger.error("[sf插件][即梦视频API]返回错误：\n", JSON.stringify(data, null, 2))
                    await e.reply(`[sf插件]生成视频失败：${data.message || data.error || '未知错误'}`, true)
                    return false
                }
            }

            // 检查是否有返回的图片
            if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
                const imageUrls = data.data.map(item => item.url)

                // 构造回复消息
                const str_1 = `@${e.sender.card || e.sender.nickname} 您的${isImg2Img ? "图生图" : "文生图"}已完成：`
                const str_2 = `提示词：\n${presetResult.originalText}`
                const str_3 = `模型：${requestBody.model}
比例：${requestBody.ratio}
分辨率：${requestBody.resolution}${requestBody.images ? `\n参考图片：${requestBody.images.length}张` : ''}
${isImg2Img ? `合成强度：${requestBody.sample_strength || 1.0}\n` : ''}生成图片数量：${imageUrls.length}张
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
                await e.reply(`[sf插件]生成图片失败：${data.message || data.error || '未知错误'}`, true)
                return false
            }
        } catch (error) {
            logger.error("[sf插件][即梦API]调用失败\n", error)
            let errorMsg = `[sf插件]调用即梦API时遇到错误：${error.message}`
            if (error.message.includes('fetch failed')) {
                errorMsg += '\n\n请检查：\n1. API地址是否正确配置\n2. API服务器端口是否开放\n3. API服务是否正常运行\n4. 防火墙或代理设置是否阻止访问'
            }
            await e.reply(errorMsg, true)
            return false
        }
    }

// 可以正常调用 即梦 的 Agent 对话模式，然后效果还不如直接 绘画 呢！而且并不支持返回文本和视频，只返回4张图片，封印！
//     async call_Jimeng_Chat(e) {
//         const config_date = Config.getConfig()
//         if (!config_date.Jimeng.sessionid && !config_date.Jimeng.sessionid_ITN) {
//             await e.reply('请先使用锅巴设置即梦 Sessionid', true)
//             return false
//         }

//         // CD次数限制
//         const memberConfig = {
//             feature: 'Jimeng',
//             cdTime: config_date.Jimeng.cdtime,
//             dailyLimit: config_date.Jimeng.dailyLimit,
//             unlimitedUsers: config_date.Jimeng.unlimitedUsers,
//             onlyGroupID: config_date.Jimeng.onlyGroupID,
//         }
//         const result_member = await memberControlProcess(e, memberConfig);
//         if (!result_member.allowed) {
//             if (result_member.message)
//                 e.reply(result_member.message, true, { recallMsg: 60 });
//             return false;
//         }

//         let msg = e.msg.replace(/^#即梦(聊天|对话)(\n*)?/, '').trim()
//         if (!msg) {
//             await e.reply('请输入聊天内容，例如：#即梦聊天 画一幅山水画', true)
//             return false
//         }

//         if (msg === '帮助') {
//             const helpMsg = `[sf插件][即梦聊天API]帮助：
// 使用即梦AI进行对话交流

// 示例：
// #即梦聊天 画一幅山水画
// #即梦对话 帮我写一首诗`
//             e.reply(helpMsg, true);
//             return false
//         }

//         try {
//             // 选择 sessionid
//             const combinedSessionids = [config_date.Jimeng.sessionid, config_date.Jimeng.sessionid_ITN]
//                 .filter(Boolean)
//                 .join(',');
//             const sessionid = Config.get_random_Str(combinedSessionids, "Jimeng-Sessionid");

//             if (!sessionid) {
//                 e.reply('请先使用锅巴设置即梦 Sessionid', true)
//                 return false
//             }

//             e.reply("正在思考中，请稍候...", true);
//             logger.info(`[sf插件][即梦聊天]开始执行: ${msg}`)

//             result_member.record();

//             // 构造请求体
//             const requestBody = {
//                 "model": "jimeng-4.0",
//                 "messages": [
//                     {
//                         "role": "user",
//                         "content": msg
//                     }
//                 ]
//             }

//             // 发送API请求（设置5分钟超时）
//             const controller = new AbortController();
//             const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

//             const apiEndpoint = `${config_date.Jimeng.base_url}/v1/chat/completions`
//             const response = await fetch(apiEndpoint, {
//                 method: 'POST',
//                 headers: {
//                     'Content-Type': 'application/json',
//                     'Authorization': `Bearer ${sessionid}`
//                 },
//                 body: JSON.stringify(requestBody),
//                 signal: controller.signal
//             })
//             clearTimeout(timeoutId);

//             const data = await response.json()
//             logger.mark(`[即梦聊天API]返回数据：\n${JSON.stringify(data)}`)

//             // 检查返回数据
//             if (data?.choices && Array.isArray(data.choices) && data.choices.length > 0) {
//                 const assistantMessage = data.choices[0].message
//                 const content = assistantMessage.content

//                 if (!content) {
//                     await e.reply('[sf插件]即梦AI返回内容为空', true)
//                     return false
//                 }

//                 // 检查内容中是否包含图片链接（Markdown格式）
//                 const imageRegex = /!\[.*?\]\((https?:\/\/[^\)]+)\)/g
//                 const imageMatches = [...content.matchAll(imageRegex)]

//                 if (imageMatches.length > 0) {
//                     // 包含图片
//                     const forwardMsgs = []
//                     forwardMsgs.push(`@${e.sender.card || e.sender.nickname} 即梦AI为您生成了${imageMatches.length}张图片：`)

//                     // 提取并去除图片标记后的文本内容
//                     let textContent = content.replace(imageRegex, '').trim()
//                     if (textContent) {
//                         forwardMsgs.push(textContent)
//                     }

//                     // 添加图片
//                     for (const match of imageMatches) {
//                         const imageUrl = match[1]
//                         forwardMsgs.push({
//                             ...segment.image(imageUrl),
//                             origin: true
//                         })
//                     }

// //                     // 添加使用信息
// //                     if (data.usage) {
// //                         const usageInfo = `Token使用情况：
// // 输入: ${data.usage.prompt_tokens}
// // 输出: ${data.usage.completion_tokens}
// // 总计: ${data.usage.total_tokens}`
// //                         forwardMsgs.push(usageInfo)
// //                     }

//                     // 根据简洁模式决定回复方式
//                     if (config_date.simpleMode) {
//                         const msgx = await common.makeForwardMsg(
//                             e,
//                             forwardMsgs,
//                             `${e.sender.card || e.sender.nickname} 的即梦对话`
//                         )
//                         await e.reply(msgx)
//                     } else {
//                         // 非简洁模式：先发送转发消息，再逐个发送图片
//                         const infoMsgs = [forwardMsgs[0]]
//                         if (textContent) {
//                             infoMsgs.push(textContent)
//                         }
//                         if (data.usage) {
//                             infoMsgs.push(`Token使用情况：
// 输入: ${data.usage.prompt_tokens}
// 输出: ${data.usage.completion_tokens}
// 总计: ${data.usage.total_tokens}`)
//                         }

//                         const msgx = await common.makeForwardMsg(
//                             e,
//                             infoMsgs,
//                             `${e.sender.card || e.sender.nickname} 的即梦对话`
//                         )
//                         await e.reply(msgx)

//                         // 发送所有生成的图片
//                         for (const match of imageMatches) {
//                             const imageUrl = match[1]
//                             await e.reply({
//                                 ...segment.image(imageUrl),
//                                 origin: true
//                             })
//                         }
//                     }
//                 } else {
//                     // 纯文本回复
//                     const replyMsg = `@${e.sender.card || e.sender.nickname}\n${content}`
//                     await e.reply(replyMsg, true)
//                 } return true
//             } else {
//                 logger.error("[sf插件][即梦聊天API]返回错误：\n", JSON.stringify(data, null, 2))
//                 await e.reply(`[sf插件]聊天失败：${data.message || data.error || '未知错误'}`, true)
//                 return false
//             }
//         } catch (error) {
//             logger.error("[sf插件][即梦聊天API]调用失败\n", error)
//             let errorMsg = `[sf插件]调用即梦聊天API时遇到错误：${error.message}`
//             if (error.message.includes('fetch failed')) {
//                 errorMsg += '\n\n请检查：\n1. API地址是否正确配置\n2. API服务器端口是否开放\n3. API服务是否正常运行\n4. 防火墙或代理设置是否阻止访问'
//             }
//             await e.reply(errorMsg, true)
//             return false
//         }
//     }
}
