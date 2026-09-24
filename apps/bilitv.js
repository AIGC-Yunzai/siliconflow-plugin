import Config from '../components/Config.js'
import plugin from '../../../lib/plugins/plugin.js'
import _ from 'lodash'

/**
 * 触发正则统一收紧策略（避免在普通聊天里误触发）：
 * 1) ID 前后不能紧跟字母/数字：dlss4.5 -> "ss4"、class4 -> "ss4"、save1 -> ... 这类词内命中全部排除；
 * 2) 数字至少 2 位：排除 AV1 编码名、MD5、EP1 等常见技术名词；
 * 3) b23 短链仍兼容 JSON 里转义斜杠的形式（b23.tv\/xxxxxxx）。
 * 注意：loader 是 `reg.test(e.msg)` 的裸匹配（lib/plugins/loader.js:288），正则本身必须自带边界。
 */
const regB23 = /(?:b23\.tv|bili2233\.cn)\\?\/[0-9A-Za-z]{6,12}/
const regBV = /(?<![0-9A-Za-z])BV1[0-9A-Za-z]{9}(?![0-9A-Za-z])/
const regAV = /(?<![0-9A-Za-z])av\d{2,10}(?![0-9A-Za-z])/
const regMD = /(?<![0-9A-Za-z])md\d{2,10}(?![0-9A-Za-z])/ // media_id 番剧md号
const regSS = /(?<![0-9A-Za-z])ss\d{2,10}(?![0-9A-Za-z])/ // season_id 番剧id
const regEP = /(?<![0-9A-Za-z])ep\d{2,10}(?![0-9A-Za-z])/ // episode_id 番剧剧集编号

/** B站接口通用请求头 */
const BILI_HEADERS = {
    'referer': 'https://www.bilibili.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
}

/**
 * av 号 -> BV 号
 * @param {string|number} avNumber av 号（不含 av 前缀）
 * @returns {string|null} 无法换算时返回 null
 */
function avToBvid(avNumber) {
    const table = 'fZodR9XQDSUm21yCkr6zBqiveYah8bt4xsWpHnJE7jL5VG3guMTKNPAwcF'
    const s = [11, 10, 3, 8, 4, 6]
    const xor = 177451812
    const add = 8728348608
    let x = (String(avNumber) ^ xor) + add
    const r = Array.from('BV1  4 1 7  ')
    for (let i = 0; i < 6; i++) {
        r[s[i]] = table[Math.floor(x / 58 ** i) % 58]
    }
    const bvid = r.join("")
    return regBV.test(bvid) ? bvid : null
}

/**
 * 展开 b23.tv / bili2233.cn 短链，返回真实长链接。
 *
 * 借鉴 zhenxun-org/zhenxun_bot_plugins `plugins/parse_bilibili/services/network_service.py`
 * 的 ParserService.resolve_short_url：它刻意 follow_redirects=False，只读 302 的 Location。
 * 原因是跟随重定向会让客户端继续去抓整个 bilibili 视频页 HTML（实测 200 + text/html），
 * 既多下载几百 KB，又更容易被风控拦成 412。
 *
 * 实测（.agents/tmp/probe-b23.mjs，桌面 UA）：
 *   b23.tv/ep374910    -> 302 Location: https://www.bilibili.com/bangumi/play/ep374910
 *   b23.tv/ss33802     -> 302 Location: https://www.bilibili.com/bangumi/play/ss33802
 *   b23.tv/BV1xx411c7mD-> 302 Location: https://www.bilibili.com/video/BV1xx411c7mD
 *   b23.tv/av170001    -> 302 Location: https://www.bilibili.com/video/av170001
 *
 * @param {string} shortUrl 已补全协议的短链
 * @returns {Promise<string|null>} 展开后的 URL，失败返回 null
 */
async function expandShortUrl(shortUrl) {
    try {
        const res = await fetch(shortUrl, { redirect: 'manual', headers: BILI_HEADERS })
        const location = res.headers.get('location')
        if (location) return new URL(location, shortUrl).href
        // 极端情况下 fetch 实现/代理会忽略 manual，这时 response.url 已是最终地址
        if (res.url && res.url !== shortUrl) return res.url
    } catch (err) {
        logger.debug(`[sf插件]b23 读取 Location 失败，回退为跟随重定向: ${err.message}`)
    }
    try {
        const finalUrl = (await fetch(shortUrl, { headers: BILI_HEADERS })).url
        // 仍停在短链域名上说明没拿到真实目标（短链失效 / 返回的是错误页）
        if (regB23.test(finalUrl)) return null
        return finalUrl
    } catch (err) {
        logger.info(`[sf插件]b23 短链解析失败: ${shortUrl} ${err.message}`)
        return null
    }
}

