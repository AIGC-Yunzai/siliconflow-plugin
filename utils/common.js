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

/**
 * @description: 把超长字符串按照每 回车 与 chunkSize 字分割成数组
 * @param {string|Array} str
 * @param {number} chunkSize
 * @return {Array}
 */
export function splitString_Enter(str, chunkSize = 2000) {
  // 如果 str 是数组,先转换为字符串
  if (Array.isArray(str)) {
    str = str.join('\n');
  }
  const result = [];
  const lines = str.split('\n');
  let currentChunk = '';
  for (const line of lines) {
    // 如果当前行加上当前块不超过限制,就追加
    if ((currentChunk + line + '\n').length <= chunkSize) {
      currentChunk += (currentChunk ? '\n' : '') + line;
    } else {
      // 如果当前块不为空,先保存
      if (currentChunk) {
        result.push(currentChunk);
        currentChunk = '';
      }
      // 如果单行就超过限制,需要强制分割
      if (line.length > chunkSize) {
        for (let i = 0; i < line.length; i += chunkSize) {
          result.push(line.slice(i, i + chunkSize));
        }
      } else {
        currentChunk = line;
      }
    }
  }
  // 保存最后一个块
  if (currentChunk) {
    result.push(currentChunk);
  }
  return result;
}

/**
 * @description: 从文本中提取 base64 格式的图片
 * @param {string} text 包含图片的文本内容
 * @param {boolean} checkOnly 仅检查是否存在图片，不提取和清理文本（用于 useMarkdown 模式）
 * @return {Object} 返回 { cleanedText: 清理后的文本, imageBase64Array: 图片数组, hasImages: 是否有图片 }
 */
export function extractBase64Images(text, checkOnly = false) {
  if (!text || typeof text !== 'string') {
    return { cleanedText: text, imageBase64Array: null, hasImages: false };
  }

  const imageBase64Array = [];
  let cleanedText = text;

  // 匹配多种可能的 base64 图片格式
  // 1. data:image/png;base64,... 或 data:image/png:;base64,... (注意有冒号)
  // 2. 可能在markdown图片格式中: ![...](data:image/...)
  // 3. 可能有引号包裹或空格
  const patterns = [
    // Markdown 图片格式: ![alt](data:image/...)
    /!\[[^\]]*\]\(\s*(data:image\/[a-zA-Z]+[:;]base64,[a-zA-Z0-9+\/=]+)\s*\)/gi,
    // 直接的 data:image 格式 (可能有冒号或分号)
    /data:image\/[a-zA-Z]+[:;]base64,[a-zA-Z0-9+\/=]+/gi,
  ];

  // 如果仅检查模式，只需要知道是否有图片即可
  if (checkOnly) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        // logger.debug(`[sf插件] 检测到文本中包含 base64 格式图片`);
        return { cleanedText: text, imageBase64Array: null, hasImages: true };
      }
    }
    return { cleanedText: text, imageBase64Array: null, hasImages: false };
  }

  // 完整提取模式
  patterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => {
        // 提取实际的 data:image URL
        let dataUrl;
        if (match.startsWith('![')) {
          // 从 markdown 格式中提取
          const urlMatch = match.match(/data:image\/[a-zA-Z]+[:;]base64,[a-zA-Z0-9+\/=]+/i);
          if (urlMatch) {
            dataUrl = urlMatch[0];
          }
        } else {
          dataUrl = match;
        }

        if (dataUrl) {
          // 标准化格式: 将 data:image/png:;base64 转换为 data:image/png;base64
          dataUrl = dataUrl.replace(/data:image\/([a-zA-Z]+):;base64,/, 'data:image/$1;base64,');

          // 避免重复添加
          if (!imageBase64Array.includes(dataUrl)) {
            imageBase64Array.push(dataUrl);
            // logger.debug(`[sf插件] 提取到 base64 图片，大小: ${Math.round(dataUrl.length / 1024)}KB`);
          }
        }

        // 从文本中移除图片数据
        cleanedText = cleanedText.replace(match, '');
      });
    }
  });

  // 清理多余的空行
  cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n').trim();

  const hasImages = imageBase64Array.length > 0;
  if (hasImages) {
    logger.info(`[sf插件] 从文本中提取到 ${imageBase64Array.length} 张 base64 格式图片`);
    return { cleanedText, imageBase64Array, hasImages };
  }

  return { cleanedText, imageBase64Array: null, hasImages: false };
}