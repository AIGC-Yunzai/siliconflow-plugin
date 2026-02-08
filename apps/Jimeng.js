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
import axios from 'axios'

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
            ]
        })
    }

    async call_Jimeng_Api(e) {
        // 判断是否为视频生成
        const isVideo = /^#即梦视频/.test(e.msg)

        let msg = e.msg.replace(/^#即梦(画图|绘图|绘画|视频)(\n*)?/, '').trim()
        if (msg === '帮助') {
            const helpMsg = isVideo ? `[sf插件][即梦视频API]帮助：
支持的ratio: 横图, 竖图, 方图, --1:1, --4:3, --3:4, --16:9, --9:16, --21:9
 注意：在图生视频模式下（有图片输入时），ratio参数将被忽略，视频比例由输入图片的实际比例决定。
上传图片数: --upimgs 2
更换模型: --model [jimeng-video-4.0-pro|jimeng-video-4.0|jimeng-video-3.5-pro|jimeng-video-veo3|jimeng-video-sora2]
更改时长：--duration [5|8|10|15]
更改分辨率：--resolution [720p|1080p]
引用图片：
 无图片 → 文生视频模式
 1张图片 → 图生视频模式
 2张图片 → 首尾帧视频模式

示例：
#即梦视频 一个女人在花园里跳舞 --9:16 --5秒` : `[sf插件][即梦API]帮助：
默认的resolution: 2k
支持的ratio: 横图, 竖图, 方图, --1:1, --4:3, --3:4, --16:9, --9:16, --3:2, --2:3, --21:9
上传图片数: --upimgs 2
参考图片强度: --reference_strength 0.8
更换模型: --model [nanobanana|nanobananapro|jimeng-4.5]
启用智能画幅比例: --intelligent_ratio true
负面提示词: ntags = [tags]

示例：
#即梦绘画 美丽的小少女，胶片感, 竖图, reference_strength = 0.8, --nanobanana, ntags = 丑陋的`
            e.reply(helpMsg, true);
            return true
        }

        const config_date = Config.getConfig()
        if (!config_date.Jimeng.sessionid && !config_date.Jimeng.sessionid_ITN) {
            await e.reply('请先使用锅巴设置即梦 Sessionid', true)
            return true
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
            return true;
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
                "resolution": param.parameters.resolution || "720p",
                "duration": param.parameters.duration || undefined,
                "filePaths": e.img && e.img.length > 0 ? e.img.slice(0, 2) : undefined, // 最多支持2张图片
            }
        } else if (isImg2Img) {
            // 图生图模式
            apiEndpoint = `${config_date.Jimeng.base_url}/v1/images/compositions`
            requestBody = {
                "model": param.model || config_date.Jimeng.model || "jimeng-4.5",
                "prompt": param.input || "美丽的少女，胶片感",
                "images": e.img.slice(0, 2),
                "ratio": param.parameters.ratio || "1:1",
                "resolution": param.parameters.resolution || "2k",
                "negative_prompt": param.parameters.negative_prompt || undefined,
                "sample_strength": param.parameters.reference_strength || undefined,
                "intelligent_ratio": param.parameters.intelligent_ratio || undefined,
            }
        } else {
            // 文生图模式
            apiEndpoint = `${config_date.Jimeng.base_url}/v1/images/generations`
            requestBody = {
                "model": param.model || config_date.Jimeng.model || "jimeng-4.5",
                "prompt": param.input || "美丽的少女，胶片感",
                "ratio": param.parameters.ratio || "1:1",
                "resolution": param.parameters.resolution || "2k",
                "negative_prompt": param.parameters.negative_prompt || undefined,
                "intelligent_ratio": param.parameters.intelligent_ratio || undefined,
            }
        }

        // 过滤掉 undefined
        requestBody = Object.fromEntries(
            Object.entries(requestBody).filter(([_, value]) => value !== undefined)
        )

        try {
            // 根据模型选择 sessionid
            let sessionid;
            if (requestBody.model === "nanobanana" || requestBody.model === "jimeng-video-veo3" || requestBody.model === "jimeng-video-veo3.1" || requestBody.model === "jimeng-video-sora2") {
                // nanobanana 模型只使用 sessionid_ITN
                sessionid = Config.get_random_Str(config_date.Jimeng.sessionid_ITN, "Jimeng-Sessionid-ITN");
                if (!sessionid) {
                    e.reply('请先使用锅巴设置即梦国际站 Sessionid', true)
                    return
                }
            } else if (requestBody.model === "jimeng-4.5" || requestBody.model === "jimeng-4.1" || requestBody.model === "jimeng-video-4.0-pro" || requestBody.model === "jimeng-video-4.0") {
                // jimeng-4.5 模型只使用 sessionid
                sessionid = Config.get_random_Str(config_date.Jimeng.sessionid, "Jimeng-Sessionid");
                if (!sessionid) {
                    e.reply('请先使用锅巴设置即梦国内站 Sessionid', true)
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
            e.reply("人家开始生成啦，请等待1-10分钟", true, { recallMsg: 60 });
            logger.info(`[sf插件][Jimeng]开始执行:\n` + JSON.stringify(requestBody))

            result_member.record();

            // 发送API请求（设置20分钟超时）
            const response = await axios.post(apiEndpoint, requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionid}`
                },
                timeout: 60 * 60 * 1000, // 60分钟
                validateStatus: () => true
            })

            const data = response.data
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
                        const videoResponse = await axios.get(videoUrl, {
                            headers: {
                                'referer': 'https://jimeng.jianying.com/',
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                            },
                            responseType: 'arraybuffer',
                            timeout: 60 * 60 * 1000,
                            validateStatus: () => true
                        })

                        if (videoResponse.status !== 200) {
                            throw new Error(`视频下载失败: HTTP ${videoResponse.status}`)
                        }

                        const videoBuffer = Buffer.from(videoResponse.data)
                        // logger.info(`[即梦视频]视频下载成功，大小: ${(videoBuffer.length / 1024 / 1024).toFixed(2)}MB`)
                        await e.reply(segment.video(videoBuffer))
                    } catch (videoError) {
                        logger.warn("[sf插件][即梦视频]视频下载失败\n", videoError)
                        await e.reply(`视频生成成功，但下载失败。视频链接：${videoUrl}`, true)
                    }

                    return true
                } else {
                    logger.warn("[sf插件][即梦视频API]返回错误：\n", JSON.stringify(data, null, 2))
                    await e.reply(`[sf插件]生成视频失败：${data.message || data.error || '未知错误'}`, true)
                    return true
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
                logger.warn("[sf插件][即梦API]返回错误：\n", JSON.stringify(data, null, 2))
                await e.reply(`[sf插件]生成图片失败：${data.message || data.error || '未知错误'}`, true)
                return true
            }
        } catch (error) {
            logger.warn("[sf插件][即梦API]调用失败\n", error)
            let errorMsg = `[sf插件]调用即梦API时遇到错误：${error.message}`
            if (error.message.includes('fetch failed')) {
                errorMsg += '\n\n请检查：\n1. API地址是否正确配置\n2. API服务器端口是否开放\n3. API服务是否正常运行\n4. 防火墙或代理设置是否阻止访问'
            }
            await e.reply(errorMsg, true)
            return true
        }
    }

}
