import fetch from 'node-fetch'

/**
 * 检查URL是否为不需要提取内容的文件类型
 * @param {string} url URL地址
 * @returns {boolean} 是否为不需要提取的文件类型
 */
function isSkippedUrl(url) {
    // 检查常见图片后缀
    const imageExtensions = /\.(jpg|jpeg|png|gif|bmp|webp|svg|ico|tiff|tif|raw|cr2|nef|arw|dng|heif|heic|avif|jfif|psd|ai)$/i;
    
    // 检查常见视频后缀
    const videoExtensions = /\.(mp4|webm|mkv|flv|avi|mov|wmv|rmvb|m4v|3gp|mpeg|mpg|ts|mts)$/i;
    
    // 检查可执行文件和二进制文件
    const binaryExtensions = /\.(exe|msi|dll|sys|bin|dat|iso|img|dmg|pkg|deb|rpm|apk|ipa|jar|class|pyc|o|so|dylib)$/i;
    
    // 检查压缩文件
    const archiveExtensions = /\.(zip|rar|7z|tar|gz|bz2|xz|tgz|tbz|cab|ace|arc)$/i;
    
    // 检查是否包含媒体或下载相关路径关键词
    const skipKeywords = /\/(images?|photos?|pics?|videos?|medias?|downloads?|uploads?|binaries|assets)\//i;
    
    return imageExtensions.test(url) || 
           videoExtensions.test(url) || 
           binaryExtensions.test(url) || 
           archiveExtensions.test(url) || 
           skipKeywords.test(url);
}

/**
 * 从文本中提取URL
 * @param {string} text 需要提取URL的文本
 * @returns {string[]} URL数组
 */
export function extractUrls(text) {
    // 更新正则表达式以匹配包含中文和空格的URL
    const urlRegex = /(?:https?:\/\/[^[\](){}|\\^<>]*[^\s.,!?;:，。！？、；：\u4e00-\u9fa5])/g;
    const matches = text.match(urlRegex) || [];
    
    // 清理URL并进行解码
    return matches.map(url => {
        // 移除URL末尾的标点符号和中文字符
        let cleanUrl = url.replace(/[.,!?;:，。！？、；：\s\u4e00-\u9fa5]+$/, '');
        // 处理URL中的空格和中文字符
        try {
            // 尝试解码URL，如果已经是解码状态则保持不变
            cleanUrl = decodeURIComponent(cleanUrl);
            // 重新编码空格和特殊字符，但保留中文字符
            cleanUrl = cleanUrl.replace(/\s+/g, '%20')
                             .replace(/[[\](){}|\\^<>]/g, encodeURIComponent);
        } catch (e) {
            // 如果解码失败，说明URL可能已经是正确格式，直接返回
            return cleanUrl;
        }
        return cleanUrl;
    });
}

/**
 * 从URL提取内容
 * @param {string} url 需要提取内容的URL
 * @returns {Promise<Object>} 提取的内容
 */
export async function extractUrlContent(url) {
    // 如果是需要跳过的URL类型，直接返回null
    if (isSkippedUrl(url)) {
        logger.mark(`[URL提取]跳过不需要处理的URL类型: ${url}`)
        return null;
    }

    try {
        logger.mark(`[URL提取]开始从URL获取内容: ${url}`)
        const response = await fetch(`https://lbl.news/api/extract?url=${encodeURIComponent(url)}`);
        if (!response.ok) {
            throw new Error(`提取内容失败: ${response.statusText}`);
        }
        const data = await response.json();
        logger.mark(`[URL提取]成功获取URL内容: ${url}`)
        return data;
    } catch (error) {
        logger.error(`[URL提取]提取内容失败: ${error.message}, URL: ${url}`);
        return null;
    }
}

/**
 * 处理消息中的URL并提取内容
 * @param {string} message 用户消息
 * @param {boolean} appendContent 是否将提取的内容附加到消息中，默认为true
 * @returns {Promise<{message: string, extractedContent: string}>} 处理后的消息和提取的内容
 */
export async function processMessageWithUrls(message, appendContent = true) {
    const urls = extractUrls(message);
    if (urls.length === 0) {
        return { message, extractedContent: '' };
    }

    logger.mark(`[URL处理]从消息中提取到${urls.length}个URL`)
    let processedMessage = message;
    let extractedContent = '';
    
    for (const url of urls) {
        // 跳过不需要提取内容的URL
        if (isSkippedUrl(url)) {
            logger.mark(`[URL处理]跳过URL: ${url}`)
            continue;
        }

        logger.mark(`[URL处理]开始处理URL: ${url}`)
        const content = await extractUrlContent(url);
        if (content) {
            logger.mark(`[URL处理]成功提取URL内容: ${url}`)
            const urlContent = `\n\n提取的URL内容(${url}):\n内容: ${content.content}`;
            extractedContent += urlContent;
            if (appendContent) {
                processedMessage += urlContent;
            }
        }
    }
    
    return { message: processedMessage, extractedContent };
} 