/**
 * 识别展开后的 B 站链接属于哪种资源。
 * 借鉴 zhenxun parse_bilibili `utils/url_parser.py` 的解析器注册表（按类型正则依次匹配）。
 * 这里只认本插件支持的两种：普通视频（BV / av）与番剧（ep / ss / md），
 * 其余（专栏 cv、动态 opus、直播、空间）返回 null，交给别的插件处理。
 *
 * @param {string} url 展开后的链接
 * @returns {{type: 'bv'|'av'|'ep'|'ss'|'md', id: string}|null}
 */
function classifyBiliUrl(url) {
    if (!url) return null
    // 只按路径判定，避免 query（?spm_id_from=... / ?share_source=...）里的字符干扰
    const [path, query = ''] = url.split(/[?#]/)
    const bv = regBV.exec(path)
    if (bv) return { type: 'bv', id: bv[0] }
    const av = regAV.exec(path)
    if (av) return { type: 'av', id: av[0].slice(2) }
    const ep = regEP.exec(path)
    if (ep) return { type: 'ep', id: ep[0].slice(2) }
    const ss = regSS.exec(path)
    if (ss) return { type: 'ss', id: ss[0].slice(2) }
    const md = regMD.exec(path)
    if (md) return { type: 'md', id: md[0].slice(2) }
    // 兜底：ID 只出现在 query 里的活动页（如 ?bvid=BV1xx411c7mD）
    const params = new URLSearchParams(query)
    const qbvid = regBV.exec(params.get('bvid') || '')
    if (qbvid) return { type: 'bv', id: qbvid[0] }
    const qaid = params.get('aid') || params.get('avid')
    if (qaid && /^\d+$/.test(qaid)) return { type: 'av', id: qaid }
    return null
}

function formatNumber(num) {
    if (num < 10000) {
        return num
    } else {
        return (num / 10000).toFixed(1) + "万"
    }
}

export class bilitv extends plugin {
    constructor() {
        super({
            name: "bilitv",
            dsc: "b站解析",
            event: "message",
            priority: 114518,
            rule: [
                {
                    reg: regBV,
                    fnc: "jxsp"
                },
                {
                    reg: regAV,
                    fnc: "jxsp"
                },
                {
                    reg: regB23,
                    fnc: "jxsp"
                },
                {
                    reg: regSS,
                    fnc: "jxfj"
                },
                {
                    reg: regMD,
                    fnc: "jxfj"
                },
                {
                    reg: regEP,
                    fnc: "jxfj"
                }
            ]
        })
    }

    async jxsp(e) {
        if (!Config.getConfig().turnOnBilitv)
            return false;
        // 二次校验：必须真的存在 BV 号 / av 号 / b23 短链，避免 bvid 为空时打到接口（返回 -400 请求错误）
        if (!regBV.test(e.msg) && !regAV.test(e.msg) && !regB23.test(e.msg))
            return false;
        // 跳过机器人自己回显的统计文本（同时出现“点赞/投币”），避免被引用后二次解析
        if (e.msg.includes("点赞") && e.msg.includes("投币"))
            return false;
        logger.info('[sf插件]b站解析:', e.msg);
        let bvid = ""
        if (e.msg.match(regAV)) {
            bvid = avToBvid((regAV.exec(e.msg))[0].replace(/av/g, ""))
            if (!bvid) {
                // av 号换算失败属于解析失败：return false 放行，别挡住其它插件
                return false
            }
        }
        if (e.msg.match(regB23)) {
            const shortUrl = "https://" + (regB23.exec(e.msg)[0]).replace(/\\/g, "")
            const realUrl = await expandShortUrl(shortUrl)
            if (!realUrl) {
                e.reply("解析失败", true)
                return false
            }
            const target = classifyBiliUrl(realUrl)
            logger.info(`[sf插件]b23 短链展开: ${shortUrl} -> ${realUrl} (${target ? target.type : 'unsupported'})`)
            if (target && target.type !== 'bv' && target.type !== 'av') {
                // 短链指向番剧（/bangumi/play/ep...、/play/ss...、/media/md...），交给番剧解析
                return await this.jxfj(e, target)
            }
            if (!target) {
                // 指向专栏 / 动态 / 直播等本插件不支持的内容，放行给其它插件
                return false
            }
            bvid = target.type === 'bv' ? target.id : avToBvid(target.id)
            if (!bvid) {
                e.reply("解析失败", true)
                return false
            }
        }
        if (e.msg.match(regBV)) {
            bvid = regBV.exec(e.msg)[0]
        }
        let res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
            headers: BILI_HEADERS
        })
        res = await res.json()
        if (res.code != 0) {
            e.reply("解析失败\n信息:" + res.message, true)
            return false
        } else {
            e.reply([segment.image(res.data.pic), `${res.data.title}\nhttps://www.bilibili.com/video/${bvid}\n作者: ${res.data.owner.name}\n播放: ${formatNumber(res.data.stat.view)} | 弹幕: ${formatNumber(res.data.stat.danmaku)}\n点赞: ${formatNumber(res.data.stat.like)} | 投币: ${formatNumber(res.data.stat.coin)}\n收藏: ${formatNumber(res.data.stat.favorite)} | 评论: ${formatNumber(res.data.stat.reply)}`], true)
        }
        res = await fetch(`https://api.bilibili.com/x/player/playurl?avid=${res.data.aid}&cid=${res.data.cid}&qn=16&type=mp4&platform=html5`, {
            headers: BILI_HEADERS
        })
        res = await res.json()
        if (!res || res.code != 0) {
            e.reply("视频解析失败", true)
            return false
        }

        // 先检查视频文件大小
        try {
            const headResponse = await fetch(res.data.durl[0].url, {
                method: 'HEAD',
                headers: BILI_HEADERS
            });

            if (headResponse.ok) {
                const contentLength = headResponse.headers.get('content-length');
                if (contentLength) {
                    const fileSizeBytes = parseInt(contentLength);
                    const fileSizeMB = fileSizeBytes / (1024 * 1024);
                    if (fileSizeMB > Config.getConfig().video_maxSizeMB) {
                        e.reply(`视频文件太大惹(${fileSizeMB.toFixed(1)}MB > ${Config.getConfig().video_maxSizeMB}MB)，人家不敢解析QAQ`, true);
                        // 超限是本插件明确的策略，且已回复提示 -> 属于"已处理"，return true 消费消息，
                        // 避免其它插件再对同一条消息重复解析/下载同一段视频
                        return true;
                    }
                    logger.debug(`视频大小: ${fileSizeMB.toFixed(1)}MB，开始下载...`);
                }
            }
        } catch (sizeCheckError) {
            logger.info(`视频大小检查失败，将判断视频时长: ${sizeCheckError.message}`);
            if (res.data.duration > (10 * 60)) {
                e.reply(`视频时长 ${(res.data.duration / 60).toFixed(1)} 分钟，人家不敢解析QAQ`, true)
                // 时长超限同样是明确策略 + 已回复提示 -> return true 消费消息，避免重复解析/下载
                return true;
            }
        }

        // 根据配置决定是否使用 NapCat 流式上传发送
        const sfConfig = Config.getConfig();
        const videoBuffer = Buffer.from(await (await fetch(res.data.durl[0].url, {
            headers: BILI_HEADERS
        })).arrayBuffer());
        if (sfConfig.napcat_stream_video && e.bot?.sendApi) {
            try {
                const { NapCatStreamClient } = await import('../utils/NapCatStreamClient.js');
                const client = new NapCatStreamClient(e.bot);
                const result = await client.uploadBuffer(videoBuffer, `${bvid || 'video'}.mp4`);
                if (result?.file_path) {
                    await client.sendVideoByPath(e, result.file_path);
                } else {
                    throw new Error('NapCat: 未返回 file_path');
                }
                return true;
            } catch (streamErr) {
                logger.error(`[sf插件] NapCat流式上传失败, 回退普通发送: ${streamErr.message}`);
                await e.reply(segment.video(videoBuffer));
            }
        } else {
            await e.reply(segment.video(videoBuffer));
        }
        return true
    }


    /**
     * 番剧 media_id(md) -> season_id(ss)
     * @param {object} e 消息事件
     * @param {string|number} mdId media_id（不含 md 前缀）
     * @returns {Promise<string|null>} 失败时返回 null（已回复错误信息）
     */
    async mdToSeasonId(e, mdId) {
        try {
            const temp = await (await fetch(`https://api.bilibili.com/pgc/review/user?media_id=${mdId}`, {
                headers: BILI_HEADERS
            })).json()
            if (temp.code != 0) {
                e.reply("解析失败\n信息:" + temp.message, true)
                return null
            }
            return temp.result.media.season_id
        } catch (err) {
            e.reply("解析失败", true)
            return null
        }
    }

    /**
     * @param {object} e 消息事件
     * @param {{type: 'ep'|'ss'|'md', id: string}|null} hint b23 短链展开出的目标类型（短链本身不含 ID，正则判定不适用）
     */
    async jxfj(e, hint = null) {
        if (!Config.getConfig().turnOnBilitv)
            return false;
        // 二次校验：必须真的存在 ss / md / ep 号，避免无 ID 时用空 season_id 打到接口（返回 -404 啥都木有）
        if (!hint && !regSS.test(e.msg) && !regMD.test(e.msg) && !regEP.test(e.msg))
            return false;
        // 跳过机器人自己回显的统计文本（同时出现“点赞/投币”），避免被引用后二次解析
        if (e.msg.includes("点赞") && e.msg.includes("投币"))
            return false;
        logger.info(`[sf插件]b站解析: ${e.msg}${hint ? ` (短链指向 ${hint.type}${hint.id})` : ''}`);
        // 只解析出 season_id / ep_id，两者走同一个接口。
        // 借鉴 zhenxun parse_bilibili `services/api_service.py#get_bangumi_info`：
        // pgc/view/web/season 用 ?season_id= 或 ?ep_id= 都能查（实测两种参数返回的卡片字段完全一致），
        // 不必再 "ss -> season/section 取首集 -> 用 ep 再查一次"：少一次请求，也不会因 main_section 缺失而失败。
        let seasonId = null
        let epId = null
        if (hint) {
            if (hint.type === 'ep') {
                epId = hint.id
            } else if (hint.type === 'ss') {
                seasonId = hint.id
            } else {
                seasonId = await this.mdToSeasonId(e, hint.id)
            }
        } else if (e.msg.match(regEP)) {
            epId = (regEP.exec(e.msg))[0].replace("ep", "")
        } else if (e.msg.match(regMD)) {
            seasonId = await this.mdToSeasonId(e, (regMD.exec(e.msg))[0].replace("md", ""))
        } else {
            seasonId = (regSS.exec(e.msg))[0].replace("ss", "")
        }
        if (!epId && !seasonId) {
            return false
        }
        let res = await (await fetch(`https://api.bilibili.com/pgc/view/web/season?${epId ? `ep_id=${epId}` : `season_id=${seasonId}`}`, {
            headers: BILI_HEADERS
        })).json()
        if (res.code != 0) {
            e.reply("解析失败\n信息:" + res.message, true)
            return false
        }
        // 电影等条目没有 rating / seasons 字段，全部兜底取值：
        // 否则 reply 处会抛 TypeError，异常会吞掉消息、挡住其它插件。
        const info = res.result || {}
        const ratingText = info.rating ? `评分: ${info.rating.score} / ${info.rating.count}` : "评分: 暂无"
        const epText = [info.new_ep?.desc, info.seasons?.[0]?.new_ep?.index_show].filter(Boolean).join(", ")
        const stat = info.stat || {}
        e.reply([
            segment.image(info.cover),
            `${info.title}\n${ratingText}\n${epText}\n`,
            "---\n",
            `${info.link || ''}\n播放: ${formatNumber(stat.views || 0)} | 弹幕: ${formatNumber(stat.danmakus || 0)}\n点赞: ${formatNumber(stat.likes || 0)} | 投币: ${formatNumber(stat.coins || 0)}\n追番: ${formatNumber(stat.favorites || 0)} | 收藏: ${formatNumber(stat.favorite || 0)}\n`
        ], true)
        return true
    }
}