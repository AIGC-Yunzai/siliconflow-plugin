import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import Config from '../components/Config.js'
import common from '../../../lib/common/common.js';
import { handleParam } from '../utils/parse.js'

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

    // 调用绘图API的工厂函数
    async callDrawingAPI(prompt, apiConfig, param = {}) {
        try {
            // 处理n参数（生成图片数量）
            if (prompt.includes('数量')) {
                const nMatch = prompt.match(/数量\s?(\d+)/);
                if (nMatch && nMatch[1]) {
                    param.n = parseInt(nMatch[1]);
                    prompt = prompt.replace(/数量\s?\d+/g, '').trim();
                }
            }

            // 构建请求体
            let payload;

            // 如果有请求体模板，优先使用模板
            if (apiConfig.requestTemplate) {
                try {
                    // 尝试解析JSON模板
                    let template = typeof apiConfig.requestTemplate === 'string'
                        ? JSON.parse(apiConfig.requestTemplate)
                        : apiConfig.requestTemplate;

                    // 检查是否需要替换变量
                    if (apiConfig.useTemplateVariables) {
                        // 深拷贝模板，避免修改原始对象
                        payload = JSON.parse(JSON.stringify(template));

                        // 替换模板中的变量
                        payload = this.replaceTemplateVariables(payload, prompt, apiConfig, param);
                    } else {
                        // 直接使用模板，只替换提示词
                        payload = template;

                        // 如果模板中有prompt字段，替换为用户输入的提示词
                        if (payload.prompt) {
                            payload.prompt = prompt;
                        }
                    }
                } catch (error) {
                    console.error('解析请求体模板失败:', error);
                    // 如果模板解析失败，回退到参数构建方式
                    const basePayload = {
                        model: apiConfig.model || 'dall-e-3',
                        prompt: prompt
                    };
                    payload = this.buildPayload(basePayload, apiConfig, param);
                }
            } else {
                // 使用参数构建方式
                const basePayload = {
                    model: apiConfig.model || 'dall-e-3',
                    prompt: prompt
                };
                payload = this.buildPayload(basePayload, apiConfig, param);
            }

            // 发送请求
            // 确定请求URL
            let requestUrl;
            if (apiConfig.baseUrl.endsWith('/v1')) {
                // 如果baseUrl以/v1结尾，添加/images/generations路径
                requestUrl = `${apiConfig.baseUrl}/images/generations`;
            } else {
                // 否则直接使用baseUrl
                requestUrl = apiConfig.baseUrl;
            }

            // 构建请求头
            let headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'Apifox/1.0.0 (https://apifox.com)',
            };

            // 根据认证类型设置Authorization头
            const authType = apiConfig.authType || 'bearer';
            if (authType === 'bearer') {
                // Bearer Token认证（默认）
                headers['Authorization'] = `Bearer ${apiConfig.apiKey}`;
            } else if (authType === 'basic') {
                // Basic认证
                const base64Credentials = Buffer.from(`${apiConfig.apiKey}:`).toString('base64');
                headers['Authorization'] = `Basic ${base64Credentials}`;
            } else if (authType === 'apikey') {
                // API Key认证
                const headerName = apiConfig.authHeaderName || 'Authorization';
                headers[headerName] = apiConfig.apiKey;
            } else if (authType === 'custom') {
                // 自定义认证
                if (apiConfig.customAuthValue) {
                    headers['Authorization'] = apiConfig.customAuthValue;
                } else {
                    // 如果没有设置自定义值，回退到默认Bearer
                    headers['Authorization'] = `Bearer ${apiConfig.apiKey}`;
                }
            }

            // 添加自定义请求头
            if (apiConfig.customHeaders) {
                try {
                    const customHeaders = typeof apiConfig.customHeaders === 'string'
                        ? JSON.parse(apiConfig.customHeaders)
                        : apiConfig.customHeaders;
                    
                    // 合并自定义请求头
                    headers = { ...headers, ...customHeaders };
                } catch (error) {
                    console.error('解析自定义请求头失败:', error);
                }
            }

            const response = await fetch(requestUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`API请求失败: ${response.status}`, errorText);
                return {
                    success: false,
                    error: `API响应错误 ${response.status}: ${errorText}`
                };
            }

            const data = await response.json();

            if (!data) {
                return {
                    success: false,
                    error: '返回数据格式异常'
                };
            }

            // 处理返回的图片数据
            let imageData;
            
            // 如果配置了自定义响应格式解析路径
            if (apiConfig.responseFormat) {
                try {

                    const formatPath = apiConfig.responseFormat;
                    // 修复的路径解析逻辑
                    let result = data;
                    
                    // 处理复合路径 (如 data.image_urls[0])
                    let currentPath = '';
                    let i = 0;
                    
                    while (i < formatPath.length) {
                        // 如果是点号，处理前面收集的路径
                        if (formatPath[i] === '.') {
                            if (currentPath) {
                                // 检查result是否是对象且属性存在
                                if (typeof result !== 'object' || result === null) {
                                    throw new Error(`路径 ${currentPath} 不是一个对象，无法继续访问其属性`);
                                }
                                // 检查属性是否存在
                                if (!(currentPath in result)) {
                                    throw new Error(`响应中不存在路径: ${currentPath}`);
                                }
                                result = result[currentPath];
                            }
                            currentPath = '';
                            i++;
                            continue;
                        }
                        
                        // 如果是左括号，处理数组
                        if (formatPath[i] === '[') {
                            // 先处理前面的对象属性
                            if (currentPath) {
                                result = result[currentPath];
                                if (result === undefined) {
                                    throw new Error(`响应中不存在路径: ${currentPath}`);
                                }
                            }
                            
                            // 提取索引
                            let indexStr = '';
                            i++;
                            while (i < formatPath.length && formatPath[i] !== ']') {
                                indexStr += formatPath[i];
                                i++;
                            }
                            
                            // 转换为数字并访问数组
                            const index = parseInt(indexStr);
                            result = result[index];
                            if (result === undefined) {
                                throw new Error(`数组索引越界: ${index}`);
                            }
                            
                            // 跳过右括号
                            i++;
                            currentPath = '';
                            continue;
                        }
                        
                        // 收集当前路径片段
                        currentPath += formatPath[i];
                        i++;
                    }
                    
                    // 处理最后一个路径片段
                    if (currentPath) {
                        result = result[currentPath];
                        if (result === undefined) {
                            throw new Error(`响应中不存在路径: ${currentPath}`);
                        }
                    }
                    
                    // 根据结果类型处理
                    if (typeof result === 'string') {
                        // 使用与默认解析相同的判断逻辑
                        if (result.startsWith('data:image') || 
                            result.startsWith('base64:')) {
                            imageData = result;
                        } else if (/^[A-Za-z0-9+/=]{100,}$/.test(result)) {
                            // 使用与默认解析相同的前缀格式
                            imageData = `base64://${result}`;
                        } else {
                            // 否则视为URL
                            imageData = result;
                        }
                    } else if (result.url) {
                        // 如果结果是对象且有url属性
                        imageData = result.url;
                    } else if (result.b64_json) {
                        // 如果结果是对象且有b64_json属性
                        imageData = `base64://${result.b64_json}`;
                    } else {
                        throw new Error('无法从自定义路径提取图片数据');
                    }
                } catch (error) {
                    console.error('解析自定义响应格式失败:', error);
                    return {
                        success: false,
                        error: `解析自定义响应格式失败: ${error.message}`
                    };
                }
            } else {
                // 尝试自动检测和解析常见的响应格式
                try {
                    // 增强的自动检测逻辑
                    imageData = this.extractImageData(data);
                    
                    // 如果仍然没有找到图片数据
                    if (!imageData) {
                        console.error('无法自动检测响应格式，原始响应:', JSON.stringify(data).substring(0, 500) + '...');
                        return {
                            success: false,
                            error: '未找到图片数据，请配置自定义响应格式路径'
                        };
                    }
                } catch (error) {
                    console.error('自动解析响应格式失败:', error, '原始响应:', JSON.stringify(data).substring(0, 500) + '...');
                    return {
                        success: false,
                        error: `解析响应失败: ${error.message}`
                    };
                }
            }

            // 提取修改后的提示词（如果有）
            let revisedPrompt = prompt;
            try {
                if (data.data && data.data[0] && data.data[0].revised_prompt) {
                    revisedPrompt = data.data[0].revised_prompt;
                } else if (data.revised_prompt) {
                    revisedPrompt = data.revised_prompt;
                }
            } catch (error) {
                // 忽略提取修改后提示词的错误
                console.debug('提取修改后提示词失败:', error);
            }

            return {
                success: true,
                imageData: imageData,
                revised_prompt: revisedPrompt,
                payload: payload  // 返回完整的请求参数
            };
        } catch (error) {
            console.error('API调用错误:', error);
            return {
                success: false,
                error: error.message || '未知错误'
            };
        }
    }

    // 新增方法：增强的图片数据提取
    extractImageData(data) {
        // 递归检查对象中的所有属性，寻找URL或base64数据
        const findImageData = (obj, path = '') => {
            // 如果是null或undefined，直接返回
            if (obj === null || obj === undefined) {
                return null;
            }
            
            // 如果是字符串，检查是否为URL或base64
            if (typeof obj === 'string') {
                // 检查是否为base64
                if (obj.startsWith('data:image') || 
                    obj.startsWith('base64:') || 
                    /^[A-Za-z0-9+/=]{100,}$/.test(obj)) {
                    return { type: 'base64', data: obj.startsWith('base64:') ? obj : `base64://${obj}`, path };
                }
                
                // 检查是否为URL
                if (obj.startsWith('http://') || 
                    obj.startsWith('https://') || 
                    obj.startsWith('ftp://') ||
                    /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(obj)) {
                    return { type: 'url', data: obj, path };
                }
                
                return null;
            }
            
            // 如果是数组，遍历每个元素
            if (Array.isArray(obj)) {
                for (let i = 0; i < obj.length; i++) {
                    const result = findImageData(obj[i], `${path}[${i}]`);
                    if (result) return result;
                }
                return null;
            }
            
            // 如果是对象，检查特定属性
            if (typeof obj === 'object') {
                // 优先检查常见的图片属性名
                const priorityKeys = ['url', 'image_url', 'imageUrl', 'image', 'b64_json', 'base64', 'data'];
                
                // 先检查优先级高的键
                for (const key of priorityKeys) {
                    if (obj[key] !== undefined) {
                        const result = findImageData(obj[key], path ? `${path}.${key}` : key);
                        if (result) return result;
                    }
                }
                
                // 然后检查所有其他键
                for (const key in obj) {
                    if (!priorityKeys.includes(key)) {
                        const result = findImageData(obj[key], path ? `${path}.${key}` : key);
                        if (result) return result;
                    }
                }
            }
            
            return null;
        };
        
        // 开始检查常见的响应格式
        
        // 1. 检查OpenAI/Nebius标准格式
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
            if (data.data[0].b64_json) {
                return `base64://${data.data[0].b64_json}`;
            } else if (data.data[0].url) {
                return data.data[0].url;
            }
        }
        
        // 2. 检查ModelScope格式
        if (data.images && Array.isArray(data.images) && data.images.length > 0) {
            if (data.images[0].url) {
                return data.images[0].url;
            } else if (data.images[0].b64_json) {
                return `base64://${data.images[0].b64_json}`;
            } else if (typeof data.images[0] === 'string') {
                // 有些API直接返回图片URL字符串数组
                return data.images[0];
            }
        }
        
        // 3. 检查直接返回图片数组的格式
        if (Array.isArray(data) && data.length > 0) {
            if (typeof data[0] === 'string') {
                // 直接返回URL数组
                return data[0];
            } else if (data[0].url) {
                return data[0].url;
            } else if (data[0].b64_json) {
                return `base64://${data[0].b64_json}`;
            } else if (data[0].image) {
                // 某些API使用image字段
                if (typeof data[0].image === 'string') {
                    return data[0].image;
                } else if (data[0].image.url) {
                    return data[0].image.url;
                }
            }
        }
        
        // 4. 检查单一对象格式
        if (!Array.isArray(data)) {
            if (data.url) {
                return data.url;
            } else if (data.b64_json) {
                return `base64://${data.b64_json}`;
            } else if (data.image) {
                if (typeof data.image === 'string') {
                    return data.image;
                } else if (data.image.url) {
                    return data.image.url;
                }
            } else if (data.output) {
                // 某些API使用output字段
                if (typeof data.output === 'string') {
                    return data.output;
                } else if (Array.isArray(data.output) && data.output.length > 0) {
                    if (typeof data.output[0] === 'string') {
                        return data.output[0];
                    }
                }
            }
        }
        
        // 5. 递归搜索整个响应对象
        const result = findImageData(data);
        if (result) {
            console.log(`在路径 ${result.path} 找到图片数据，类型: ${result.type}`);
            return result.data;
        }
        
        // 如果所有方法都失败，返回null
        return null;
    }

    // 替换模板中的变量
    replaceTemplateVariables(template, prompt, apiConfig, param) {
        // 递归处理对象中的所有字符串值
        const processValue = (value) => {
            if (typeof value === 'string') {
                // 替换提示词变量
                value = value.replace(/{{prompt}}/g, prompt);

                // 替换apiConfig中的变量
                for (const [key, configValue] of Object.entries(apiConfig)) {
                    if (typeof configValue !== 'object' && configValue !== undefined) {
                        value = value.replace(new RegExp(`{{${key}}}`, 'g'), configValue);
                    }
                }

                // 替换param中的变量
                for (const [key, paramValue] of Object.entries(param)) {
                    if (typeof paramValue !== 'object' && paramValue !== undefined) {
                        value = value.replace(new RegExp(`{{${key}}}`, 'g'), paramValue);
                    }
                }

                // 替换特殊变量
                value = value.replace(/{{random}}/g, Math.floor(Math.random() * 2147483647));
                value = value.replace(/{{timestamp}}/g, Date.now());

                return value;
            } else if (Array.isArray(value)) {
                return value.map(item => processValue(item));
            } else if (value !== null && typeof value === 'object') {
                const result = {};
                for (const [k, v] of Object.entries(value)) {
                    result[k] = processValue(v);
                }
                return result;
            }
            return value;
        };

        return processValue(template);
    }

    // 构建请求体
    buildPayload(basePayload, apiConfig, param = {}) {
        // 创建请求体副本，避免修改原始对象
        const payload = { ...basePayload };

        // 根据格式类型构建请求体
        const formatType = apiConfig.formatType || 'openai';

        if (formatType === 'openai') {
            // OpenAI 格式
            // 设置默认模型
            payload.model = apiConfig.model || payload.model || 'dall-e-3';

            // 设置生成图片数量
            payload.n = param.n || apiConfig.n || 1;

            // 设置图片尺寸
            if (apiConfig.width && apiConfig.height) {
                payload.size = `${apiConfig.width}x${apiConfig.height}`;
            } else {
                payload.size = payload.size || '1024x1024';
            }
        } else if (formatType === 'nebius') {
            // Nebius 格式
            // 设置默认模型
            payload.model = apiConfig.model || payload.model || 'black-forest-labs/flux-dev';

            // 设置响应格式
            payload.response_format = apiConfig.response_format || payload.response_format || 'b64_json';

            // 设置响应扩展名
            payload.response_extension = apiConfig.response_extension || payload.response_extension || 'webp';

            // 设置图片尺寸
            payload.width = apiConfig.width || payload.width || 1024;
            payload.height = apiConfig.height || payload.height || 1024;

            // 设置推理步数
            payload.num_inference_steps = apiConfig.num_inference_steps || payload.num_inference_steps || 28;

            // 设置负面提示词
            payload.negative_prompt = apiConfig.negative_prompt || payload.negative_prompt || '';

            // 设置种子
            if (param.seed !== undefined) {
                payload.seed = param.seed;
            } else if (apiConfig.seed !== undefined) {
                payload.seed = apiConfig.seed;
            } else {
                payload.seed = -1; // Nebius默认使用-1表示随机种子
            }
        }

        // 其他自定义参数
        if (apiConfig.extraParams) {
            try {
                const extraParams = typeof apiConfig.extraParams === 'string'
                    ? JSON.parse(apiConfig.extraParams)
                    : apiConfig.extraParams;
                Object.assign(payload, extraParams);
            } catch (error) {
                console.error('解析extraParams失败:', error);
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

        // 格式化参数为文本
        let result = [];

        // 处理常见参数
        if (filteredPayload.model) result.push(`模型: ${filteredPayload.model}`);
        if (filteredPayload.prompt) result.push(`提示词: ${filteredPayload.prompt}`);
        if (filteredPayload.size) result.push(`尺寸: ${filteredPayload.size}`);
        if (filteredPayload.width && filteredPayload.height) result.push(`尺寸: ${filteredPayload.width}x${filteredPayload.height}`);
        if (filteredPayload.n) result.push(`数量: ${filteredPayload.n}`);
        if (filteredPayload.quality) result.push(`质量: ${filteredPayload.quality}`);
        if (filteredPayload.style) result.push(`风格: ${filteredPayload.style}`);

        // Nebius特有参数
        if (filteredPayload.num_inference_steps) result.push(`推理步数: ${filteredPayload.num_inference_steps}`);
        if (filteredPayload.negative_prompt) result.push(`负面提示词: ${filteredPayload.negative_prompt}`);
        if (filteredPayload.seed !== undefined) result.push(`种子: ${filteredPayload.seed}`);
        if (filteredPayload.response_format) result.push(`响应格式: ${filteredPayload.response_format}`);

        // 其他参数
        const handledKeys = ['model', 'prompt', 'size', 'width', 'height', 'n', 'quality', 'style',
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
        const m = await import('./SF_Painting.js');
        const sf = new m.SF_Painting();
        
        // 检查当前使用的接口是否设置了自动提示词开关
        if (e.currentApiConfig && e.currentApiConfig.enableGeneratePrompt !== undefined) {
            // 临时保存原来的全局设置
            const originalSetting = e.sfRuntime.isgeneratePrompt;
            // 使用接口级别的设置覆盖全局设置
            e.sfRuntime.isgeneratePrompt = e.currentApiConfig.enableGeneratePrompt;
            
            // 调用原方法生成提示词
            const result = await sf.txt2img_generatePrompt(e, userPrompt, config_date);
            
            // 恢复原来的全局设置
            e.sfRuntime.isgeneratePrompt = originalSetting;
            
            return result;
        }
        
        // 如果没有接口级别的设置，使用默认行为
        return await sf.txt2img_generatePrompt(e, userPrompt, config_date);
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

        // 解析参数
        let param = await handleParam(e, prompt, true)

        // 检查是否有图片（暂不支持图生图，但保留代码结构）
        if (e.img && e.img.length > 0) {
            await e.reply('当前不支持图生图功能', true)
            return false
        }

        param.input = await this.txt2img_generatePrompt(e, prompt, config_date);

        logger.mark("[sf插件][dd]开始图片生成API调用")

        try {
            // 调用绘图API
            const result = await this.callDrawingAPI(prompt, apiConfig, param)

            if (!result.success) {
                await e.reply(`绘画生成失败: ${result.error}`, true)
                return false
            }

            // 构造参数信息文本
            const paramText = this.formatPayloadToText(result.payload);

            // 发送合并转发消息
            if (e.group_id) {
                if (config_date.simpleMode) {
                    // 构造转发消息
                    const forwardMsg = [
                        {
                            message: segment.image(result.imageData),
                            nickname: e.bot?.nickname || 'DD绘画',
                            user_id: e.bot?.uin || e.self_id
                        },
                        {
                            message: `✅ 绘画生成成功\n\n原始提示词: ${prompt}\n最终提示词: ${param.input}\n\n使用接口: ${apiConfig.remark || `接口${apiIndex}`}\n\n【参数详情】\n${paramText}${e.sfRuntime.isgeneratePrompt === undefined ? "\n\n可选参数：\n 自动提示词[开|关]" : ""}`,
                            nickname: e.bot?.nickname || 'DD绘画',
                            user_id: e.bot?.uin || e.self_id
                        }
                    ]
                    await e.reply(await e.group.makeForwardMsg(forwardMsg))
                }
                else {
                    await e.reply(segment.image(result.imageData))
                    const msgx = await common.makeForwardMsg(e, [`✅ 绘画生成成功`, `原始提示词: ${prompt}\n最终提示词: ${param.input}`, `使用接口: ${apiConfig.remark || `接口${apiIndex}`}`, `【参数详情】\n${paramText}`, `${e.sfRuntime.isgeneratePrompt === undefined ? "可选参数：\n 自动提示词[开|关]" : ""}`])
                    await e.reply(msgx)
                }
            } else {
                await e.reply(segment.image(result.imageData))
                await e.reply(`✅ 绘画生成成功\n\n原始提示词: ${prompt}\n最终提示词: ${param.input}\n\n使用接口: ${apiConfig.remark || `接口${apiIndex}`}\n\n【参数详情】\n${paramText}${e.sfRuntime.isgeneratePrompt === undefined ? "\n\n可选参数：\n 自动提示词[开|关]" : ""}`)
            }

            return true
        } catch (error) {
            console.error('生成绘画时发生错误:', error)
            await e.reply(`绘画生成失败: ${error.message || '未知错误'}`)
            return false
        }
    }

    // 绘图主函数
    async dd_draw(e) {
        // 读取配置
        let config_date = Config.getConfig()
        e.sfRuntime = config_date;

        // 提取提示词
        let msg = e.msg.replace(/^#(dd|DD)\s*/, '').trim()

        if (!msg) {
            await e.reply('请输入绘画提示词，格式：#dd绘图 [提示词]', true)
            return false
        }

        // 解析参数
        let param = await handleParam(e, msg, true)

        // 检查是否有图片（暂不支持图生图，但保留代码结构）
        if (e.img && e.img.length > 0) {
            await e.reply('当前不支持图生图功能', true)
            return false
        }

        // 获取当前使用的接口
        const currentApi = e.isMaster ?
            config_date.dd_usingAPI || 0 :
            e.dd_user_API || await this.findIndexByRemark(e, config_date)

        // 根据接口索引获取接口配置
        let apiConfig = null
        if (currentApi > 0 && config_date.dd_APIList && config_date.dd_APIList.length >= currentApi) {
            apiConfig = config_date.dd_APIList[currentApi - 1]
        }

        // 如果没有找到接口配置
        if (!apiConfig) {
            if (currentApi === 0) {
                await e.reply('请先在配置中选择一个接口，或使用 #dd使用接口[数字] 命令选择接口', true)
            } else {
                await e.reply('所选接口不存在，请检查接口列表', true)
            }
            return false
        }

        if (apiConfig.isOnlyMaster && !e.isMaster) {
            await e.reply('此接口仅限主人使用', true)
            return false
        }

        // 保存当前接口配置到 e 对象，供自动提示词功能使用
        e.currentApiConfig = apiConfig

        param.input = await this.txt2img_generatePrompt(e, msg, config_date);

        logger.mark("[sf插件][dd]开始图片生成API调用")

        try {
            // 调用绘图API
            const result = await this.callDrawingAPI(param.input, apiConfig, param)

            if (!result.success) {
                await e.reply(`绘画生成失败: ${result.error}`, true)
                return false
            }

            // 构造参数信息文本
            const paramText = this.formatPayloadToText(result.payload);

            // 发送合并转发消息
            if (e.group_id) {
                if (config_date.simpleMode) {
                    // 构造转发消息
                    const forwardMsg = [
                        {
                            message: segment.image(result.imageData),
                            nickname: e.bot?.nickname || 'DD绘画',
                            user_id: e.bot?.uin || e.self_id
                        },
                        {
                            message: `✅ 绘画生成成功\n\n原始提示词: ${msg}\n最终提示词: ${param.input}\n\n使用接口: ${apiConfig.remark || (currentApi > 0 ? `接口${currentApi}` : '默认接口')}\n\n【参数详情】\n${paramText}`,
                            nickname: e.bot?.nickname || 'DD绘画',
                            user_id: e.bot?.uin || e.self_id
                        }
                    ]
                    await e.reply(await e.group.makeForwardMsg(forwardMsg))
                }
                else {
                    await e.reply(segment.image(result.imageData))
                    const msgx = await common.makeForwardMsg(e, [`✅ 绘画生成成功`, `原始提示词: ${msg}\n最终提示词: ${param.input}`, `使用接口: ${apiConfig.remark || (currentApi > 0 ? `接口${currentApi}` : '默认接口')}`, `【参数详情】\n${paramText}`, `${e.sfRuntime.isgeneratePrompt === undefined ? "可选参数：\n 自动提示词[开|关]" : ""}`])
                    await e.reply(msgx)
                }
            } else {
                await e.reply(segment.image(result.imageData))
                await e.reply(`✅ 绘画生成成功\n\n原始提示词: ${msg}\n最终提示词: ${param.input}\n\n使用接口: ${apiConfig.remark || (currentApi > 0 ? `接口${currentApi}` : '默认接口')}\n\n【参数详情】\n${paramText}${e.sfRuntime.isgeneratePrompt === undefined ? "\n\n可选参数：\n 自动提示词[开|关]" : ""}`)
            }

            return true
        } catch (error) {
            console.error('生成绘画时发生错误:', error)
            await e.reply(`绘画生成失败: ${error.message || '未知错误'}`, true)
            return false
        }
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
        if (fullCommand.includes('sfdo接口列表') || fullCommand.includes('sfo接口列表')) {
            filterStr = 'o'
        } else if (fullCommand.includes('sfdn接口列表') || fullCommand.includes('sfn接口列表')) {
            filterStr = 'n'
        } else if (fullCommand.includes('sfdd接口列表') || fullCommand.includes('sfd接口列表')) {
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
            // 按格式类型筛选
            if (filterStr === 'o') {
                filteredApis = availableApis.filter(api =>
                    !api.formatType || api.formatType === 'openai'
                );
            } else if (filterStr === 'n') {
                filteredApis = availableApis.filter(api =>
                    api.formatType === 'nebius'
                );
            } else if (filterStr === 'dd' || filterStr === 'd') {
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
            const formatInfo = api.formatType ? ` (${api.formatType === 'openai' ? 'OpenAI格式' : 'Nebius格式'})` : '';
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
   - OpenAI格式：兼容OpenAI的DALL-E接口格式
   - Nebius格式：兼容Nebius的接口格式
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
