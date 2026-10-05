import fetch from 'node-fetch'

// 由插件下载正文图片，避免适配器拉取抖音签名链接时丢失请求头。
export async function sendDouyinGallery(e, item, infoText, {
    makeImage, makeForwardMsg, fetchImpl = fetch,
}) {
    const images = [];
    const failures = [];
    for (const [index, url] of item.images.entries()) {
        try {
            const response = await fetchImpl(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
                    'Referer': 'https://www.iesdouyin.com/',
                },
                timeout: 15000,
                size: 20 * 1024 * 1024,
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const contentType = response.headers.get('content-type');
            if (contentType && !contentType.startsWith('image/')) {
                throw new Error('下载结果不是图片');
            }
            const buffer = Buffer.from(await response.arrayBuffer());
            if (!buffer.length) throw new Error('图片为空');
            images.push({ index, segment: makeImage(buffer) });
        } catch (error) {
            failures.push(`第${index + 1}张图片下载失败：${error.message}\n${url}`);
        }
    }

    const caption = `${infoText}\n图数: ${item.images.length}张`;
    let forwarded = false;
    if (images.length > 3) {
        try {
            const message = await makeForwardMsg(e, [caption, ...images.map(img => img.segment)]);
            if (!message) throw new Error('未生成合并转发');
            const result = await e.reply(message);
            if (result === false || result?.error) throw new Error('合并转发发送失败');
            forwarded = true;
        } catch {
            // 平台不支持合并转发或发送失败时，继续分批发送正文图片。
        }
    }
    if (!forwarded) {
        for (let offset = 0; offset < images.length; offset += 3) {
            const batch = images.slice(offset, offset + 3);
            try {
                const result = await e.reply([
                    ...batch.map(img => img.segment),
                    offset === 0 ? caption : `图集续图（${offset + 1}—${offset + batch.length}）`,
                ], true);
                if (result === false || result?.error) throw new Error('平台返回发送失败');
            } catch (error) {
                for (const img of batch) {
                    failures.push(`第${img.index + 1}张图片发送失败：${error.message}\n${item.images[img.index]}`);
                }
            }
        }
    }
    if (failures.length) {
        await e.reply(`${caption}\n${failures.join('\n')}`, true);
    }
}
