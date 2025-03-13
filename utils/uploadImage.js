import fetch from 'node-fetch'
import Config from '../components/Config.js'

/**
 * 上传图片到指定域名
 * @param {string} imgUrl 图片URL
 * @param {*} config
 * @returns {Promise<string>} 上传后的图片URL
 */
export async function uploadImage(imgUrl, config = null) {
    if (!config)
        config = Config.getConfig()
    const domain = config.link_domain

    if (!domain) {
        throw new Error('未配置图片服务器域名，请使用 #设置直链域名 命令设置')
    }

    try {
        // 添加超时控制
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(imgUrl, {
            signal: controller.signal,
            timeout: 30000
        });
        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`获取图片失败: ${response.status} ${response.statusText}`);
        }

        const imgBuffer = Buffer.from(await response.arrayBuffer());

        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2);
        let formBody = '';

        formBody += `--${boundary}\r\n`;
        formBody += 'Content-Disposition: form-data; name="file"; filename="image.jpg"\r\n';
        formBody += 'Content-Type: image/jpeg\r\n\r\n';
        formBody += imgBuffer.toString('binary');
        formBody += `\r\n--${boundary}--\r\n`;

        // 添加新的超时控制
        const uploadController = new AbortController();
        const uploadTimeout = setTimeout(() => uploadController.abort(), 30000);

        const uploadResponse = await fetch(`${domain}/upload.php`, {
            method: 'POST',
            body: Buffer.from(formBody, 'binary'),
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`
            },
            signal: uploadController.signal,
            timeout: 30000
        });
        clearTimeout(uploadTimeout);

        if (!uploadResponse.ok) {
            throw new Error(`上传失败: ${uploadResponse.status} ${uploadResponse.statusText}`);
        }

        const uploadResult = await uploadResponse.json();
        if (uploadResult.code !== 200) {
            throw new Error(uploadResult.msg);
        }

        return uploadResult.img.replace(/([^:])\/+/g, '$1/');

    } catch (error) {
        throw error;
    } finally {
    }
} 