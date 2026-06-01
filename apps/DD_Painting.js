import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import Config from '../components/Config.js'
import common from '../../../lib/common/common.js';
import { handleParam } from '../utils/parse_Oai.js'
import { memberControlProcess } from '../utils/memberControl.js'
import { hidePrivacyInfo } from '../utils/common.js'
import {
    parseSourceImg,
    url2Base64,
    getMediaFrom_awaitContext,
} from '../utils/getImg.js'
import { applyPresets } from '../utils/applyPresets.js'

export class DD_Painting extends plugin {
    constructor() {
        super({
            name: 'DD_绘图',
            dsc: '多平台AI绘图',
            event: 'message',
            priority: 1144,
            rule: [
                {
                    reg: '^#(dd|DD)',
                    fnc: 'dd_draw'
                },
                {
                    reg: '^#(sf|SF)(dd|d|o|n)(.*)接口列表$',
                    fnc: 'dd_list_api',
                },
                {
                    reg: '^#(sf|SF)(dd|DD)使用接口(\\d+)$',
                    fnc: 'dd_select_api',
                },
                {
                    reg: '^#(d|D)(?!d|D)(.+)',
                    fnc: 'dd_custom_command',
                },
                {
                    reg: '^#(sf|SF)(dd|DD)帮助$',
                    fnc: 'dd_help',
                },
            ]
        })
    }

    // 处理自定义命令
    async dd_custom_command(e) {
        // 读取配置
        let config_date = Config.getConfig()

        // 提取命令和内容
        const fullMsg = e.msg.trim()
        const withoutPrefix = fullMsg.substring(2)

        // 尝试匹配自定义命令
        const apiList = config_date.dd_APIList || []
        if (apiList.length === 0) {
            // await e.reply('当前没有配置任何接口，请先添加接口')
            logger.debug('[sf插件][dd绘画]未匹配到接口')
            return false
        }

        // 获取第一行内容用于命令匹配
        const firstLine = withoutPrefix.split('\n')[0].trim()
        const matchedApis = apiList
            .filter(api => api.customCommand && firstLine.startsWith(api.customCommand))
            .sort((a, b) => b.customCommand.length - a.customCommand.length)

        if (matchedApis.length > 0) {
            const matchedApi = matchedApis[0]
            const cmdLength = matchedApi.customCommand.length

            // 提取内容并保持格式
            let content

            // 如果命令在第一行，需要特殊处理第一行的内容
            const lines = withoutPrefix.split('\n')
            if (lines[0].trim().startsWith(matchedApi.customCommand)) {
                // 保留第一行命令后的内容（处理有空格和无空格的情况）
                const firstLineContent = lines[0].substring(cmdLength).trimLeft()
                // 如果第一行除了命令还有其他内容，或者只有一行
                if (firstLineContent || lines.length === 1) {
                    content = firstLineContent + (lines.length > 1 ? '\n' + lines.slice(1).join('\n') : '')
                } else {
                    // 如果第一行只有命令，从第二行开始
                    content = lines.slice(1).join('\n')
                }
            } else {
                // 处理命令和内容在同一行且无空格分隔的情况
                content = withoutPrefix.substring(cmdLength).trimLeft()
            }

            // 如果提取的内容为空，尝试获取下一行
            if (!content.trim() && lines.length > 1) {
                content = lines.slice(1).join('\n')
            }

            // 确保内容不是纯空白字符
            if (!content || content.trim().length === 0) {
                await e.reply('请输入要绘制的内容')
                return false
            }

            // 获取接口索引
            const apiIndex = apiList.indexOf(matchedApi) + 1

            // 使用指定接口绘图
            return await this.dd_draw_with_api(e, content, apiIndex, config_date)
        }

        // 尝试匹配数字命令（支持无空格情况）
        const numberMatch = withoutPrefix.match(/^(\d+)(?:\s+|\n)?([\s\S]*)/)
        if (numberMatch) {
            const [, cmd, content] = numberMatch
            const apiIndex = parseInt(cmd)

            // 确保内容部分不是空的
            if (content && content.trim()) {
                // 检查接口是否存在
                if (!apiList || apiIndex <= 0 || apiIndex > apiList.length) {
                    // await e.reply(`接口${index}不存在，请检查接口列表`)
                    logger.debug('[sf插件][dd绘画]未匹配到接口')
                    return false
                }

                // 使用指定接口绘图
                return await this.dd_draw_with_api(e, content, apiIndex, config_date)
            }
        }

        // 尝试匹配空格分隔的命令
        const firstSpaceIndex = withoutPrefix.search(/\s/)
        if (firstSpaceIndex !== -1) {
            const cmd = withoutPrefix.substring(0, firstSpaceIndex)
            const content = withoutPrefix.substring(firstSpaceIndex + 1)

            // 确保内容部分不是空的
            if (content && content.trim()) {
                // 查找匹配的自定义命令
                const apiIndex = apiList.findIndex(api => api.customCommand === cmd)
                if (apiIndex !== -1) {
                    // 使用指定接口绘图
                    return await this.dd_draw_with_api(e, content, apiIndex + 1, config_date)
                }

                // 尝试解析为数字索引
                if (!isNaN(cmd)) {
                    const index = parseInt(cmd)
                    if (!apiList || index <= 0 || index > apiList.length) {
                        // await e.reply(`接口${index}不存在，请检查接口列表`)
                        logger.debug('[sf插件][dd绘画]未匹配到接口数字索引')
                        return false
                    }

                    // 使用指定接口绘图
                    return await this.dd_draw_with_api(e, content, index, config_date)
                }
            }
        }

        // await e.reply('命令格式错误，请使用 "#d[自定义命令] [提示词]" 或 "#d[接口索引] [提示词]"')
        logger.debug('[sf插件][dd绘画]未匹配到接口')
        return false
    }

