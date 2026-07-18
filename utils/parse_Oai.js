import _ from "lodash";
import Config from '../components/Config.js'

// 尺寸处理
function ratioParam(text) {
    const scale = {
        // #d 不解析中文画幅词，避免它们出现在正常提示词中时被误删。
        // "竖图": { ratio: "9:16" },
        // "长图": { ratio: "9:16" },
        // "宽图": { ratio: "16:9" },
        // "横图": { ratio: "16:9" },
        // "方图": { ratio: "1:1" },

        "--1:1": { ratio: "1:1" },
        "--4:3": { ratio: "4:3" },
        "--3:4": { ratio: "3:4" },
        "--16:9": { ratio: "16:9" },
        "--9:16": { ratio: "9:16" },
        "--3:2": { ratio: "3:2" },
        "--2:3": { ratio: "2:3" },
        "--21:9": { ratio: "21:9" },

        "--1：1": { ratio: "1:1" },
        "--4：3": { ratio: "4:3" },
        "--3：4": { ratio: "3:4" },
        "--16：9": { ratio: "16:9" },
        "--9：16": { ratio: "9:16" },
        "--3：2": { ratio: "3:2" },
        "--2：3": { ratio: "2:3" },
        "--21：9": { ratio: "21:9" },
    };

    let parameters = { ratio: "1:1" };

    Object.entries(scale).forEach(([size, dimensions]) => {
        if (text.includes(size)) {
            parameters = { ...dimensions };
            text = text.replace(new RegExp(size, 'g'), '');
        }
    });

    return { parameters, text };
}

function scaleParam(text, e) {
    let parameters = {};
    const result = /(\d{2,7})[\*×](\d{2,7})/.exec(text);
    if (result) {
        let [width, height] = [Number(result[1]), Number(result[2])];
        // dd_parse_Oai 不同于 sd 不需要限制 64 的倍数
        // let [width, height] = [Math.floor(Number(result[1]) / 64) * 64, Math.floor(Number(result[2]) / 64) * 64];

        // 限制最大画图分辨率4k // 暂时不做主人限制
        const maxArea = e?.dd_parse_Oai?.maxArea ?? 1048576;

        while (width * height > maxArea && (width > 64 || height > 64)) {
            width -= width > 64 ? 64 : 0;
            height -= height > 64 ? 64 : 0;
        }

        parameters = { height, width };
        // 只在支持 scaleParam 参数时 replace
        if (e?.dd_parse_Oai?.useScaleParam)
            text = text.replace(/(\d{2,7})[\*×](\d{2,7})/g, '');
    }

    return { parameters, text };
}

function seedParam(text) {
    let parameters = {}
    let seed = text.match(/seed(\s)?=\s?(\d+)/)?.[2]
    if (seed) {
        parameters.seed = Number(seed.substring(0, 10))
        text = text.replace(/seed(\s)?=\s?(\d+)/g, '')
    } else {
        parameters.seed = Math.floor((Math.random() + Math.floor(Math.random() * 9 + 1)) * Math.pow(10, 9))
    }
    return { parameters, text }
}
function stepsParam(text) {
    let parameters = {}
    let steps = text.match(/步数\s?(\d+)/)?.[1]
    const maxStep = 50
    parameters.steps = steps ? Math.min(Math.max(1, Number(steps)), maxStep) : 30
    text = text.replace(/步数\s?\d+/g, '')
    return { parameters, text }
}
function isGeneratePrompt(text, e) {
    // 确保text是字符串
    if (!text || typeof text !== 'string') {
        return { parameters: {}, text: text || '' };
    }

    let parameters = {}
    let generatePrompt = text.match(/--自?动?提示词(开|关)/)?.[1]
    if (generatePrompt && e?.sfRuntime) {
        e.sfRuntime.isgeneratePrompt = generatePrompt === '开'
    }
    text = text.replace(/--自?动?提示词(开|关)/g, '')
    return { parameters, text }
}
function video_durationParam(text) {
    const duration = {
        "--5秒": { video_duration: 5 },
        "--10秒": { video_duration: 10 },
    };

    let parameters = {};

    Object.entries(duration).forEach(([size, duration]) => {
        if (text.includes(size)) {
            parameters = { ...duration };
            text = text.replace(new RegExp(size, 'g'), '');
        }
    });

    return { parameters, text };
}
/** 参考图片数量 */
function callGetImgs(text) {
    let parameters = {}
    let upimgs = text.match(/(--)?(upimgs)\s?=?\s?([-+]?\d+(\.)?(\d+)?)/i)?.[3]
    if (upimgs) {
        parameters.upimgs = parseInt(Number(upimgs))
        if (parameters.upimgs < 1) parameters.upimgs = 0
        if (parameters.upimgs > 2) parameters.upimgs = 2
        text = text.replace(/(--)?(upimgs)\s?=?\s?([-+]?\d+(\.)?(\d+)?)/ig, '')
    }
    return { parameters, text }
}

