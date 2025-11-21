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

/**
 * 隐藏错误信息中的隐私信息（网址、IP地址等）
 * @param {string} text 需要处理的文本
 * @returns {string} 处理后的文本
 */
export function hidePrivacyInfo(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }
  // URL正则表达式 - 匹配 http/https/ftp 协议的网址
  const urlRegex = /(https?:\/\/|ftp:\/\/)([\w\-._~:/?#[\]@!$&'()*+,;=%]+)/gi;
  // IPv4地址正则表达式
  const ipv4Regex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  // IPv6地址正则表达式
  const ipv6Regex = /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|::1\b|\b(?:[0-9a-fA-F]{1,4}:){1,7}:\b|\b:(?:[0-9a-fA-F]{1,4}:){1,6}[0-9a-fA-F]{1,4}\b/g;
  let result = text;
  // 处理URL - 保留协议和域名开头，隐藏其他部分
  result = result.replace(urlRegex, (match, protocol, rest) => {
    if (rest.length <= 10) {
      return protocol + '****';
    }
    // 保留前3个字符和后2个字符，中间用****替换
    const visible = rest.substring(0, 3) + '****' + rest.substring(rest.length - 2);
    return protocol + visible;
  });
  // 处理IPv4地址 - 隐藏后两段
  result = result.replace(ipv4Regex, (match) => {
    const parts = match.split('.');
    return parts[0] + '.' + parts[1] + '.***.***.';
  });
  // 处理IPv6地址 - 保留前两段，其他用****替换
  result = result.replace(ipv6Regex, (match) => {
    if (match === '::1') {
      return '****';
    }
    const parts = match.split(':');
    if (parts.length >= 2) {
      return parts[0] + ':' + parts[1] + ':****';
    }
    return '****';
  });
  return result;
}

/**
 * 删除消息中的 CQ 码
 * @param {string|Array} msg - 原始消息文本或数组
 * @returns {string|Array} 删除 CQ 码后的文本或数组
 */
export function removeCQCode(msg) {
  if (!msg) return ''
  // 如果是数组,递归处理每个元素
  if (Array.isArray(msg)) {
    return msg.map(item => 
      typeof item === 'string' ? item.replace(/\[CQ:[^\]]+\]/g, '').trim() : item
    )
  }
  // 如果不是字符串,直接返回原值
  if (typeof msg !== 'string') return msg
  // 匹配 [CQ:...] 格式的 CQ 码
  return msg.replace(/\[CQ:[^\]]+\]/g, '').trim()
}
