import _ from "lodash";

// 尺寸处理
function scaleParam(text) {
    const scale = {
        "竖图": { ratio: "9:16" },
        "长图": { ratio: "9:16" },
        "宽图": { ratio: "16:9" },
        "横图": { ratio: "16:9" },
        "方图": { ratio: "1:1" },

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
    if (!text || typeof text !== 'string') {
        text = '';
    }

    let parameters = {}
    let result, model

    // 尺寸处理
    result = scaleParam(text)
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