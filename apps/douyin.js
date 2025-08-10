import plugin from '../../../lib/plugins/plugin.js'
import Config from '../components/Config.js'
import { Douyin_parser } from '../utils/douyin_parser_nodejs.js'
import fetch from 'node-fetch'
import common from '../../../lib/common/common.js'

const douyinTV_on = Config.getConfig().douyinTV

export class Douyin_Video extends plugin {
    constructor() {
        super({
            name: 'Douyin Video',
            dsc: '抖音解析-Python',
            event: 'message',
            priority: 1000,
            rule: [
                {
                    reg: '[sS]*\\.douyin\\.[sS]*',
                    fnc: 'douyinParser',
                },
            ]
        })
    }

    async douyinParser(e) {
        if (!douyinTV_on) {
            return false;
        }
        // logger.info('douyinParser 收到命令:', e.msg);

        try {
            const result = await Douyin_parser.parse(e.msg);
            if (result.success && result.data.length > 0) {
                // 处理每个视频
                for (const item of result.data) {
                    console.log(`   处理视频: ${item.title} - ${item.author}`);
                    // 构建信息文本
                    const infoText = `标题: ${item.title}\n作者: ${item.author}\n日期: ${item.date}\n视频ID: ${item.video_id}`;
                    try {
                        // 如果是图集
                        if (item.is_gallery && item.images && item.images.length > 0) {
                            // 如果图片数量大于3张，使用合并转发
                            if (item.images.length > 3) {
                                // 先发送封面和基本信息
                                if (item.cover_url) {
                                    await e.reply([segment.image(item.cover_url), `📸 图集解析成功\n${infoText}\n\n图片数量：${item.images.length}张`], true);
                                }
                                // 创建合并转发消息
                                const forwardMsgs = [
                                    `📸 抖音图集 - ${item.title}`,
                                    `作者：${item.author}`,
                                    `共 ${item.images.length} 张图片`
                                ];
                                // 添加所有图片到合并转发
                                item.images.forEach((img, index) => {
                                    forwardMsgs.push(segment.image(img));
                                });
                                const msgx = await common.makeForwardMsg(e, forwardMsgs);
                                await e.reply(msgx);
                            } else {
                                // 图片数量不超过3张，直接发送所有图片
                                const imageSegments = item.images.map(img => segment.image(img));
                                await e.reply([...imageSegments, infoText], true);
                            }
                        }
                        // 如果是视频
                        else if (item.video_url) {
                            // 先发送封面图片和信息
                            if (item.cover_url) {
                                await e.reply([segment.image(item.cover_url), infoText], true);
                            }
                            // 然后发送视频
                            try {
                                const videoResponse = await fetch(item.video_url, {
                                    headers: {
                                        'User-Agent': 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G955U Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
                                        'Referer': 'https://www.douyin.com/?is_from_mobile_home=1&recommend=1'
                                    }
                                });
                                if (videoResponse.ok) {
                                    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
                                    await e.reply(segment.video(videoBuffer));
                                } else {
                                    await e.reply(`视频下载失败，请手动访问：${item.video_url}`, true);
                                }
                            } catch (videoError) {
                                console.log(`视频下载失败: ${videoError.message}`);
                                await e.reply(`视频下载失败，请手动访问：${item.video_url}`, true);
                            }
                        }
                        // 只有封面图的情况
                        else if (item.cover_url) {
                            await e.reply([segment.image(item.cover_url), infoText], true);
                        }
                        // 只有文本信息
                        else {
                            await e.reply(infoText, true);
                        }
                    } catch (replyError) {
                        console.log(`发送消息失败: ${replyError.message}`);
                        await e.reply(`✅ 解析成功但发送失败\n${infoText}`, true);
                    }
                }
            } else {
                await e.reply('❌ 解析失败：未获取到有效数据', true);
            }

        } catch (error) {
            console.log(`❌ 解析失败: ${error.message}`);

            // 检查是否是缺少依赖的错误
            if (error.message.includes('ModuleNotFoundError') ||
                error.message.includes('No module named')) {
                const missingModule = error.message.match(/No module named '([^']+)'/);
                const moduleName = missingModule ? missingModule[1] : '未知模块';

                await e.reply(`❌ 抖音解析失败：缺少Python依赖\n\n请先安装以下依赖：\n1. 确保已安装 python3\n2. 安装缺少的模块：pip3 install ${moduleName}`, true);
            } else {
                await e.reply(`❌ 抖音解析失败：${error.message}`, true);
            }
        }

        return true;
    }

}