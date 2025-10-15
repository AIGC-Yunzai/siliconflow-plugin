import yaml from 'yaml'
import fs from 'fs'
/** 读取YAML文件 */
export function readYaml(filePath) {
    return yaml.parse(fs.readFileSync(filePath, 'utf8'))
}

/** 写入YAML文件 */
export function writeYaml(filePath, data) {
    fs.writeFileSync(filePath, yaml.stringify(data), 'utf8')
}

/**
 * @description: 获取适配器Uin
 * @param {*} e
 * @return {*}
 */
export function getUin(e) {
    if (e?.self_id) return e.self_id
    if (e?.bot?.uin) return e.bot.uin
    if (Array.isArray(Bot.uin)) {
        Bot.uin.forEach((u) => {
            if (Bot[u].self_id) {
                return Bot[u].self_id
            }
        })
        return Bot.uin[Bot.uin.length - 1]
    } else return Bot.uin
}

/**
 * @description: 获取Gemini可用的模型列表
 * @param {string} apiKey - Google AI API密钥
 * @param {string} geminiBaseUrl - Google AI API基础URL
 * @return {Promise<Array>} 返回可用模型的数组
 */
export async function getGeminiModelsByFetch(apiKey = '', geminiBaseUrl = '') {
    // 构建请求URL（考虑自定义baseUrl的情况）
    const baseUrl = geminiBaseUrl || 'https://generativelanguage.googleapis.com';
    const endpoint = baseUrl.endsWith('/') ?
        `${baseUrl.slice(0, -1)}/v1beta/models` :
        `${baseUrl}/v1beta/models`;

    // 将API密钥作为URL参数
    const url = `${endpoint}?key=${apiKey}`;

    // 发送请求
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'User-Agent': 'Node/1.0.0',
            'Accept': '*/*'
        },
        timeout: 60000 // 60秒超时
    });

    if (!response.ok) {
        throw new Error(`获取Gemini模型API请求失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    logger.debug('获取Gemini模型列表响应:', JSON.stringify(data));

    // Extract model names from the models array and return them
    return (data.models || []).map(model => model.name?.replace(/models\//g, '').trim()).filter(Boolean);
}