function chineseNumberToNumber(chineseNumber) {
    if (!chineseNumber || typeof chineseNumber !== 'string') return NaN

    const numberMap = {
        '零': 0,
        '一': 1,
        '二': 2,
        '两': 2,
        '三': 3,
        '四': 4,
        '五': 5,
        '六': 6,
        '七': 7,
        '八': 8,
        '九': 9,
        '壹': 1,
        '贰': 2,
        '叁': 3,
        '肆': 4,
        '伍': 5,
        '陆': 6,
        '柒': 7,
        '捌': 8,
        '玖': 9,
    }
    const unitMap = {
        '十': 10,
        '拾': 10,
        '百': 100,
        '佰': 100,
        '千': 1000,
        '仟': 1000,
        '万': 10000,
    }

    let section = 0
    let number = 0
    let total = 0

    for (const char of chineseNumber) {
        if (numberMap[char] !== undefined) {
            number = numberMap[char]
            continue
        }

        const unit = unitMap[char]
        if (!unit) return NaN

        if (unit === 10000) {
            total += (section + number) * unit
            section = 0
        } else {
            section += (number || 1) * unit
        }
        number = 0
    }

    return total + section + number
}

/** 生成图片数量：只提取参数，不从提示词中删除“n张” */
function picNumParam(text, e) {
    let parameters = {}
    const maxN = e?.dd_parse_Oai?.maxN ?? 10
    const match = text.match(/(\d{1,5}|[一二三四五六七八九十零百千万壹贰两叁肆伍陆柒捌玖拾佰仟]+)\s*张/)

    if (match) {
        const rawNum = match[1]
        let n = /^\d+$/.test(rawNum) ? Number(rawNum) : chineseNumberToNumber(rawNum)
        if (!Number.isNaN(n)) {
            n = parseInt(Number(n))
            parameters.n = Math.min(Math.max(1, n), maxN)
            // text = text.replace(/(\d{1,5}|[一二三四五六七八九十零百千万壹贰两叁肆伍陆柒捌玖拾佰仟]+)\s*张/ig, '')
        }
    }

    return { parameters, text }
}

/**
 * @description: 高级传参方法
 * @param {string} text
 * @return {object}
 */
function advancedParam(text) {
    const parameters = {};
    let model = undefined
    const regex = /(?:\s+)?--([a-zA-Z0-9_\.]+)\s+([^\s]+)/g;
    const KEY_MAP = { w: 'width', h: 'height', sa: 'sampler', st: 'steps', g: 'scale', gr: 'cfg_rescale', ns: 'noise_schedule' };
    const BLOCKED_PARAMS = ['nothing_BLOCKED'];

    text = text.replace(regex, (match, key, value) => {
        const originalKey = key;
        key = KEY_MAP[key] || key;

        if (key === 'model') {
            model = value.trim();
            return '';
        }

        if (BLOCKED_PARAMS.includes(originalKey) || BLOCKED_PARAMS.includes(key)) {
            return '';
        }

        const keys = key.split('.');
        let current = parameters;

        for (let i = 0; i < keys.length - 1; i++) {
            const part = keys[i];
            current[part] = current[part] || {};
            current = current[part];
        }

        let finalValue = value.trim();
        if (finalValue === 'true' || finalValue === 'false') {
            finalValue = finalValue === 'true' ? true : false;
        } else if (!isNaN(Number(finalValue))) {
            finalValue = Number(finalValue);
        }

        current[keys[keys.length - 1]] = finalValue;

        return '';
    });

    return { model, parameters, text };
}

/**
 * @description: 处理prompt
 * @param {*} text
 * @param {*} e
 * @return {*}
 */
async function promptParam(text) {
    let parameters = {}
    let input = ''
    let ntags = text.match(/ntags(\s)?=(.*)$/s)?.[2]
    if (ntags) {
        input = text.replace(/ntags(\s)?=(.*)$/s, '')
    } else {
        input = text
    }
    if (ntags) {
        parameters.negative_prompt = ntags
    }
    return (input === '') ? { parameters } : { parameters, input }
}

/**
 * @description: 处理画图参数 for Jimeng
 * @param {*} e
 * @param {*} text
 * @return {*} { parameters, input }
 */
export async function handleParam(e, text) {
    if (!e) {
        throw new Error('参数e不能为空');
    }
    // e.sfRuntime ??= {};
    // if (!e.sfRuntime.config) {
    //     e.sfRuntime.config = Config.getConfig();
    // }
    if (!text || typeof text !== 'string') {
        text = '';
    }

    let parameters = {}
    let result, model

    // 尺寸处理
    result = ratioParam(text)
    parameters = Object.assign(parameters, result.parameters)
    text = result.text
    result = scaleParam(text, e)
    parameters = Object.assign(parameters, result.parameters)
    text = result.text
    // // 步数处理
    // result = stepsParam(text)
    // parameters = Object.assign(parameters, result.parameters)
    // text = result.text
    // // 种子处理
    // result = seedParam(text)
    // parameters = Object.assign(parameters, result.parameters)
    // text = result.text
    // 视频时长
    // result = video_durationParam(text)
    // parameters = Object.assign(parameters, result.parameters)
    // text = result.text
    // // 上传图片数量
    // result = callGetImgs(text)
    // parameters = Object.assign(parameters, result.parameters)
    // text = result.text
    // 自动提示词处理
    result = isGeneratePrompt(text, e)
    text = result.text
    // 生成图片数量
    result = picNumParam(text, e)
    parameters = Object.assign(parameters, result.parameters)
    text = result.text
    // 高级传参
    result = advancedParam(text)
    model = result.model
    parameters = Object.assign(parameters, result.parameters)
    text = result.text

    // 正负词条处理
    try {
        result = await promptParam(text)
    } catch (error) {
        throw error
    }
    parameters = Object.assign(parameters, result.parameters)
    let input = result.input || undefined
    return { parameters, input, model }
}
