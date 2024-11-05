import plugin from '../../../lib/plugins/plugin.js'
import Config from '../components/Config.js'
import { parseSourceImg } from '../utils/getImg.js'
import { uploadImage } from '../utils/uploadImage.js'
import fetch from 'node-fetch'

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
    }

    /**
     * 上传图片功能实现
     * @param {object} e 事件对象
     */
    async zhil(e) {
        console.log('收到命令:', e.msg);

        await parseSourceImg(e)
        
        if (!e.img || e.img.length === 0) {
            await this.reply('❌未找到有效的图片链接。');
            return true;
        }

        const imgUrl = e.img[0];
        console.log('匹配到的图片链接:', imgUrl);

        try {
            const uploadedUrl = await uploadImage(imgUrl);
            await this.reply(uploadedUrl);
        } catch (err) {
            console.error('上传失败:', err);
            if (err.name === 'AbortError') {
                await this.reply('请求超时，请稍后重试');
            } else {
                await this.reply('上传失败：' + err.message);
            }
        }

        return true;
    }

    /**
     * 删除图片链接功能实现
     * @param {object} e 事件对象
     */
    async deleteLink(e) {
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