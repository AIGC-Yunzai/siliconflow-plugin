import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import Config from '../components/Config.js'
import common from '../../../lib/common/common.js';
import {
    parseSourceImg,
    url2Base64,
} from '../utils/getImg.js'
import { LinkPlugin } from './link.js'
import { uploadImage } from '../utils/uploadImage.js'
import { memberControlProcess } from '../utils/memberControl.js'

export class MJ_Painting extends plugin {
    constructor() {
        super({
            name: 'MJP插件',
            dsc: 'Midjourney和Niji Journey图片生成',
            event: 'message',
            priority: 6,
            rule: [
                {
                    reg: '^#(mjp|niji)',
                    fnc: 'mj_draw'
                },
                {
                    reg: '^#(mjc|nic)',
                    fnc: 'mj_draw_with_link'
                },
                {
                    reg: '^#sfmj设置(apikey|apibaseurl|翻译key|翻译baseurl|翻译模型|翻译开关)',
                    fnc: 'setConfig',
                    permission: 'master'
                },
                {
                    reg: '^#(放大|微调|重绘)(左上|右上|左下|右下)',
                    fnc: 'handleAction'
                },
                {
                    reg: '^#sfmj设置开启(快速|慢速)模式$',
                    fnc: 'setMode',
                    permission: 'master'
                },
            ]
        })
        this.linkPlugin = new LinkPlugin()
    }