    // 随机获取API Key
    getRandomApiKey(apiKeyString) {
        if (!apiKeyString) return '';
        // 支持英文逗号和中文逗号分隔
        const keys = apiKeyString.replace(/，/g, ',').split(',').map(k => k.trim()).filter(k => k);
        if (keys.length === 0) return '';
        const randomIndex = Math.floor(Math.random() * keys.length);
        return keys[randomIndex];
    }

    // 调用绘图API的工厂函数
    async callDrawingAPI(apiConfig, param = {}, e = {}) {
        try {
            let requestUrl, payload

            const formatType = apiConfig.formatType;
            if (formatType === 'modelscope') {
                requestUrl = `https://api-inference.modelscope.cn/v1/images/generations`;
                const basePayload = {
                    model: apiConfig.model,
                    prompt: param.input || " ",
                    seed: param.parameters.seed ?? undefined,
                    negative_prompt: param.parameters.negative_prompt || undefined,
                    steps: param.parameters.steps || undefined,
                    guidance: param.parameters.guidance || undefined,
                    image_url: param.souce_image_base64 ? `data:image/png;base64,${param.souce_image_base64}` : undefined,
                    loras: param.parameters.loras || undefined,
                };
                Object.keys(basePayload).forEach(key => basePayload[key] === undefined && delete basePayload[key]);

                // 插入 extraParams
                payload = this.buildPayload_for_extraParams(basePayload, apiConfig, param);
            } else if (formatType === 'nebius') {
                requestUrl = `https://api.studio.nebius.com/v1/images/generations`;
                const basePayload = {
                    model: apiConfig.model,
                    prompt: param.input || " ",
                    response_format: apiConfig.response_format || 'b64_json',
                    response_extension: apiConfig.response_extension || 'webp',
                    width: param.parameters.width || 1024,
                    height: param.parameters.height || 1024,
                    num_inference_steps: param.parameters.steps || 28,
                    negative_prompt: param.parameters.negative_prompt || undefined,
                    seed: param.parameters.seed ?? -1,
                };
                Object.keys(basePayload).forEach(key => basePayload[key] === undefined && delete basePayload[key]);

                // 插入 extraParams
                payload = this.buildPayload_for_extraParams(basePayload, apiConfig, param);
            } else if (formatType === 'openai') {
                let baseUrl = apiConfig.baseUrl || 'https://api.openai.com/v1';

                // 处理基础URL与端点路径
                baseUrl = baseUrl.replace(/\/$/, '');
                if (!baseUrl.endsWith('/v1')) {
                    baseUrl += '/v1';
                }

                const hasImages = param.source_images && param.source_images.length > 0;
                requestUrl = baseUrl + (hasImages ? '/images/edits' : '/images/generations');

                const basePayload = {
                    model: apiConfig.model,
                    prompt: param.input || " ",
                    n: 1,
                    response_format: apiConfig.response_format || 'b64_json',
                };

                // 添加尺寸参数
                if (param.parameters.height && param.parameters.width) {
                    basePayload.size = `${param.parameters.width}x${param.parameters.height}`;
                }

                // 如果存在源图片，标记为图片编辑模式
                if (hasImages) {
                    basePayload.is_edit_mode = true;
                }

                Object.keys(basePayload).forEach(key => basePayload[key] === undefined && delete basePayload[key]);

                // 插入 extraParams
                payload = this.buildPayload_for_extraParams(basePayload, apiConfig, param);
            }

            // 获取随机API Key
            const apiKey = this.getRandomApiKey(apiConfig.apiKey);

            // 构建请求头
            let headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'Apifox/1.0.0 (https://apifox.com)',
                'Authorization': `Bearer ${apiKey}`,
            };

            // ModelScope 特殊处理：需要异步任务模式
            if (formatType === 'modelscope') {
                // 为 ModelScope 添加异步模式标头
                headers['X-ModelScope-Async-Mode'] = 'true';

                // 第一步：提交任务
                const response = await fetch(requestUrl, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(payload, null, 2)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    logger.error(`ModelScope API请求失败: ${response.status}`, errorText);
                    return {
                        success: false,
                        error: `ModelScope API响应错误 ${response.status}: ${errorText}`
                    };
                }

                const taskResponse = await response.json();
                if (!taskResponse || !taskResponse.task_id) {
                    return {
                        success: false,
                        error: 'ModelScope 任务提交失败，未获取到 task_id'
                    };
                }

                const taskId = taskResponse.task_id;
                logger.info(`ModelScope 任务已提交，task_id: ${taskId}`);

                // 第二步：轮询任务状态
                const taskCheckUrl = `https://api-inference.modelscope.cn/v1/tasks/${taskId}`;
                const taskHeaders = {
                    ...headers,
                    'X-ModelScope-Task-Type': 'image_generation'
                };
                delete taskHeaders['X-ModelScope-Async-Mode']; // 查询任务时不需要这个头

                let attempts = 0;
                const maxAttempts = 60; // 最多等待5分钟（每5秒检查一次）

                while (attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 5000)); // 等待5秒
                    attempts++;

                    try {
                        const taskResult = await fetch(taskCheckUrl, {
                            method: 'GET',
                            headers: taskHeaders
                        });

                        if (!taskResult.ok) {
                            logger.error(`ModelScope 任务查询失败: ${taskResult.status}`);
                            continue;
                        }

                        const taskData = await taskResult.json();
                        if (attempts % 10 === 0) {
                            logger.info(`ModelScope 任务状态检查 (${attempts}/${maxAttempts}):`, taskData.task_status);
                        }

                        if (taskData.task_status === 'SUCCEED') {
                            if (taskData.output_images && taskData.output_images.length > 0) {
                                // 返回第一个生成的图片URL
                                const imageUrl = taskData.output_images[0];
                                return {
                                    success: true,
                                    imageData: imageUrl,
                                    revised_prompt: param.input,
                                    payload: payload
                                };
                            } else {
                                return {
                                    success: false,
                                    error: 'ModelScope 任务完成但未返回图片数据'
                                };
                            }
                        } else if (taskData.task_status === 'FAILED') {
                            return {
                                success: false,
                                error: `ModelScope 图片生成失败: ${taskData.error || '未知错误'}`
                            };
                        }
                        // 如果状态是 PENDING 或 RUNNING，继续循环等待
                    } catch (error) {
                        logger.error('ModelScope 任务状态查询出错:', error);
                        // 继续循环，不立即失败
                    }
                }

