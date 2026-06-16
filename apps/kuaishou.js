import plugin from '../../../lib/plugins/plugin.js'
import Config from '../components/Config.js'
import { Kuaishou_parser } from '../utils/Video_parser_nodejs.js'
import fetch from 'node-fetch'
import common from '../../../lib/common/common.js'

export class Kuaishou_Video extends plugin {
    constructor() {
        super({
            name: 'Kuaishou Video',
            dsc: '快手解析-Python',
            event: 'message',
            priority: 1000,
            rule: [
                {
                    reg: '[sS]*(v\\.kuaishou\\.com|kuaishou\\.com|chenzhongtech\\.com)\\/[sS]*',
                    fnc: 'kuaishouParser',
                },
            ]
        })
    }

    async kuaishouParser(e) {
        if (!Config.getConfig().kuaishouTV) {
            return false;
        }
        logger.info('[sf插件]快手解析:', e.msg);

        try {
            const result = await Kuaishou_parser.parse(e.msg);
            if (result.success && result.data.length > 0) {
                for (const item of result.data) {
                    logger.debug(`   处理快手内容: ${item.title} - ${item.author}`);

                    const infoText = `标题: ${item.title}\n作者: ${item.author}\n日期: ${item.date}\n${item.is_gallery ? "图集" : "视频"}ID: ${item.video_id}`;

                    try {
                        // === 处理图集 ===
                        if (item.is_gallery && item.images && item.images.length > 0) {
                            if (item.images.length > 3) {
                                // 合并转发
                                if (item.cover_url) {
                                    await e.reply([segment.image(item.cover_url), `${infoText}\n图数: ${item.images.length}张`], true);
                                }
                                const forwardMsgs = [
                                    `${item.title}`,
                                    `作者: ${item.author}\n日期: ${item.date}\n图数: ${item.images.length} 张`
                                ];
                                item.images.forEach((img) => {
                                    forwardMsgs.push(segment.image(img));
                                });
                                const msgx = await common.makeForwardMsg(e, forwardMsgs);
                                await e.reply(msgx);
                            } else {
                                // 图片较少直接发送
                                const imageSegments = item.images.map(img => segment.image(img));
                                await e.reply([...imageSegments, infoText], true);
                            }
                        }
                        // === 处理视频 ===
                        else if (item.video_url) {
                            if (item.cover_url) {
                                await e.reply([segment.image(item.cover_url), infoText], true);
                            }

                            try {
                                const headResponse = await fetch(item.video_url, { method: 'HEAD' });
                                if (headResponse.ok) {
                                    const contentLength = headResponse.headers.get('content-length');
                                    if (contentLength) {
                                        const fileSizeMB = parseInt(contentLength) / (1024 * 1024);
                                        if (fileSizeMB > Config.getConfig().video_maxSizeMB) {
                                            await e.reply(`视频文件过大 (${fileSizeMB.toFixed(1)}MB > ${Config.getConfig().video_maxSizeMB}MB)，跳过下载\n请手动访问：${item.video_url}`, true);
                                            continue;
                                        }
                                        logger.debug(`视频大小: ${fileSizeMB.toFixed(1)}MB，开始下载...`);
                                    }
                                }

                                const videoResponse = await fetch(item.video_url);
                                if (videoResponse.ok) {
                                    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
                                    const sfConfig = Config.getConfig();
                                    if (sfConfig.napcat_stream_video && e.bot?.sendApi) {
                                        try {
                                            const { NapCatStreamClient } = await import('../utils/NapCatStreamClient.js');
                                            const client = new NapCatStreamClient(e.bot);
                                            const result = await client.uploadBuffer(videoBuffer, `${item.video_id || 'video'}.mp4`);
                                            if (result?.file_path) {
                                                await client.sendVideoByPath(e, result.file_path);
                                            } else {
                                                throw new Error('NapCat: 未返回 file_path');
                                            }
                                        } catch (streamErr) {
                                            logger.mark(`[sf插件] NapCat流式上传失败, 回退普通发送: ${streamErr.message}`);
                                            await e.reply(segment.video(videoBuffer));
                                        }
                                    } else {
                                        await e.reply(segment.video(videoBuffer));
                                    }
                                } else {
                                    await e.reply(`视频下载失败，请手动访问：${item.video_url}`, true);
                                }
                            } catch (videoError) {
                                logger.mark(`视频下载失败: ${videoError.message}`);
                                await e.reply(`视频下载失败，请手动访问：${item.video_url}`, true);
                            }
                        }
                        // 只有封面
                        else if (item.cover_url) {
                            await e.reply([segment.image(item.cover_url), infoText], true);
                        }
                        // 只有文本
                        else {
                            await e.reply(infoText, true);
                        }
                    } catch (replyError) {
                        logger.mark(`发送消息失败: ${replyError.message}`);
                        await e.reply(`✅ 解析成功但发送失败\n${infoText}`, true);
                    }
                }
            } else {
                await e.reply('❌ 解析失败：未获取到有效数据', true);
                return false;
            }

        } catch (error) {
            logger.mark(`❌ 快手解析失败: ${error.message}`);
            if (error.message.includes('ModuleNotFoundError') || error.message.includes('No module named')) {
                const missingModule = error.message.match(/No module named '([^']+)'/);
                const moduleName = missingModule ? missingModule[1] : '未知模块';
                await e.reply(`❌ 快手解析失败：缺少Python依赖\n请安装：pip3 install ${moduleName}`, true);
            } else {
                await e.reply(`❌ 快手解析失败：${error.message}`, true);
            }
        }
        return true;
    }
}