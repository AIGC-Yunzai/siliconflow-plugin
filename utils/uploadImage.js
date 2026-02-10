import fetch from 'node-fetch'
import Config from '../components/Config.js'

/**
 * 上传媒体文件（图片/视频）到指定域名
 * @param {string} fileUrl 文件URL
 * @param {*} config 配置对象
 * @param {string} type 文件类型 'image' | 'video'
 * @returns {Promise<string>} 上传后的URL
 */
export async function uploadMedia(fileUrl, config = null, type = 'image') {
    if (!config) config = Config.getConfig()
    const domain = config.link_domain

    if (!domain) {
        throw new Error('未配置服务器域名，请使用 #设置直链域名 命令设置')
    }

    try {
        // 1. 下载文件
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);

        const response = await fetch(fileUrl, {
            headers: {
                // 伪装 User-Agent 防止被拦截
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            signal: controller.signal,
            timeout: 60000
        });
        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`下载原文件失败: ${response.status} ${response.statusText}`);
        }

        const fileBuffer = Buffer.from(await response.arrayBuffer());

        // 2. 构造 Multipart 表单
        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2);

        let filename = 'image.jpg';
        let contentType = 'image/jpeg';

        // 根据类型定义文件名
        if (type === 'video') {
            filename = 'video.mp4';
            contentType = 'video/mp4';
        }

        let formBody = '';
        formBody += `--${boundary}\r\n`;
        formBody += `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`;
        formBody += `Content-Type: ${contentType}\r\n\r\n`;
        formBody += fileBuffer.toString('binary');
        formBody += `\r\n--${boundary}--\r\n`;

        // 3. 上传文件
        const uploadController = new AbortController();
        const uploadTimeout = setTimeout(() => uploadController.abort(), 120000);

        const uploadResponse = await fetch(`${domain}/upload.php`, {
            method: 'POST',
            body: Buffer.from(formBody, 'binary'),
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`
            },
            signal: uploadController.signal,
            timeout: 120000
        });
        clearTimeout(uploadTimeout);

        if (!uploadResponse.ok) {
            throw new Error(`上传服务端报错: ${uploadResponse.status} ${uploadResponse.statusText}`);
        }

        const uploadResult = await uploadResponse.json();

        // 打印调试日志
        // logger.info(`[直链插件] 服务端响应: ${JSON.stringify(uploadResult)}`);

        if (uploadResult.code !== 200) {
            throw new Error(uploadResult.msg || '上传接口返回错误');
        }

        // 优先检查 videos (对应你的日志)，然后检查 img, url 等其他可能字段
        const resultUrl = uploadResult.videos ||
            uploadResult.video ||
            uploadResult.img ||
            uploadResult.url ||
            uploadResult.src ||
            uploadResult.data;

        if (!resultUrl) {
            throw new Error(`上传成功，但在响应中未找到URL字段。服务端返回: ${JSON.stringify(uploadResult)}`);
        }

        // 修复双斜杠
        return String(resultUrl).replace(/([^:])\/+/g, '$1/');

    } catch (error) {
        throw error;
    }
}
