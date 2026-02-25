import plugin from '../../../lib/plugins/plugin.js'
import Config from '../components/Config.js'
import common from '../../../lib/common/common.js';
import {
    parseSourceImg,
    url2Base64,
    getMediaFrom_awaitContext,
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
            dsc: '绘画/视频/积分管理',
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
                {
                    reg: '^#即梦(检查|检测)?账号$',
                    fnc: 'check_Jimeng_Token',
                    permission: 'master'
                },
                {
                    reg: '^#即梦查?看?积分$',
                    fnc: 'get_Jimeng_Points',
                    permission: 'master'
                },
                {
                    reg: '^#即梦(签到|领取积分)$',
                    fnc: 'receive_Jimeng_Points',
                    permission: 'master'
                }
            ]
        })
    }

    /** ^#即梦(画图|绘图|绘画|视频) */
    async call_Jimeng_Api(e) {
        // 判断是否为视频生成
        const isVideo = /^#即梦视频/.test(e.msg)

        let msg = e.msg.replace(/^#即梦(画图|绘图|绘画|视频)(\n*)?/, '').trim()
        if (msg === '帮助') {
            const helpMsg = isVideo ? [
                `支持的ratio（在图生视频模式下（有图片输入时），ratio参数将被忽略，视频比例由输入图片的实际比例决定）: 
横图, 竖图, 方图, --1:1, --4:3, --3:4, --16:9, --9:16, --21:9`,
                `上传图片数:
--upimgs [1|2|10]`,
                `更换模型:
--model [jimeng-video-seedance-2.0|jimeng-video-seedance-2.0-fast|jimeng-video-3.5-pro|jimeng-video-veo3|jimeng-video-veo3.1|jimeng-video-sora2|jimeng-video-3.0-pro|jimeng-video-3.0|jimeng-video-3.0-fast]`,
                `全能模式:
--functionMode omni_reference`,
                `更改时长:
--duration [5|8|10|15]`,
                `更改分辨率:
--resolution [720p|1080p]`,
                `指定使用账号:
--ssid [序号|1|2]`,
                `🖼️ 引用图片/视频逻辑:
 无图片 → 文生视频模式
 1张图片 → 图生视频模式
 2张图片 → 首尾帧视频模式

 🌟 全能模式（Omni Reference）:
 混合图片+视频作为参考素材，仅 jimeng-video-seedance-2.0 模型支持；
 在 prompt 中通过 @字段名 引用素材并描述其作用。
 字段名写法:
 image_file_1 ~ image_file_9（图片）
 video_file_1 ~ video_file_3（视频）`,
                `📝 示例:
[引用一个不超过15秒的视频]
#即梦视频 @image_file_1作为首帧，@image_file_2作为尾帧，运动动作模仿@video_file --model jimeng-video-seedance-2.0-fast --functionMode omni_reference --16:9 --duration 5 --upimgs 2`,
                `其他指令:
 #即梦积分
 #即梦签到
 #即梦账号`
            ] : [
                `支持的ratio: 
横图, 竖图, 方图, --1:1, --4:3, --3:4, --16:9, --9:16, --3:2, --2:3, --21:9`,
                `上传图片数:
--upimgs [1|2|10]`,
                `更改分辨率:
--resolution [1k|2k|4k]`,
                `参考图片强度:
--sample_strength 0.8`,
                `更换模型:
--model [nanobanana|nanobananapro|jimeng-5.0|jimeng-4.6|jimeng-4.5|jimeng-4.1|jimeng-4.0|jimeng-3.1|jimeng-3.0]`,
                `启用智能画幅比例:
--intelligent_ratio true`,
                `负面提示词:
ntags = [tags]`,
                `指定使用账号:
--ssid [序号|1|2]`,
                `📝 示例:
#即梦绘画 美丽的小少女，胶片感, 竖图, --model jimeng-5.0 --resolution 2k, ntags = 丑陋的`,
                `其他指令:
 #即梦积分
 #即梦签到
 #即梦账号`
            ];

            const msgx = await common.makeForwardMsg(
                e,
                helpMsg,
                isVideo ? "[sf插件][即梦视频API]帮助" : "[sf插件][即梦绘画API]帮助"
            );
            await e.reply(msgx);
            return true
        }

        const config_data = Config.getConfig()
        const accountList = this._getAccountList()

        if (accountList.length === 0) {
            await e.reply('请先使用锅巴设置即梦 Sessionid (国内站或国际站)', true)
            return true
        }

        // CD次数限制
        const memberConfig = {
            feature: 'Jimeng',
            cdTime: config_data.Jimeng.cdtime,
            dailyLimit: config_data.Jimeng.dailyLimit,
            unlimitedUsers: config_data.Jimeng.unlimitedUsers,
            onlyGroupID: config_data.Jimeng.onlyGroupID,
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
        let upimgs_num = parseInt(param.parameters.upimgs);
        console.log("测试01" + upimgs_num)
        if (!isNaN(upimgs_num) && upimgs_num > 0) {
            console.log("测试02" + upimgs_num)
            // 根据配置文件指定用户最大可上传的图片数量
            upimgs_num = Math.min(upimgs_num, config_data.Jimeng.max_upimgs || 2)

            await getMediaFrom_awaitContext(e, this, upimgs_num, "upimgs")
            if (e.img.length < upimgs_num)
                return true;
        }

        // 判断是否为图生图（非视频模式）
        const isImg2Img = !isVideo && e.img && e.img.length > 0

        // 构造请求体
        let requestBody, apiEndpoint

        if (isVideo) {
            // 视频生成模式
            apiEndpoint = `${config_data.Jimeng.base_url}/v1/videos/generations`
            // 传递图片和视频url
            const images = e.img || [];
            const videos = (e.get_Video || []).map(v => v.url);
            const useMultiParams = images.length > 2 || videos.length > 0;

            requestBody = {
                "model": param.model || "jimeng-video-3.0",
                "prompt": param.input || "一个女人在花园里跳舞",
                "ratio": param.parameters.ratio || undefined,
                "resolution": param.parameters.resolution || undefined,
                "duration": param.parameters.duration || undefined,
                "functionMode": param.parameters.functionMode || undefined,
            };

            if (useMultiParams) {
                // 使用 image_file_1, video_file_1 的形式
                images.forEach((url, i) => requestBody[`image_file_${i + 1}`] = url);
                videos.forEach((url, i) => requestBody[`video_file_${i + 1}`] = url);
            } else if (images.length > 0) {
                // 使用 filePaths
                requestBody.filePaths = images.slice(0, config_data.Jimeng.max_upimgs || 2);
            }
        } else if (isImg2Img) {
            // 图生图模式
            apiEndpoint = `${config_data.Jimeng.base_url}/v1/images/compositions`
            requestBody = {
                "model": param.model || config_data.Jimeng.model || "jimeng-5.0",
                "prompt": param.input || "美丽的少女，胶片感",
                "images": e.img.slice(0, config_data.Jimeng.max_upimgs || 2),
                "ratio": param.parameters.ratio || undefined,
                "resolution": param.parameters.resolution || undefined,
                "negative_prompt": param.parameters.negative_prompt || undefined,
                "sample_strength": param.parameters.sample_strength || undefined,
                "intelligent_ratio": param.parameters.intelligent_ratio || undefined,
            }
        } else {
            // 文生图模式
            apiEndpoint = `${config_data.Jimeng.base_url}/v1/images/generations`
            requestBody = {
                "model": param.model || config_data.Jimeng.model || "jimeng-5.0",
                "prompt": param.input || "美丽的少女，胶片感",
                "ratio": param.parameters.ratio || undefined,
                "resolution": param.parameters.resolution || undefined,
                "negative_prompt": param.parameters.negative_prompt || undefined,
                "sample_strength": param.parameters.sample_strength || undefined,
                "intelligent_ratio": param.parameters.intelligent_ratio || undefined,
            }
        }

        // 过滤掉 undefined
        requestBody = Object.fromEntries(
            Object.entries(requestBody).filter(([_, value]) => value !== undefined)
        )

        try {
            // 选择 sessionid
            let sessionid;
            let usedAccount; // 用于记录使用的账号信息以便日志

            const ssidParam = param.parameters.ssid;
            const targetIndex = parseInt(ssidParam);

            if (ssidParam && !isNaN(targetIndex) && targetIndex !== 0) {
                // 指定了序号
                usedAccount = accountList.find(acc => acc.index === targetIndex);

                if (!usedAccount) {
                    await e.reply(`指定的账号序号 [${targetIndex}] 不存在，当前共有 ${accountList.length} 个账号。\n请使用 #即梦查看积分 查看可用账号。`, true);
                    return true;
                }
                sessionid = usedAccount.token;
            } else {
                // 未指定或为0，随机选择
                usedAccount = accountList[Math.floor(Math.random() * accountList.length)];
                sessionid = usedAccount.token;
            }

            logger.info(`[sf插件][Jimeng] 使用账号: [${usedAccount.index}] ${usedAccount.type}`);

            // if (!config_date.simpleMode)
            e.reply("人家开始生成啦，请等待1-10分钟", true, { recallMsg: 60 });
            logger.info(`[sf插件][Jimeng] 开始执行:\n` + JSON.stringify(requestBody))

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
                    const imageCountStr = requestBody.filePaths ? `参考文件：${requestBody.filePaths.length} 份` : '文生视频'
                    const str_3 = `模型：${requestBody.model}
比例：${requestBody.ratio}
模式：${imageCountStr}
账号：[${usedAccount.index}] ${usedAccount.type}
${data.created ? `创建时间：${new Date(data.created * 1000).toLocaleString('zh-CN')}` : ''}`

                    // 根据简洁模式决定回复方式
                    if (config_data.simpleMode) {
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
账号：[${usedAccount.index}] ${usedAccount.type}
${data.created ? `创建时间：${new Date(data.created * 1000).toLocaleString('zh-CN')}` : ''}`

                // 根据简洁模式决定回复方式
                if (config_data.simpleMode) {
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

    /** 统一获取并结构化所有账号信息 */
    _getAccountList() {
        const config_date = Config.getConfig()
        const domesticTokens = config_date.Jimeng.sessionid ? config_date.Jimeng.sessionid.split(',') : []
        const internationalTokens = config_date.Jimeng.sessionid_ITN ? config_date.Jimeng.sessionid_ITN.split(',') : []

        let accountList = []

        // 处理国内站
        domesticTokens.forEach(t => {
            if (t && t.trim()) {
                accountList.push({
                    token: t.trim(),
                    type: '国内站',
                    origin: 'Jimeng-Sessionid'
                })
            }
        })

        // 处理国际站
        internationalTokens.forEach(t => {
            if (t && t.trim()) {
                accountList.push({
                    token: t.trim(),
                    type: '国际站',
                    origin: 'Jimeng-Sessionid-ITN'
                })
            }
        })

        // 添加序号 (1-based index)
        return accountList.map((item, index) => ({
            ...item,
            index: index + 1
        }))
    }

    /** Token脱敏显示 */
    _maskToken(token) {
        if (!token || token.length < 10) return token
        return token.substring(0, 6) + '...' + token.substring(token.length - 4)
    }

    /** ^#即梦(检查|检测)?账号$ */
    async check_Jimeng_Token(e) {
        const accountList = this._getAccountList()
        const baseUrl = Config.getConfig().Jimeng.base_url

        if (accountList.length === 0) {
            return e.reply('配置文件中未找到任何 Token', true)
        }

        await e.reply(`开始检查 ${accountList.length} 个 Token 的状态...`, true)
        const statusList = []

        for (const account of accountList) {
            try {
                const res = await axios.post(`${baseUrl}/token/check`, { token: account.token }, {
                    timeout: 60000,
                    validateStatus: () => true
                })
                const isLive = res.data?.live === true
                statusList.push(`[${account.index}] ${account.type}\nToken: ${this._maskToken(account.token)}\n状态: ${isLive ? '✅ 有效' : '❌ 无效'}`)
            } catch (error) {
                statusList.push(`[${account.index}] ${account.type}\nToken: ${this._maskToken(account.token)}\n状态: ⚠️ 请求失败 (${error.message})`)
            }
        }

        const msg = await common.makeForwardMsg(e, statusList, '即梦Token状态检查')
        await e.reply(msg)
    }

    /** ^#即梦查?看?积分$ */
    async get_Jimeng_Points(e) {
        const accountList = this._getAccountList()
        const baseUrl = Config.getConfig().Jimeng.base_url
        if (accountList.length === 0) return e.reply('未配置 Token', true)

        try {
            // 构造 Bearer Token 字符串（多个用逗号分隔，后端支持批量查询）
            const authHeader = accountList.map(a => a.token).join(',')

            const res = await axios.post(`${baseUrl}/token/points`, {}, {
                headers: { 'Authorization': `Bearer ${authHeader}` },
                timeout: 60000,
                validateStatus: () => true
            })

            const data = res.data
            if (!Array.isArray(data)) {
                return e.reply(`获取失败，返回格式错误: ${JSON.stringify(data)}`, true)
            }

            const msgList = []

            // 遍历每个账号，尝试在返回数据中找到对应的信息
            // 假设返回的数据顺序与 header 顺序一致，或者包含 token 信息用于匹配
            for (const account of accountList) {
                // 尝试通过 token 匹配返回数据
                const result = data.find(item => item.token === account.token) || {}
                const pts = result.points || {}

                let info = `[${account.index}] ${account.type}\n` +
                    `Token: ${this._maskToken(account.token)}\n`

                if (result.points) {
                    info += `总积分: ${pts.totalCredit || 0}\n` +
                        `赠送积分: ${pts.giftCredit || 0}\n` +
                        `购买积分: ${pts.purchaseCredit || 0}\n` +
                        `VIP积分: ${pts.vipCredit || 0}`
                } else {
                    info += `获取失败: 未找到返回数据`
                }
                msgList.push(info)
            }

            const msg = await common.makeForwardMsg(e, msgList, `即梦积分查询 (${accountList.length}个)`)
            await e.reply(msg)

        } catch (error) {
            logger.error('[即梦查积分] Error:', error)
            await e.reply(`查询失败: ${error.message}`, true)
        }
    }

    /** ^#即梦(签到|领取积分)$ */
    async receive_Jimeng_Points(e) {
        const accountList = this._getAccountList()
        const baseUrl = Config.getConfig().Jimeng.base_url
        if (accountList.length === 0) return e.reply('未配置 Token', true)

        await e.reply('开始批量签到，请稍候...', true)

        try {
            const authHeader = accountList.map(a => a.token).join(',')

            const res = await axios.post(`${baseUrl}/token/receive`, {}, {
                headers: { 'Authorization': `Bearer ${authHeader}` },
                timeout: 60000, // 签到可能较慢
                validateStatus: () => true
            })

            const data = res.data
            if (!Array.isArray(data)) {
                return e.reply(`签到请求异常: ${JSON.stringify(data)}`, true)
            }

            let successCount = 0
            const msgList = []

            for (const account of accountList) {
                const item = data.find(d => d.token === account.token) || {}
                const pts = item.credits || {}
                const statusIcon = item.received ? '✅ 领取成功' : (item.error ? '❌ 失败' : '⚪ 无需领取/已领')
                if (item.received) successCount++

                let detail = `[${account.index}] ${account.type}\n` +
                    `Token: ${this._maskToken(account.token)}\n` +
                    `结果: ${statusIcon}`

                if (item.error) detail += `\n错误: ${item.error}`
                if (item.credits) detail += `\n当前总积分: ${pts.totalCredit || 0}`

                msgList.push(detail)
            }

            const summary = `批量签到完成\n总数: ${accountList.length}\n成功领取: ${successCount}`
            msgList.unshift(summary)

            const msg = await common.makeForwardMsg(e, msgList, '即梦每日签到结果')
            await e.reply(msg)

        } catch (error) {
            logger.error('[即梦签到] Error:', error)
            await e.reply(`签到请求失败: ${error.message}`, true)
        }
    }

}
