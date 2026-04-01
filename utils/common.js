import yaml from 'yaml'
import fs from 'fs'
import os from 'os'

/** 读取YAML文件 */
export function readYaml(filePath) {
  return yaml.parse(fs.readFileSync(filePath, 'utf8'))
}

/**
 * 获取真实的公网 IP (通过访问外部 API)
 */
async function fetchRealWanIp() {
  // 备用测 IP 接口池 (防止某个接口挂掉或者在国内被墙)
  const apis = [
    'https://api.ipify.org',       // 国外常用，稳定
    'https://icanhazip.com',       // Cloudflare 提供，极快
    'https://ip.sb'                // 国内外访问都很快
  ];

  for (const api of apis) {
    try {
      // 设置 3 秒超时，防止网络不通导致程序一直卡着启动不了
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(api, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const ip = await response.text();
        // 简单正则验证一下是不是合法的 IPv4 格式
        const cleanIp = ip.trim();
        if (/^(\d{1,3}\.){3}\d{1,3}$/.test(cleanIp)) {
          return cleanIp;
        }
      }
    } catch (e) {
      // 当前接口失败，静默继续尝试下一个
      continue;
    }
  }
  return null; // 如果全都失败，返回 null
}

/**
 * 获取服务器访问地址 (从 WebUIServer 储存的对象中读取 + 外部探测)
 * @returns {object|null} 包含本机、内网、外网地址的对象。如果服务未启动则返回空结构
 */
export async function getServerAddress(config = {}) {
  const { default: WebUIServer } = await import('../components/WebUIServer.js');
  // 从 WebUI 服务实例获取已计算好的地址
  const addresses = WebUIServer.getAccessAddresses();

  // 如果 WebUI 尚未启动或获取失败，返回空结构防止报错
  if (!addresses) {
    return {
      local: null,
      lan: null,
      wan: null,
      all: { local: [], lan: [], wan: [], ipv6: [] }
    }
  }

  let realWanIp = await fetchRealWanIp();
  let wanList = addresses.wan ? [...addresses.wan] : [];

  if (realWanIp) {
    const webUI = config?.webUI || {}
    // 将真实公网 IP 放在第一位推荐位
    if (webUI.http?.enable)
      wanList.unshift(`http://${realWanIp}:${webUI.http?.port ?? 8082}`);
    if (webUI.tls?.enable)
      wanList.unshift(`https://${realWanIp}:${webUI.tls?.port ?? 8443}`);
    // 去重
    wanList = [...new Set(wanList)];
  }

  return {
    // 推荐使用的单个地址（供快速访问）
    local: addresses.local.length > 0 ? addresses.local[0] : null,
    lan: addresses.lan.length > 0 ? addresses.lan[0] : null,
    wan: wanList.length > 0 ? wanList[0] : null,
    ipv6: addresses.ipv6.length > 0 ? addresses.ipv6[0] : null,

    // 完整的列表
    all: {
      local: addresses.local,
      lan: addresses.lan,
      wan: wanList, // 包含真实公网 IP 和原本推测的 IP
      ipv6: addresses.ipv6
    }
  }
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
  // 如果是数组, 使用 reduce 进行处理和过滤
  if (Array.isArray(msg)) {
    return msg.reduce((acc, item) => {
      if (typeof item === 'string') {
        // 替换 CQ 码
        const cleanedText = item.replace(/\[CQ:[^\]]+\]/g, '').trim()
        // 只有当文本不为空时才推入结果数组
        if (cleanedText) {
          acc.push(cleanedText)
        }
      } else {
        // 非字符串对象（如图片、表情对象）直接保留
        acc.push(item)
      }
      return acc
    }, [])
  }
  // 如果不是字符串, 直接返回原值
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

/** 移除末尾的斜杠 */
export function removeTrailingSlash(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/** 日志输出时不要被base64刷屏 */
export function summarizeImgUrl(imgUrl) {
  if (typeof imgUrl !== "string") return imgUrl;

  // 处理 base64:// 格式
  if (imgUrl.startsWith("base64://")) {
    const base64 = imgUrl.slice("base64://".length);
    const preview = base64.slice(0, 16);
    let bytes = 0;
    try { bytes = Buffer.from(base64, "base64").length; } catch (e) { }
    return `base64://${preview}... [bytes=${bytes}]`;
  }

  // 处理 data:image/xxx;base64, 格式
  if (imgUrl.startsWith("data:")) {
    const commaIndex = imgUrl.indexOf(",");
    if (commaIndex !== -1) {
      const header = imgUrl.slice(0, commaIndex + 1); // 例如 "data:image/jpeg;base64,"
      const base64 = imgUrl.slice(commaIndex + 1);
      const preview = base64.slice(0, 16);
      let bytes = 0;
      try { bytes = Buffer.from(base64, "base64").length; } catch (e) { }
      return `${header}${preview}... [bytes=${bytes}]`;
    }
  }

  // 如果是普通 http/https 图片 URL，直接原样返回
  return imgUrl;
}