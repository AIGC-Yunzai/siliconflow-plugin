import plugin from '../../../lib/plugins/plugin.js'
import { spawn } from 'child_process'
import path from 'path'
import common from '../../../lib/common/common.js'
import { pluginRoot } from "../model/path.js"
import {
    parseSourceImg,
    url2Base64,
    getMediaFrom_awaitContext,
} from '../utils/getImg.js'
import Config from "../components/Config.js";

const { PY_ImageToolsSwitch } = Config.getConfig();

// 根据操作系统判断：Windows(win32) 下默认使用 'python'，其他系统(如 linux/macOS) 使用 'python3'
const defaultPythonPath = process.platform === 'win32' ? 'python' : 'python3'

// 支持的指令列表
const commands = [
    '水平翻转', '左翻', '右翻', '竖直翻转', '上翻', '下翻', '灰度图', '黑白',
    '旋转', '缩放', '裁剪', '反相', '反色', '轮廓', '浮雕', '模糊', '锐化',
    '像素化', 'gif倒放', '倒放', 'gif变速', '四宫格', '九宫格', '横向拼接',
    '纵向拼接', '文字转图'
];

export class ImageTools extends plugin {
    constructor() {
        super({
            name: 'ImageTools (图片操作)',
            dsc: '调用Python进行高级图片处理',
            event: 'message',
            priority: 500,
            rule: [
                {
                    reg: '^#图片操作(帮助)?',
                    fnc: 'sendHelp'
                },
                {
                    // 匹配处理指令
                    reg: `^#(${commands.join('|')})(.*)$`,
                    fnc: 'handleImageCmd'
                }
            ]
        })
        this.pyScriptPath = path.join(pluginRoot, 'utils', 'PYImagetools_core.py');
    }

    async sendHelp(e) {
        if (!PY_ImageToolsSwitch) {
            return false;
        }
        let helpMsg = `🎨 ImageTools 图片操作帮助 🎨

【基础变形】
#水平翻转 (或 #左翻 / #右翻)
#竖直翻转 (或 #上翻 / #下翻)
#旋转 [角度] (例: #旋转 180)
#缩放 [尺寸或比例] (例: #缩放 50% 或 #缩放 800x600)
#裁剪 [尺寸或比例] (例: #裁剪 100x100 或 #裁剪 2:1)

【滤镜特效】
#灰度图 (或 #黑白)、#反相 (或 #反色)
#轮廓、#浮雕、#模糊、#锐化、#像素化 [程度] (例: #像素化 8)

【切分与拼接】
#四宫格、#九宫格 (将单图均分并发出)
#横向拼接、#纵向拼接 (需带两张以上图片)

【动图处理】
#gif倒放 (或 #倒放)
#gif变速 [倍率] (例: #gif变速 2x 或 #gif变速 50%)

【其他功能】
#文字转图 [文字] (例: #文字转图 你好)

💡 触发方式：
1. 发送指令时直接附带要处理的图片。
2. 对着已经发送过的图片进行【回复】，并在回复内容中填入指令。`;

        await e.reply(helpMsg);
        return true;
    }