    async setConfig(e) {
        // 读取配置
        let config_date = Config.getConfig()
        const match = e.msg.match(/^#sfmj设置(apikey|apibaseurl|翻译key|翻译baseurl|翻译模型|翻译开关)([\s\S]*)/i)
        if (match) {
            const [, type, value] = match
            switch (type.toLowerCase()) {
                case 'apikey':
                    config_date.mj_apiKey = value.trim()
                    break
                case 'apibaseurl':
                    config_date.mj_apiBaseUrl = value.trim().replace(/\/$/, '')
                    break
                case '翻译key':
                    config_date.mj_translationKey = value.trim()
                    break
                case '翻译baseurl':
                    config_date.mj_translationBaseUrl = value.trim().replace(/\/$/, '')
                    break
                case '翻译模型':
                    config_date.mj_translationModel = value.trim()
                    break
                case '翻译开关':
                    config_date.mj_translationEnabled = value.toLowerCase() === '开'
                    break
                default:
                    await e.reply('未知的设置类型')
                    return
            }
            Config.setConfig(config_date)
            await e.reply(`${type}设置成功！`)
        } else {
            await e.reply('设置格式错误，请使用 "#sfmj设置[类型] [值]"')
        }
    }

    async setMode(e) {
        // 读取配置
        let config_date = Config.getConfig()
        const mode = e.msg.includes('快速') ? 'fast' : 'slow'
        config_date.mj_mode = mode
        Config.setConfig(config_date)
        await e.reply(`已切换到${mode === 'fast' ? '快速' : '慢速'}模式`)
    }

    async mj_draw(e) {
        // 读取配置
        let config_date = Config.getConfig()
        if (!config_date.mj_apiKey || !config_date.mj_apiBaseUrl) {
            const errorMsg = '请先设置API Key和API Base URL。使用命令：\n#mjp设置apikey [值]\n#mjp设置apibaseurl [值]\n（仅限主人设置）';
            if (e.ws) {
                this.sendMessage(e.ws, 'error', errorMsg);
            } else {
                await e.reply(errorMsg);
            }
            return;
        }

        const match = e.msg.match(/^#(mjp|niji)([\s\S]*)/)
        const botType = match[1] === 'mjp' ? 'MID_JOURNEY' : 'NIJI_JOURNEY'
        let prompt = match[2] ? match[2].trim() : ''

        if (prompt == "帮助") {
            this.showHelp(e)
            return true;
        } else if (prompt.match(/^(放大|微调|重绘)(左上|右上|左下|右下)/)) {
            e.msg = e.msg.replace(/^#(mjp|niji)/, '#')
            this.handleAction(e, config_date)
            return true;
        }

        // CD次数限制
        const memberConfig = {
            feature: 'SF_Painting',
            cdTime: config_date.sf_cdtime,
            dailyLimit: config_date.sf_dailyLimit,
            unlimitedUsers: config_date.sf_unlimitedUsers
        }
        const result_member = await memberControlProcess(e, memberConfig);
        if (!result_member.allowed) return e.reply(result_member.message, true, { recallMsg: 60 });

        // 如果是niji命令，自动添加--niji参数
        if (match[1] === 'niji' && !prompt.includes('--niji')) {
            prompt = `${prompt} --niji`
        }

        if (!prompt && !e.img) {
            await e.reply('请输入提示词或者提供一张图片')
            return
        }

        // 处理引用图片
        await parseSourceImg(e)
        let base64Array = []
        if (e.img) {
            for (let imgUrl of e.img) {
                const imgBase64 = await url2Base64(imgUrl)
                if (!imgBase64) {
                    e.reply('引用的图片地址已失效，请重新发送图片', true)
                    return false
                }
                base64Array.push(`data:image/png;base64,${imgBase64}`)
            }
        }

        result_member.record();

        e.reply('正在生成图片，请稍候...')
        this.mj_send_pic(e, prompt, botType, config_date, base64Array)
        return true;
    }

    async translatePrompt(userPrompt, config_date) {
        try {
            const response = await fetch(`${config_date.mj_translationBaseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config_date.mj_translationKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    "model": config_date.mj_translationModel,
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
            if (data.choices && data.choices[0] && data.choices[0].message) {
                return data.choices[0].message.content.trim()
            }
        } catch (error) {
            console.error("Translation failed", error)
        }
        return null
    }

    async submitTask(prompt, botType, config_date, base64Array = []) {
        const endpoint = config_date.mj_mode === 'fast' ? '/mj/submit/imagine' : '/mj-relax/mj/submit/imagine'
        const response = await fetch(`${config_date.mj_apiBaseUrl}${endpoint}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config_date.mj_apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                base64Array: base64Array,
                botType: botType,
                notifyHook: "",
                prompt: prompt,
                state: ""
            })
        })

        const data = await response.json()
        return data.result
    }

    async pollTaskResult(taskId, config_date) {
        let attempts = 0
        const maxAttempts = 120 // 10分钟超时
        while (attempts < maxAttempts) {
            const response = await fetch(`${config_date.mj_apiBaseUrl}/mj/task/${taskId}/fetch`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${config_date.mj_apiKey}`
                }
            })

            const data = await response.json()
            if (data.status === 'SUCCESS' && data.progress === '100%') {
                return data
            }

            if (data.status === 'FAILURE') {
                console.error("Task failed", data)
                return null
            }

            await new Promise(resolve => setTimeout(resolve, 5000)) // 等待5秒
            attempts++
        }

        console.error("Task timed out")
        return null
    }

    async handleAction(e, config_date = null) {
        // 读取配置
        if (!config_date)
            config_date = Config.getConfig()
        if (!config_date.mj_apiKey || !config_date.mj_apiBaseUrl) {
            const errorMsg = '请先设置API Key和API Base URL。使用命令：\n#sfmj设置apikey [值]\n#sfmj设置apibaseurl [值]\n（仅限主人设置）';
            if (e.ws) {
                this.sendMessage(e.ws, 'error', errorMsg);
            } else {
                await e.reply(errorMsg);
            }
            return;
        }

        // CD次数限制
        const memberConfig = {
            feature: 'SF_Painting',
            cdTime: config_date.sf_cdtime,
            dailyLimit: config_date.sf_dailyLimit,
            unlimitedUsers: config_date.sf_unlimitedUsers
        }
        const result_member = await memberControlProcess(e, memberConfig);
        if (!result_member.allowed) return e.reply(result_member.message, true, { recallMsg: 60 });

        const match = e.msg.match(/^#(放大|微调|重绘)(左上|右上|左下|右下)([\s\S]*)/)
        if (match) {
            const [, action, position, taskId] = match
            let useTaskId = taskId.trim() || await redis.get(`sf_plugin:MJ_Painting:lastTaskId:${e.user_id}`)

            if (!useTaskId) {
                const errorMsg = '请提供任务ID或先生成一张图片。';
                if (e.ws) {
                    this.sendMessage(e.ws, 'error', errorMsg);
                } else {
                    await e.reply(errorMsg);
                }
                return;
            }

            result_member.record();

            if (e.ws) {
                this.sendMessage(e.ws, 'mj', '正在处理，请稍候...');
            } else {
                await e.reply('正在处理，请稍候...');
            }

            try {
                const originalTask = await this.fetchTaskDetails(useTaskId, config_date)
                if (!originalTask) {
                    const errorMsg = '获取原始任务信息失败，请确保任务ID正确。';
                    if (e.ws) {
                        this.sendMessage(e.ws, 'error', errorMsg);
                    } else {
                        await e.reply(errorMsg);
                    }
                    return;
                }

                const positionMap = { '左上': 1, '右上': 2, '左下': 3, '右下': 4 }
                const actionNumber = positionMap[position]
                let customId

                if (action === '重绘') {
                    customId = `MJ::JOB::reroll::0::${originalTask.properties.messageHash}::SOLO`
                } else {
                    const actionType = action === '放大' ? 'upsample' : 'variation'
                    customId = `MJ::JOB::${actionType}::${actionNumber}::${originalTask.properties.messageHash}`
                }

                const newTaskId = await this.submitAction(customId, useTaskId, config_date)
                if (!newTaskId) {
                    const errorMsg = '提交操作失败，请稍后重试。';
                    if (e.ws) {
                        this.sendMessage(e.ws, 'error', errorMsg);
                    } else {
                        await e.reply(errorMsg);
                    }
                    return;
                }

                const result = await this.pollTaskResult(newTaskId, config_date)
                if (result) {
                    const replyMsg = `操作完成！\n操作类型：${action}${position}\n新任务ID：${newTaskId}\n图片链接：${result.imageUrl}`;

                    if (e.ws) {
                        this.sendMessage(e.ws, 'mj', replyMsg);
                        this.sendMessage(e.ws, 'image', {
                            type: 'image',
                            file: result.imageUrl
                        });

                        // 保存绘画记录到Redis
                        const userQQ = e.user_id || 'web_user';
                        const historyKey = `CHATBOT:HISTORY:${userQQ}:dd`;
                        const cmdPrefix = botType === 'NIJI_JOURNEY' ? '#niji' : '#mjp';
                        const messages = [
                            {
                                role: 'user',
                                content: `${cmdPrefix} ${prompt}`
                            },
                            {
                                role: 'assistant',
                                content: `![生成的图片](${result.imageUrl})\n\n${replyMsg}`
                            }
                        ];
                        redis.lPush(historyKey, JSON.stringify(messages));
                        // 限制历史记录长度为50条对话(100条消息)
                        redis.lTrim(historyKey, 0, 99);
                    } else {
                        await e.reply(replyMsg);
                        await e.reply({ ...segment.image(result.imageUrl), origin: true });
                    }

                    redis.set(`sf_plugin:MJ_Painting:lastTaskId:${e.user_id}`, newTaskId, { EX: 7 * 24 * 60 * 60 }); // 写入redis，有效期7天
                } else {
                    const errorMsg = '操作失败，请稍后重试。';
                    if (e.ws) {
                        this.sendMessage(e.ws, 'error', errorMsg);
                    } else {
                        await e.reply(errorMsg);
                    }
                }
            } catch (error) {
                logger.error("操作失败", error);
                const errorMsg = '处理时遇到了一个错误，请稍后再试。';
                if (e.ws) {
                    this.sendMessage(e.ws, 'error', errorMsg);
                } else {
                    await e.reply(errorMsg);
                }
            }
        }
    }

    async fetchTaskDetails(taskId, config_date) {
        const response = await fetch(`${config_date.mj_apiBaseUrl}/mj/task/${taskId}/fetch`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${config_date.mj_apiKey}`
            }
        })

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        return await response.json()
    }

