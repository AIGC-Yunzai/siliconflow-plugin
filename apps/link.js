import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import Config from '../components/Config.js'

export class LinkPlugin extends plugin {
    constructor() {
        super({
            name: 'Link Plugin',
            dsc: '图片直链获取工具',
            event: 'message',
            priority: 1000,
            rule: [
                {
                    reg: '^#直链', 
                    fnc: 'zhil',
                },
                {
                    reg: '^#删除直链', 
                    fnc: 'deleteLink',
                },
                {
                    reg: '^#设置直链域名',
                    fnc: 'setDomain',
                    permission: 'master'
                }
            ]
        })

        this.tempDir = './temp'
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir)
        }
    }

    /**
     * 获取图片链接
     * @param {object} e 事件对象
     * @returns {Array} 图片链接数组
     */
    async getImg(e) {
        if (!this.e.isMaster) return false;

        if (e.at && !e.source) {
            e.img = [`https://q1.qlogo.cn/g?b=qq&s=0&nk=${e.at}`];
        }
        if (e.source) {
            let reply;
            let seq = e.isGroup ? e.source.seq : e.source.time;
            if (e.adapter === 'shamrock') {
                seq = e.source.message_id;
            }
            if (e.isGroup) {
                reply = (await e.group.getChatHistory(seq, 1)).pop()?.message;
            } else {
                reply = (await e.friend.getChatHistory(seq, 1)).pop()?.message;
            }
            if (reply) {
                let i = [];
                for (let val of reply) {
                    if (val.type === 'image') {
                        i.push(val.url);
                    }
                }
                e.img = i;
            }
        }
        return e.img;
    }

    /**
     * 上传图片功能实现
     * @param {object} e 事件对象
     */
    async zhil(e) {
        if (!this.e.isMaster) return false;
        const config = Config.getConfig()
        const domain = config.link_domain

        console.log('收到命令:', e.msg);

        const imgUrls = await this.getImg(e);

        if (!imgUrls || imgUrls.length === 0) {
            await this.reply('❌未找到有效的图片链接。');
            return true;
        }

        const imgUrl = imgUrls[0];
        console.log('匹配到的图片链接:', imgUrl);

        let tempFilePath = null;

        try {
            // 添加超时控制
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000); // 30秒超时

            const response = await fetch(imgUrl, { 
                signal: controller.signal,
                timeout: 30000 
            });
            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`获取图片失败: ${response.status} ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const imgBuffer = Buffer.from(arrayBuffer);

            tempFilePath = path.join(this.tempDir, `image_${Date.now()}.jpg`);
            fs.writeFileSync(tempFilePath, imgBuffer);

            const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2);
            let formBody = '';

            formBody += `--${boundary}\r\n`;
            formBody += 'Content-Disposition: form-data; name="file"; filename="image.jpg"\r\n';
            formBody += 'Content-Type: image/jpeg\r\n\r\n';
            formBody += Buffer.from(fs.readFileSync(tempFilePath)).toString('binary');
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
                await this.reply(`失败：${uploadResult.msg}`);
            } else if (uploadResult.img) {
                const fixedUrl = uploadResult.img.replace(/([^:])\/+/g, '$1/');
                await this.reply(fixedUrl);
            }

        } catch (err) {
            console.error('失败:', err);
            if (err.name === 'AbortError') {
                await this.reply('请求超时，请稍后重试');
            } else {
                await this.reply('失败：' + err.message);
            }
        } finally {
            // 清理临时文件
            if (tempFilePath && fs.existsSync(tempFilePath)) {
                try {
                    fs.unlinkSync(tempFilePath);
                } catch (err) {
                    console.error('删除临时文件失败:', err);
                }
            }
        }

        return true;
    }

    /**
     * 删除图片链接功能实现
     * @param {object} e 事件对象
     */
    async deleteLink(e) {
        if (!this.e.isMaster) return false;
        const config = Config.getConfig()
        const domain = config.link_domain

        console.log('收到删除命令:', e.msg);

        const cleanDomain = domain.replace(/^https?:\/\//, '');
        const linkMatch = e.msg.match(new RegExp(`https?://${cleanDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/img/(.+\\.jpg)`));
        
        if (!linkMatch) {
            await e.reply('❌未找到有效的图片链接。', true);
            return true;
        }

        const filename = linkMatch[1];
        console.log('匹配到的文件名:', filename);

        try {
            // 添加超时控制
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000);

            const deleteResponse = await fetch(`${domain}/delete.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename }),
                signal: controller.signal,
                timeout: 30000
            });
            clearTimeout(timeout);

            if (!deleteResponse.ok) {
                throw new Error(`删除请求失败: ${deleteResponse.status} ${deleteResponse.statusText}`);
            }

            const deleteResult = await deleteResponse.json();
            if (deleteResult.code !== 200) {
                await e.reply(`失败：${deleteResult.msg}`, true);
            } else {
                await e.reply('ok', true);
            }
        } catch (err) {
            console.error('删除失败:', err);
            if (err.name === 'AbortError') {
                await e.reply('请求超时，请稍后重试', true);
            } else {
                await e.reply('删除失败：' + err.message, true);
            }
        }

        return true;
    }

    /**
     * 设置直链域名
     * @param {object} e 事件对象
     */
    async setDomain(e) {
        if (!this.e.isMaster) return false;

        let domain = e.msg.replace(/^#设置直链域名/, '').trim()
        
        if (!domain) {
            await e.reply('请输入要设置的域名')
            return false
        }

        // 移除末尾的斜杠
        domain = domain.replace(/\/$/, '')

        // 读取配置
        let config = Config.getConfig()
        config.link_domain = domain
        Config.setConfig(config)

        await e.reply(`直链域名已设置为：${domain}`)
        return true
    }
}