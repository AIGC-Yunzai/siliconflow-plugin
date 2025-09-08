import Config from '../components/Config.js'
import plugin from '../../../lib/plugins/plugin.js'
import _ from 'lodash'

const { turnOnBilitv, video_maxSizeMB } = Config.getConfig();

const regB23 = /(b23\.tv|bili2233.cn)\\?\/\w{7}/
const regBV = /BV1\w{9}/
const regAV = /av\d+/
const regMD = /md\d+/ // media_id 番剧md号
const regSS = /ss\d+/ // season_id 番剧id
const regEP = /ep\d+/ // episode_id 番剧剧集编号

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
        if (!turnOnBilitv)
            return false;
        logger.info('[sf插件]b站解析:', e.msg);
        let bvid = ""
        if (e.msg.match(regAV)) {
            let table = 'fZodR9XQDSUm21yCkr6zBqiveYah8bt4xsWpHnJE7jL5VG3guMTKNPAwcF'
            let tr = {}
            for (let i = 0; i < 58; i++) { tr[table[i]] = i }
            const s = [11, 10, 3, 8, 4, 6]
            const xor = 177451812
            const add = 8728348608
            let x = (regAV.exec(e.msg))[0].replace(/av/g, "")
            x = (x ^ xor) + add
            const r = Array.from('BV1  4 1 7  ')
            for (let i = 0; i < 6; i++) {
                r[s[i]] = table[Math.floor(x / 58 ** i) % 58]
            }
            bvid = r.join("")
            if (!(bvid.match(regBV))) {
                return true
            }
        }
        if (e.msg.includes("点赞" && "投币")) { return false }
        if (e.msg.match(regB23)) {
            try {
                bvid = regBV.exec((await fetch("https://" + (regB23.exec(e.msg)[0]).replace(/\\/g, ""))).url)
                if (bvid == null) {
                    e.reply("解析失败", true)
                    return false
                }
            } catch (e) {
                e.reply("解析失败", true)
                return false
            }
        }
        if (e.msg.match(regBV)) {
            bvid = regBV.exec(e.msg)
        }
        let res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
            headers: {
                'referer': 'https://www.bilibili.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
            }
        })
        res = await res.json()
        if (res.code != 0) {
            e.reply("解析失败\n信息:" + res.message, true)
            return false
        } else {
            e.reply([segment.image(res.data.pic), `${res.data.title}\nhttps://www.bilibili.com/video/${bvid}\n作者: ${res.data.owner.name}\n播放: ${formatNumber(res.data.stat.view)} | 弹幕: ${formatNumber(res.data.stat.danmaku)}\n点赞: ${formatNumber(res.data.stat.like)} | 投币: ${formatNumber(res.data.stat.coin)}\n收藏: ${formatNumber(res.data.stat.favorite)} | 评论: ${formatNumber(res.data.stat.reply)}`], true)
        }
        res = await fetch(`https://api.bilibili.com/x/player/playurl?avid=${res.data.aid}&cid=${res.data.cid}&qn=16&type=mp4&platform=html5`, {
            headers: {
                'referer': 'https://www.bilibili.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
            }
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
                headers: {
                    'referer': 'https://www.bilibili.com/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
                }
            });

            if (headResponse.ok) {
                const contentLength = headResponse.headers.get('content-length');
                if (contentLength) {
                    const fileSizeBytes = parseInt(contentLength);
                    const fileSizeMB = fileSizeBytes / (1024 * 1024);
                    if (fileSizeMB > video_maxSizeMB) {
                        e.reply(`视频文件太大惹(${fileSizeMB.toFixed(1)}MB > ${video_maxSizeMB}MB)，人家不敢解析QAQ`, true);
                        return true;
                    }
                    logger.debug(`视频大小: ${fileSizeMB.toFixed(1)}MB，开始下载...`);
                }
            }
        } catch (sizeCheckError) {
            logger.info(`视频大小检查失败，将判断视频时长: ${sizeCheckError.message}`);
            if (res.data.duration > (10 * 60)) {
                e.reply(`视频时长 ${(res.data.duration / 60).toFixed(1)} 分钟，人家不敢解析QAQ`, true)
                return true;
            }
        }

        e.reply(segment.video(Buffer.from(await (await fetch(res.data.durl[0].url, {
            headers: {
                'referer': 'https://www.bilibili.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
            }
        })).arrayBuffer())))
        return true
    }


    async jxfj(e) {
        if (!turnOnBilitv)
            return false;
        logger.info('[sf插件]b站解析:', e.msg);
        let epid = ""
        let ssid = ""
        if (e.msg.includes("点赞" && "投币")) { return false }
        if (!(e.msg.match(regEP))) {
            if (e.msg.match(regMD)) {
                try {
                    let temp = await (await fetch(`https://api.bilibili.com/pgc/review/user?media_id=${(regMD.exec(e.msg))[0].replace("md", "")}`, {
                        headers: {
                            'referer': 'https://www.bilibili.com/',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
                        }
                    })).json()
                    if (temp.code != 0) {
                        e.reply("解析失败\n信息:" + temp.message, true)
                        return false
                    }
                    ssid = temp.result.media.season_id
                } catch (e) {
                    e.reply("解析失败", true)
                    return false
                }
            } else {
                ssid = (regSS.exec(e.msg))[0].replace("ss", "")
            }
            let temp = await (await fetch(`https://api.bilibili.com/pgc/web/season/section?season_id=${ssid}`, {
                headers: {
                    'referer': 'https://www.bilibili.com/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
                }
            })).json()
            if (temp.code != 0) {
                e.reply("解析失败\n信息:" + temp.message, true)
                return false
            }
            epid = (temp.result.main_section.episodes[0].share_url).replace("https://www.bilibili.com/bangumi/play/ep", "")
        } else {
            epid = (regEP.exec(e.msg))[0].replace("ep", "")
        }
        let res = await (await fetch(`https://api.bilibili.com/pgc/view/web/season?ep_id=${epid}`, {
            headers: {
                'referer': 'https://www.bilibili.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
            }
        })).json()
        if (res.code != 0) {
            e.reply("解析失败\n信息:" + res.message, true)
            return false
        }
        e.reply([
            segment.image(res.result.cover),
            `${res.result.title}\n评分: ${res.result.rating.score} / ${res.result.rating.count}\n${res.result.new_ep.desc}, ${res.result.seasons[0].new_ep.index_show}\n`,
            "---\n",
            `${res.result.link}\n播放: ${formatNumber(res.result.stat.views)} | 弹幕: ${formatNumber(res.result.stat.danmakus)}\n点赞: ${formatNumber(res.result.stat.likes)} | 投币: ${formatNumber(res.result.stat.coins)}\n追番: ${formatNumber(res.result.stat.favorites)} | 收藏: ${formatNumber(res.result.stat.favorite)}\n`
        ], true)
        return true
    }
}