import puppeteer from "../../../lib/puppeteer/puppeteer.js";
const _path = process.cwd();

/**
 * @description: 生成对话内容的markdown图片
 * @param {number} userId 用户ID e.user_id；用于第一个头像显示
 * @param {number} botId 机器人ID e.self_id；用于第二个头像显示
 * @param {string} userMsg user输入内容
 * @param {string} answer bot回复内容
 * @return {object} 图片对象
 */
export async function markdown_screenshot(userId, botId, userMsg, answer) {
    logger.mark('[sf插件] 正在生成markdown图片...')
    const data = {
        _path,
        tplFile: './plugins/siliconflow-plugin/resources/markdownPic/index.html',
        content: answer,
        userId,
        botId,
        userMsg
    }
    const img = await puppeteer.screenshot("markdown", data);
    return img;
}