                return {
                    success: false,
                    error: 'ModelScope 任务超时，请稍后重试'
                };
            } else if (formatType === 'nebius') {
                const response = await fetch(requestUrl, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(payload, null, 2)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    logger.error(`Nebius API请求失败: ${response.status}`, errorText);
                    return {
                        success: false,
                        error: `Nebius API响应错误 ${response.status}: ${errorText}`
                    };
                }

                const data = await response.json();

                let imageUrl;
                if (data.data && Array.isArray(data.data) && data.data.length > 0) {
                    if (data.data[0].b64_json) {
                        imageUrl = `base64://${data.data[0].b64_json}`;
                    } else if (data.data[0].url) {
                        imageUrl = data.data[0].url;
                    }
                }

                if (imageUrl) {
                    return {
                        success: true,
                        imageData: imageUrl,
                        revised_prompt: param.input,
                        payload: payload
                    };
                } else {
                    return {
                        success: false,
                        error: 'Nebius API响应格式未知或未返回图片数据'
                    };
                }
            } else if (formatType === 'openai') {
                // 准备 fetch 请求参数
                let fetchOptions = {
                    method: 'POST',
                    headers: { ...headers }
                };

                if (payload.is_edit_mode) {
                    let formData = new FormData();
                    for (const key in payload) {
                        if (key === 'is_edit_mode') continue;
                        const value = payload[key];
                        formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
                    }

                    // 处理多图上传
                    if (param.source_images && param.source_images.length > 0) {
                        param.source_images.forEach((b64, index) => {
                            const imageBuffer = Buffer.from(b64, 'base64');
                            const imageBlob = new Blob([imageBuffer], { type: 'image/png' });
                            formData.append('image', imageBlob, `image_${index}.png`);
                        });
                    }

                    // 原生 FormData 只需删掉 Content-Type，fetch 就会自动生成 multipart/form-data 头部
                    delete fetchOptions.headers['Content-Type'];
                    fetchOptions.body = formData;

                    // 清除标记，防止影响后续发出的合并转发消息日志
                    delete payload.is_edit_mode;
                } else {
                    // 普通文生图保留标准 JSON 模式
                    fetchOptions.body = JSON.stringify(payload, null, 2);
                }

                const response = await fetch(requestUrl, fetchOptions);

                if (!response.ok) {
                    const errorText = await response.text();
                    logger.error(`OpenAI API请求失败: ${response.status}`, errorText);
                    return {
                        success: false,
                        error: `OpenAI API响应错误 ${response.status}: ${errorText}`
                    };
                }

                const data = await response.json();

                let imageUrl;
                // 支持自定义响应解析路径 // 未启用
                if (apiConfig.responsePath) {
                    try {
                        const pathParts = apiConfig.responsePath.split(/[.\[\]]+/).filter(Boolean);
                        let val = data;
                        for (const part of pathParts) {
                            if (val == null) break;
                            val = val[part];
                        }
                        if (typeof val === 'string') {
                            imageUrl = val;
                            if (!imageUrl.startsWith('http') && !imageUrl.startsWith('base64://') && !imageUrl.startsWith('data:')) {
                                imageUrl = `base64://${imageUrl}`;
                            }
                        }
                    } catch (e) {
                        logger.error(`解析响应路径 ${apiConfig.responsePath} 失败`, e);
                    }
                }

                if (!imageUrl) {
                    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
                        if (data.data[0].b64_json) {
                            imageUrl = `base64://${data.data[0].b64_json}`;
                        } else if (data.data[0].url) {
                            imageUrl = data.data[0].url;
                        }
                    }
                }

                if (imageUrl) {
                    return {
                        success: true,
                        imageData: imageUrl,
                        revised_prompt: param.input,
                        payload: payload
                    };
                } else {
                    return {
                        success: false,
                        error: 'OpenAI API响应格式未知或未返回图片数据'
                    };
                }
            }

            return {
                success: false,
                error: '接口类型 设置错误'
            };
        } catch (error) {
            logger.error('API调用错误:', error);
            return {
                success: false,
                error: error.message || '未知错误'
            };
        }
    }

    // 构建 extraParams 请求体
    buildPayload_for_extraParams(basePayload, apiConfig, param = {}) {
        // 创建请求体副本，避免修改原始对象
        const payload = { ...basePayload };
        if (apiConfig.extraParams) {
            try {
                const extraParams = typeof apiConfig.extraParams === 'string'
                    ? JSON.parse(apiConfig.extraParams)
                    : apiConfig.extraParams;
                Object.assign(payload, extraParams);
            } catch (error) {
                logger.error('解析extraParams失败:', error);
            }
        }
        return payload;
    }

    // 格式化请求参数为可读文本
    formatPayloadToText(payload) {
        if (!payload) return '';

        // 过滤掉不需要显示的敏感字段
        const filteredPayload = { ...payload };
        delete filteredPayload.api_key;
        delete filteredPayload.image_url;
        delete filteredPayload.images;

        // 格式化参数为文本
        let result = [];

        // 处理常见参数
        if (filteredPayload.model) result.push(`模型: ${filteredPayload.model}`);
        if (filteredPayload.prompt) result.push(`提示词: ${filteredPayload.prompt}`);
        if (filteredPayload.size) result.push(`尺寸: ${filteredPayload.size}`);
        if (filteredPayload.width && filteredPayload.height) result.push(`尺寸: ${filteredPayload.width}x${filteredPayload.height}`);
        if (filteredPayload.quality) result.push(`质量: ${filteredPayload.quality}`);
        if (filteredPayload.style) result.push(`风格: ${filteredPayload.style}`);

        // Nebius特有参数
        if (filteredPayload.num_inference_steps) result.push(`推理步数: ${filteredPayload.num_inference_steps}`);
        if (filteredPayload.negative_prompt) result.push(`负面提示词: ${filteredPayload.negative_prompt}`);
        if (filteredPayload.seed !== undefined) result.push(`种子: ${filteredPayload.seed}`);
        if (filteredPayload.response_format) result.push(`响应格式: ${filteredPayload.response_format}`);

        // 其他参数
        const handledKeys = ['model', 'prompt', 'size', 'width', 'height', 'quality', 'style',
            'num_inference_steps', 'negative_prompt', 'seed', 'response_format'];

        for (const key in filteredPayload) {
            if (!handledKeys.includes(key)) {
                const value = filteredPayload[key];
                if (typeof value === 'object') {
                    result.push(`${key}: ${JSON.stringify(value)}`);
                } else {
                    result.push(`${key}: ${value}`);
                }
            }
        }

        return result.join('\n');
    }

    async txt2img_generatePrompt(e, userPrompt, config_date) {
        // 确定是否需要自动提示词
        let shouldGenerate = false;
        if (e.sfRuntime && e.sfRuntime.isgeneratePrompt !== undefined) {
            shouldGenerate = e.sfRuntime.isgeneratePrompt;
        } else if (e.currentApiConfig && e.currentApiConfig.enableGeneratePrompt === true) {
            shouldGenerate = true;
            if (e.sfRuntime) e.sfRuntime.isgeneratePrompt = true;
        }

        if (shouldGenerate) {
            const m = await import('./SF_Painting.js');
            const sf = new m.SF_Painting();

            const result = await sf.txt2img_generatePrompt(e, userPrompt, config_date);
            return result;
        } else
            return userPrompt;
    }

    /**
     * @description: 使用指定接口绘图
     * @param {*} e
     * @param {*} prompt
     * @param {*} apiIndex
     * @param {*} config_date
     * @return {*}
     */
    async dd_draw_with_api(e, prompt, apiIndex, config_date = null) {
        // 读取配置
        if (!config_date)
            config_date = Config.getConfig();
        e.sfRuntime = config_date;

        // 获取接口配置
        const apiList = config_date.dd_APIList || []
        if (!apiList || apiIndex <= 0 || apiIndex > apiList.length) {
            await e.reply(`接口${apiIndex}不存在，请检查接口列表`, true)
            return false
        }

        const apiConfig = apiList[apiIndex - 1]
        // 保存当前接口配置到 e 对象，供自动提示词功能使用
        e.currentApiConfig = apiConfig

        if (apiConfig.isOnlyMaster && !e.isMaster) {
            await e.reply('此接口仅限主人使用', true)
            return false
        }

        // CD次数限制
        const memberConfig = {
            feature: `dd_${apiConfig.customCommand}`,
            cdTime: apiConfig.dd_cdtime,
            dailyLimit: apiConfig.dd_dailyLimit,
            unlimitedUsers: apiConfig.dd_unlimitedUsers,
            onlyGroupID: apiConfig.dd_onlyGroupID,
        }
        const result_member = await memberControlProcess(e, memberConfig);
        if (!result_member.allowed) {
            if (result_member.message)
                e.reply(result_member.message, true, { recallMsg: 60 });
            return true;
        }

        // 处理引用图片
        await parseSourceImg(e);
        let source_images = [];
        if (apiConfig.enableImageUpload && e.img?.length) {
            for (const imgUrl of e.img) {
                try {
                    if (typeof imgUrl !== 'string') continue;
                    // 判断是否为 data: 协议、base64:// 协议，或者本身就是纯 Base64 字符串
                    if (imgUrl.startsWith('data:') || imgUrl.startsWith('base64://')) {
                        let base64Data = imgUrl;
                        if (imgUrl.startsWith('base64://')) {
                            base64Data = imgUrl.replace(/^base64:\/\//i, '');
                        } else if (imgUrl.startsWith('data:')) {
                            const match = imgUrl.match(/^data:([^;]+);base64,(.+)$/);
                            if (match) {
                                base64Data = match[2];
                            } else {
                                base64Data = imgUrl.split(',')[1] || imgUrl;
                            }
                        }
                        if (base64Data) {
                            source_images.push(base64Data);
                            continue;
                        }
                    }

                    // 尝试转换普通的 http/https URL 为 base64
                    const base64Image = await url2Base64(imgUrl);
                    if (!base64Image) {
                        logger.error(`[SF插件][dd]图片处理失败: ${imgUrl}`);
                        continue;
                    }
                    source_images.push(base64Image);
                } catch (error) {
                    logger.error(`[SF插件][dd]处理图片时出错: ${error.message}`);
                    continue;
                }
            }

            if (source_images.length === 0) {
                e.reply('引用的图片地址已失效或无法解析，请重新发送图片', true)
                return true
            }
        }

        e.dd_parse_Oai = {
            formatType: apiConfig.formatType,
            maxArea: apiConfig.formatType === 'openai' ? 8294400 : 1048576,
        };

        // 处理预设
        let param = await handleParam(e, applyPresets(prompt, Config.getConfig("presets"), e)?.processedText)
        if (source_images.length > 0) {
            param.souce_image_base64 = source_images[0];
            param.source_images = source_images;
        }

        // 要求上传更多图片
        let upimgs_num = parseInt(param.parameters.upimgs);
        if (!isNaN(upimgs_num) && upimgs_num > 0) {
            upimgs_num = Math.min(upimgs_num, 1)
            if (!(await getMediaFrom_awaitContext(e, this, upimgs_num, "upimgs")))
                return true;
        }

        result_member.record();

        if (config_date.replyStartMsg)
            e.reply("人家开始生成啦，请等待1-10分钟", true, { recallMsg: 60 });

        param.input = await this.txt2img_generatePrompt(e, param.input, config_date);

        logger.info("[sf插件][dd]开始图片生成API调用")

        try {
            // 调用绘图API
            const result = await this.callDrawingAPI(apiConfig, param, e)

            if (!result.success) {
                await e.reply(`绘画生成失败: ${result.error}`, true)
                return false
            }

            // 构造参数信息文本
            const paramText = this.formatPayloadToText(result.payload);

            // 发送合并转发消息
            let msgList = [];
            if (config_date.simpleMode) {
                msgList.push({ ...segment.image(result.imageData), origin: true });
            } else {
                e.reply({ ...segment.image(result.imageData), origin: true }, config_date.sendImgQuote_Message)
            }

            msgList.push(`使用接口: ${apiConfig.remark || `接口${apiIndex}`}`);
            msgList.push(`原始提示词: ${prompt}`);
            msgList.push(`【参数详情】`);
            if (paramText) {
                msgList = msgList.concat(paramText.split('\n'));
            }
            if (e.sfRuntime.isgeneratePrompt === undefined) {
                msgList.push("tags的额外触发词：\n --自动提示词[开|关]");
            }

            e.reply(await common.makeForwardMsg(e, msgList, '绘画生成成功'));

            return true
        } catch (error) {
            logger.error('生成绘画时发生错误:', error)
            e.reply(`绘画生成失败: ${hidePrivacyInfo(error.message) || '未知错误'}`)
            return false
        }
    }

    // 绘图主函数
    async dd_draw(e) {
        // 读取配置
        let config_date = Config.getConfig()

        // 提取提示词
        let msg = e.msg.replace(/^#(dd|DD)\s*/, '').trim()

        if (!msg) {
            await e.reply('请输入绘画提示词，格式：#dd绘图 [提示词]', true)
            return false
        }

        // 获取当前使用的接口
        const currentApi = e.isMaster ?
            config_date.dd_usingAPI || 0 :
            e.dd_user_API || await this.findIndexByRemark(e, config_date)

        // 如果未分配/找到接口，进行提示
        if (currentApi === 0) {
            await e.reply('请先在配置中选择一个接口，或使用 #dd使用接口[数字] 命令选择接口', true)
            return false
        }

        // 直接调用带API索引的处理函数以复用逻辑
        return await this.dd_draw_with_api(e, msg, currentApi, config_date)
    }

    // 显示接口列表
    async dd_list_api(e) {
        // 读取配置
        const config_date = Config.getConfig()

        // 获取完整的命令
        const fullCommand = e.msg.toLowerCase()

        // 判断是否是接口列表命令
        const match = e.msg.match(/^#(sf|SF)(dd|d|o|n)(.*)接口列表$/)
        if (!match) return false

        // 根据完整命令确定筛选条件
        let filterStr = ''
        if (fullCommand.includes('sfdd接口列表') || fullCommand.includes('sfd接口列表')) {
            filterStr = 'dd'
        } else {
            // 尝试从match[3]中提取其他筛选条件
            filterStr = match[3] || ''
        }

        const apiList = config_date.dd_APIList || []
        const currentApi = e.isMaster ?
            config_date.dd_usingAPI || 0 :
            e.dd_user_API || await this.findIndexByRemark(e, config_date)

        if (!apiList || apiList.length === 0) {
            await e.reply(`当前没有配置任何接口`, true)
            return
        }

        // 所有用户都可以看到所有接口
        const availableApis = apiList

        // 根据筛选条件过滤接口
        let filteredApis = availableApis;
        if (filterStr) {
            if (filterStr === 'dd' || filterStr === 'd') {
                // 显示所有接口，不需要筛选
                filteredApis = availableApis;
            } else {
                // 否则按自定义命令或备注筛选
                filteredApis = availableApis.filter(api =>
                    (api.customCommand && api.customCommand.includes(filterStr)) ||
                    (api.remark && api.remark.includes(filterStr)) ||
                    (api.model && api.model.includes(filterStr))
                );
            }
        }

        if (filteredApis.length === 0) {
            await e.reply(`没有找到匹配的接口`, true)
            return
        }

        let msg = []
        msg.push(`接口列表${filterStr ? `（筛选：${filterStr}）` : ''}：`)

        filteredApis.forEach((api) => {
            const originalIndex = apiList.indexOf(api) + 1;
            const isUsing = currentApi === originalIndex;
            const remark = api.remark ? ` - ${api.remark}` : '';
            const modelInfo = api.model ? ` [${api.model}]` : '';
            const formatInfo = api.formatType ? ` (${api.formatType === 'modelscope' ? '魔搭' : api.formatType})` : '';
            const customCmd = api.customCommand ? ` (#d${api.customCommand})` : '';
            msg.push(`${originalIndex}. 接口${originalIndex}${remark}${modelInfo}${formatInfo}${customCmd}${isUsing ? ' [当前使用]' : ''}`);
        })

        // 添加提示信息
        if (currentApi === 0) {
            msg.push('\n您当前未选择任何接口，请使用 #dd使用接口[数字] 命令选择一个接口');
        }

        // 如果接口数量超过10个，使用转发消息
        if (msg.length > 12) {
            await e.reply(await common.makeForwardMsg(e, msg, `接口列表`))
        } else {
            await e.reply(msg.join('\n'))
        }
    }

    // 选择使用的接口
    async dd_select_api(e) {
        // 读取配置
        let config_date = Config.getConfig()

        // 提取接口索引
        const match = e.msg.match(/^#(sf|SF)(dd|DD)使用接口(\d+)$/)
        if (!match) return false

        const apiIndex = parseInt(match[3])

        // 检查接口是否存在
        if (!config_date.dd_APIList || apiIndex <= 0 || apiIndex > config_date.dd_APIList.length) {
            await e.reply(`接口${apiIndex}不存在，请检查接口列表`)
            return false
        }

        // 获取接口信息，不再检查是否为主人专属
        const api = config_date.dd_APIList[apiIndex - 1]

        // 设置使用的接口
        if (e.isMaster) {
            config_date.dd_usingAPI = apiIndex
            Config.setConfig(config_date)
            await e.reply(`已切换到接口${apiIndex}${api.remark ? ` - ${api.remark}` : ''}`)
        } else {
            e.dd_user_API = apiIndex
            await e.reply(`您已切换到接口${apiIndex}${api.remark ? ` - ${api.remark}` : ''}`)
        }

        return true
    }

    // 根据备注查找接口索引
    async findIndexByRemark(e, config_date) {
        // 如果没有配置接口列表，返回0表示使用默认配置
        if (!config_date.dd_APIList || config_date.dd_APIList.length === 0) {
            return 0
        }

        // 遍历接口列表，查找匹配的接口，不再检查是否为主人专属
        if (config_date.dd_APIList.length > 0) {
            return 1  // 返回第一个接口
        }

        // 如果没有找到匹配的接口，返回0表示使用默认配置
        return 0
    }

    // 显示帮助信息
    async dd_help(e) {
        const helpMessage = [`DD绘图插件帮助：

1. 基本绘图：
   #dd [提示词]：使用当前选择的接口生成图片
   #d[接口编号] [提示词]：使用指定编号的接口生成图片
   #d[自定义命令] [提示词]：使用指定自定义命令的接口生成图片
   例：#dd 一只可爱的猫咪
   例：#d1 一只可爱的猫咪
   例：#dtest 一只可爱的猫咪（如果有名为"test"的自定义命令）

2. 接口管理：
   #sfdd接口列表：查看所有接口
   #sfdo接口列表：筛选查看OpenAI格式的接口
   #sfdn接口列表：筛选查看Nebius格式的接口
   #sf[关键词]接口列表：筛选包含关键词的接口（匹配自定义命令、备注或模型名）
   #sfdd使用接口[数字]：切换到指定编号的接口
   #sfdd帮助：显示此帮助信息

3. 接口格式说明：
   - ModelScope格式：兼容ModelScope的异步任务API格式
   - 自定义格式：通过设置"响应格式路径"支持其他API格式

4. 参数说明：
   - 宽度：图片宽度
   - 高度：图片高度
   - 模型：使用的模型名称
   - 自定义命令：可用于快速调用的命令别名
   - 备注：接口的说明文字
   - 响应格式路径：从API响应中提取图片数据的路径，例如"images[0].url"

5. 注意事项：
   - 当前版本暂不支持图生图功能
   - 请确保接口配置正确，包括API密钥和基础URL
   - 部分接口可能需要特定的提示词格式，请参考接口说明
   - 对于非标准API响应格式，请设置"响应格式路径"以正确提取图片数据`]

        await e.reply(await common.makeForwardMsg(e, helpMessage, e.msg))
    }
}