    async submitAction(customId, taskId, config_date) {
        const response = await fetch(`${config_date.mj_apiBaseUrl}/mj/submit/action`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config_date.mj_apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                customId: customId,
                taskId: taskId
            })
        })

        const data = await response.json()
        return data.result
    }

    async showHelp(e) {
        const helpMessage = `  
MJP插件帮助：  

1. 生成图片：  
   #mjp [提示词] (使用Midjourney)  
   #niji [提示词] (使用Niji Journey)  
   #mjc [提示词] (使用图片参考)
   #nic [提示词] (使用图片参考 + Niji风格)
   例：#mjp 一只可爱的猫咪  
   例：#niji 一只可爱的动漫风格猫咪  

   垫图功能：
   引用一张图片并发送命令即可使用垫图功能
   例：[图片] #mjp 基于这张图片画一只可爱的猫咪
   例：[图片] #nic 基于这张图片画一只可爱的动漫猫咪

2. 图片操作：  
   #[操作][位置] [任务ID]  
   操作：放大、微调、重绘  
   位置：左上、右上、左下、右下  
   例：#放大左上 1234567890  
   例：#微调右下 1234567890  
   例：#重绘 1234567890  
   注：mjc/nic生成的图片也支持这些操作

3. 设置（仅限主人）：  
   #sfmj设置apikey [API密钥]  
   #sfmj设置apibaseurl [API基础URL] （不带/v1）  
   #sfmj设置翻译key [翻译API密钥]  
   #sfmj设置翻译baseurl [翻译API基础URL] （不带/v1）  
   #sfmj设置翻译模型 [翻译模型名称]  
   #sfmj设置翻译开关 [开/关]  

4. 切换模式（仅限主人）：  
   #sfmj设置开启快速模式  
   #sfmj设置开启慢速模式  

5. 显示帮助：  
   #mjp帮助  

注意：使用前请确保已正确设置所有必要的API密钥和基础URL。
        `.trim()

        await e.reply(helpMessage)
    }

    async mj_send_pic(e, prompt, botType, config_date, base64Array) {
        try {
            if (config_date.mj_translationEnabled && config_date.mj_translationKey && config_date.mj_translationBaseUrl) {
                const translatedPrompt = await this.translatePrompt(prompt, config_date)
                if (translatedPrompt) {
                    prompt = translatedPrompt
                    if (e.ws) {
                        this.sendMessage(e.ws, 'mj', `翻译后的提示词：${prompt}`);
                    } else {
                        await e.reply(`翻译后的提示词：${prompt}`);
                    }
                }
            }

            const taskId = await this.submitTask(prompt, botType, config_date, base64Array)
            if (!taskId) {
                const errorMsg = '提交任务失败，请稍后重试。';
                if (e.ws) {
                    this.sendMessage(e.ws, 'error', errorMsg);
                } else {
                    await e.reply(errorMsg);
                }
                return;
            }

            const result = await this.pollTaskResult(taskId, config_date)
            if (result) {
                const replyMsg = `@${e.sender?.card || e.sender?.nickname || 'User'} ${e.user_id}您的图片已生成完成：\n\n原始提示词：${prompt}\n任务ID：${taskId}\n图片链接：${result.imageUrl}`;

                if (e.ws) {
                    // WebSocket连接，发送消息和图片
                    this.sendMessage(e.ws, 'mj', replyMsg);
                    this.sendMessage(e.ws, 'image', {
                        type: 'image',
                        file: result.imageUrl
                    });

                    // 保存绘画记录到Redis
                    const userQQ = e.user_id || 'web_user';
                    const historyKey = `CHATBOT:HISTORY:${userQQ}:dd`;
                    const cmdPrefix = botType === 'NIJI_JOURNEY' ? '#niji' : '#mjp';
                    const messages = [
                        {
                            role: 'user',
                            content: `${cmdPrefix} ${prompt}`
                        },
                        {
                            role: 'assistant',
                            content: `![生成的图片](${result.imageUrl})\n\n${replyMsg}`
                        }
                    ];
                    redis.lPush(historyKey, JSON.stringify(messages));
                    // 限制历史记录长度为50条对话(100条消息)
                    redis.lTrim(historyKey, 0, 99);
                } else {
                    // 普通聊天
                    await e.reply(replyMsg);
                    e.reply({ ...segment.image(result.imageUrl), origin: true });
                }

                redis.set(`sf_plugin:MJ_Painting:lastTaskId:${e.user_id}`, taskId, { EX: 7 * 24 * 60 * 60 }); // 写入redis，有效期7天
            } else {
                const errorMsg = '生成图片失败，请稍后重试。';
                if (e.ws) {
                    this.sendMessage(e.ws, 'error', errorMsg);
                } else {
                    e.reply(errorMsg);
                }
            }
        } catch (error) {
            logger.error("图片生成失败", error);
            const errorMsg = '生成图片时遇到了一个错误，请稍后再试。';
            if (e.ws) {
                this.sendMessage(e.ws, 'error', errorMsg);
            } else {
                e.reply(errorMsg);
            }
        }
    }

    // 添加sendMessage方法用于WebSocket通信
    sendMessage(ws, type, content) {
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
                messageContent = content.text || '';
                imageUrl = base64Data;
            }
            // 如果是本地文件路径，读取并转换为base64
            else if (content.file && typeof content.file === 'string' && !content.file.startsWith('http')) {
                try {
                    const fs = require('fs');
                    const imageBuffer = fs.readFileSync(content.file);
                    const base64Data = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
                    messageContent = content.text || '';
                    imageUrl = base64Data;
                } catch (error) {
                    logger.error('[MJ插件] 读取本地图片失败:', error);
                    messageContent = '[图片发送失败]';
                }
            }
            // 如果是网络URL，直接传递URL
            else if (content.file && content.file.startsWith('http')) {
                messageContent = content.text || '';
                imageUrl = content.file;
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
                        return '';
                    }
                    // 如果是本地文件，转换为base64
                    try {
                        const fs = require('fs');
                        const imageBuffer = fs.readFileSync(url);
                        const base64Data = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
                        imageUrl = base64Data;
                        return '';
                    } catch (error) {
                        logger.error('[MJ插件] 读取本地图片失败:', error);
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
            // 如果是图片类型消息，将图片URL转换为markdown格式
            if (type === 'image') {
                message.content = `![图片](${imageUrl})`;
            }
        }

        try {
            // 添加日志记录
            const config = Config.getConfig();
            const logLevel = config.wsLogLevel || 'info';
            if (logLevel === 'debug') {
                logger.mark(`[MJ插件][WebSocket] 发送消息: ${JSON.stringify(message, null, 2)}`);
            } else if (logLevel === 'info') {
                logger.mark(`[MJ插件][WebSocket] 发送${type}类型消息: ${messageContent}`);
            }

            ws.send(JSON.stringify(message));
        } catch (error) {
            logger.error('[MJ插件] 发送消息失败:', error);
            this.sendError(ws, '发送消息失败: ' + error.message);
        }
    }

    // 添加sendError方法用于发送错误消息
    sendError(ws, errorMessage) {
        const message = {
            type: 'error',
            content: errorMessage,
            timestamp: new Date().getTime()
        };

        try {
            ws.send(JSON.stringify(message));
        } catch (error) {
            logger.error("图片生成失败", error)
            e.reply('生成图片时遇到了一个错误，请稍后再试。')
        }
    }

    async mj_draw_with_link(e) {
        let config_date = Config.getConfig()
        if (!config_date.mj_apiKey || !config_date.mj_apiBaseUrl) {
            await e.reply('请先设置API Key和API Base URL。使用命令：\n#mjp设置apikey [值]\n#mjp设置apibaseurl [值]\n（仅限主人设置）')
            return
        }

        const match = e.msg.match(/^#(mjc|nic)([\s\S]*)/)
        let prompt = match[2] ? match[2].trim() : ''

        if (prompt == "帮助") {
            this.showHelp(e)
            return true;
        } else if (prompt.match(/^(放大|微调|重绘)(左上|右上|左下|右下)/)) {
            e.msg = e.msg.replace(/^#(mjc|nic)/, '#')
            this.handleAction(e, config_date)
            return true;
        }

        // CD次数限制
        const memberConfig = {
            feature: 'SF_Painting',
            cdTime: config_date.sf_cdtime,
            dailyLimit: config_date.sf_dailyLimit,
            unlimitedUsers: config_date.sf_unlimitedUsers
        }
        const result_member = await memberControlProcess(e, memberConfig);
        if (!result_member.allowed) return e.reply(result_member.message, true, { recallMsg: 60 });

        const isNiji = match[1] === 'nic'  // 判断是否是 nic 命令

        // 添加图片解析
        await parseSourceImg(e)

        if (!prompt || !e.img) {
            await e.reply('请输入提示词并提供一张图片')
            return
        }

        result_member.record();

        try {
            const imgUrl = e.img[0]
            logger.info('[MJ_Painting] Original image URL:', imgUrl)

            // 使用 uploadImage 获取直链
            const uploadedUrl = await uploadImage(imgUrl, config_date)
            logger.info('[MJ_Painting] Uploaded image URL:', uploadedUrl)

            if (!uploadedUrl) {
                logger.error('[MJ_Painting] Failed to get image link')
                await e.reply('获取图片直链失败，请重试')
                return
            }

            // 构建最终的 prompt
            prompt = `${prompt} --cref ${uploadedUrl}${isNiji ? ' --niji' : ''}`
            logger.info(`[MJ_Painting] Final prompt: ${prompt}`)

            await e.reply('正在生成图片，请稍候...')
            const botType = isNiji ? 'NIJI_JOURNEY' : 'MID_JOURNEY'
            await this.mj_send_pic(e, prompt, botType, config_date, [])
            return true

        } catch (err) {
            logger.error('[MJ_Painting] Error in mj_draw_with_link:', err)
            await e.reply('处理图片时发生错误，请重试')
            return false
        }
    }
}