    /**
     * 使用 spawn 执行 Python 脚本 (Promise包装)
     */
    runPythonScript(args) {
        return new Promise((resolve, reject) => {
            // spawn 接收参数数组，无需像 exec 那样处理各种引号转义问题，更加安全和跨平台
            const child = spawn(defaultPythonPath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
            });

            let stdoutChunks = [];
            let stderrChunks = [];

            child.stdout.on('data', (data) => stdoutChunks.push(data));
            child.stderr.on('data', (data) => stderrChunks.push(data));

            child.on('close', (code) => {
                let stdout = Buffer.concat(stdoutChunks).toString('utf-8');
                let stderr = Buffer.concat(stderrChunks).toString('utf-8');
                if (code !== 0) {
                    reject(new Error(`[退出码 ${code}]\n标准输出: ${stdout.length > 200 ? stdout.substring(0, 200) + '...' : stdout}\n错误输出: ${stderr}`));
                    return;
                }
                resolve({ stdout, stderr });
            });

            child.on('error', (error) => {
                // 如果系统里没有对应环境，会报 ENOENT 错误
                if (error.code === 'ENOENT') {
                    reject(new Error(`未找到 Python 环境 (${defaultPythonPath} not found)。请检查是否已正确安装 Python 3 并添加到环境变量。`));
                } else {
                    reject(new Error(`无法启动 Python 进程: ${error.message}`));
                }
            });
        });
    }

    async handleImageCmd(e) {
        if (!PY_ImageToolsSwitch) {
            return false;
        }
        let match = e.msg.match(new RegExp(`^#(${commands.join('|')})(.*)$`));
        if (!match) return false;

        let cmd = match[1];
        let arg = match[2].trim();

        // 处理引用图片
        await parseSourceImg(e)
        if (e.img) {
            let souce_image_base64 = await url2Base64(e.img[0], false, false, { onlyCheck: true })
            if (!souce_image_base64) {
                e.reply('引用的图片地址已失效，请重新发送图片', true)
                return true
            }
        }
        // 检查参数合法性
        if (cmd !== '文字转图' && e.img?.length === 0) {
            if (!(await getMediaFrom_awaitContext(e, this, 1, `${e.msg.substring(0, 10)}`)))
                return true;
        }
        if (cmd === '文字转图' && !arg) {
            await e.reply("请提供要转换的文字，例如：#文字转图 你好呀");
            return true;
        }

        await e.reply("处理中，请稍候...", true);

        try {
            // 构建传递给 python 脚本的参数数组
            let args = [this.pyScriptPath, cmd, arg, ...e.img || []];
            logger.info(`[ImageTools] 正在执行 Python 脚本: ${defaultPythonPath} ${args.join(' ')}`);

            // 执行脚本
            const { stdout } = await this.runPythonScript(args);

            // 解析 stdout 获取 Base64 图片数据
            let outBase64List = stdout.trim().split(/\r?\n/)
                .filter(line => line.startsWith('BASE64:'))
                .map(line => line.replace('BASE64:', ''));

            if (outBase64List.length > 0) {
                let msgList = [];
                for (let b64 of outBase64List) {
                    msgList.push(segment.image(`base64://${b64}`));
                }

                // 多张图采用合并转发，单张图直接发
                if (msgList.length > 3) {
                    let forwardMsg = await common.makeForwardMsg(e, msgList);
                    await e.reply(forwardMsg);
                } else {
                    await e.reply(msgList);
                }
            } else {
                let stdoutExcerpt = stdout.length > 200 ? stdout.substring(0, 200) + '...' : stdout;
                await e.reply(`处理失败：未生成结果。\nPython输出: ${stdoutExcerpt}`);
            }

        } catch (error) {
            let errStr = error.message;
            logger.error(`[ImageTools] 运行错误: \n${errStr}`);

            // 拦截并提示环境问题
            if (errStr.includes('not found') || errStr.includes('未找到 Python')) {
                await e.reply('❌ 环境错误：未安装 Python 3。\n请在服务器上安装 Python3 后再使用本功能。');
            } else if (errStr.includes('ERROR:IMPORT:') || errStr.includes('No module named')) {
                let match = errStr.match(/No module named '([^']+)'/);
                let mod = match ? match[1] : '未知模块';
                await e.reply(`❌ 缺少必要的 Python 模块：${mod}\n\n请在终端运行以下命令安装：\npip install Pillow requests pil-utils`);
            } else {
                // 截取前200个字符作为错误提示反馈给用户
                let errLog = errStr.substring(0, 200);
                await e.reply(`❌ 处理图片时发生错误：\n${errLog}`);
            }
        }

        return true;
    }
}