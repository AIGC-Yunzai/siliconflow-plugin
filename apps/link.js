import plugin from '../../../lib/plugins/plugin.js'
import Config from '../components/Config.js'
import { parseSourceImg } from '../utils/getImg.js'
import { uploadMedia } from '../utils/uploadImage.js'
import fetch from 'node-fetch'

export class LinkPlugin extends plugin {
    constructor() {
        super({
            name: 'Link Plugin',
            dsc: '直链获取工具',
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
     * 上传功能实现
     */
    async zhil(e) {
        const config = Config.getConfig()
        if (config.zhilOnlyMaster && !e.isMaster) {
            return true;
        }
        // logger.info('收到命令:', e.msg);

        // 获取引用消息中的图片或视频
        await parseSourceImg(e)

        let fileUrl = '';
        let fileType = 'image';

        // 优先判断视频 (e.get_Video 是上一条回答中添加的属性)
        if (e.get_Video && e.get_Video.length > 0) {
            fileUrl = e.get_Video[0].url;
            fileType = 'video';
            await this.reply('检测到视频，正在下载并上传，请稍候...', true);
        }
        // 其次判断图片
        else if (e.img && e.img.length > 0) {
            fileUrl = e.img[0];
            fileType = 'image';
        }
        else {
            await this.reply('❌未找到有效的图片或视频。', true);
            return true;
        }

        try {
            // 调用通用的上传函数
            const uploadedUrl = await uploadMedia(fileUrl, config, fileType);
            await this.reply(uploadedUrl, true);
        } catch (err) {
            console.error('上传失败:', err);
            if (err.name === 'AbortError') {
                await this.reply('请求超时，文件可能过大或网络波动', true);
            } else {
                await this.reply('上传失败：' + err.message, true);
            }
        }

        return true;
    }

    /**
     * 删除链接功能实现
     */
    async deleteLink(e) {
        const config = Config.getConfig()
        const domain = config.link_domain

        logger.info('收到删除命令:', e.msg);

        const cleanDomain = domain.replace(/^https?:\/\//, '');
        const regex = new RegExp(`https?://${cleanDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/.*` + `([a-zA-Z0-9_-]+\\.(jpg|jpeg|png|gif|mp4))`);

        const linkMatch = e.msg.match(regex);

        if (!linkMatch) {
            await e.reply('❌未找到属于本服务器的有效链接。', true);
            return true;
        }

        const filename = linkMatch[1]; // 获取捕获组中的文件名
        logger.info('匹配到的文件名:', filename);

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000);

            const deleteResponse = await fetch(`${domain}/delete.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename }), // 确保后端 delete.php 只需要文件名即可删除
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
            await e.reply('删除失败：' + err.message, true);
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
            await e.reply('请输入要设置的域名', true)
            return false
        }

        // 移除末尾的斜杠
        domain = domain.replace(/\/$/, '')

        // 读取配置
        let config = Config.getConfig()
        config.link_domain = domain
        Config.setConfig(config)

        await e.reply(`直链域名已设置为：${domain}`, true)
        return true
    }
}