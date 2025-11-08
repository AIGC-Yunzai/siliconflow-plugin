import _ from "lodash";

// 尺寸处理
function scaleParam(text) {
    if (!text) {
        return { parameters: { ratio: "1:1" }, text: "" };
    }
    const scale = {
        "竖图": { ratio: "9:16" },
        "长图": { ratio: "9:16" },
        "宽图": { ratio: "16:9" },
        "横图": { ratio: "16:9" },
        "方图": { ratio: "1:1" },

        "1:1": { ratio: "1:1" },
        "4:3": { ratio: "4:3" },
        "3:4": { ratio: "3:4" },
        "16:9": { ratio: "16:9" },
        "9:16": { ratio: "9:16" },
        "3:2": { ratio: "3:2" },
        "2:3": { ratio: "2:3" },
        "21:9": { ratio: "21:9" },

        "1：1": { ratio: "1:1" },
        "4：3": { ratio: "4:3" },
        "3：4": { ratio: "3:4" },
        "16：9": { ratio: "16:9" },
        "9：16": { ratio: "9:16" },
        "3：2": { ratio: "3:2" },
        "2：3": { ratio: "2:3" },
        "21：9": { ratio: "21:9" },
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
    if (!text) {
        return { parameters: { seed: Math.floor((Math.random() + Math.floor(Math.random() * 9 + 1)) * Math.pow(10, 9)) }, text: "" };
    }

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
    if (!text) {
        return { parameters: { steps: 28 }, text: "" };
    }
    let parameters = {}
    let steps = text.match(/步数\s?(\d+)/)?.[1]
    const maxStep = 50
    parameters.steps = steps ? Math.min(Math.max(1, Number(steps)), maxStep) : 30
    text = text.replace(/步数\s?\d+/g, '')
    return { parameters, text }
}

/**
 * @description: 处理prompt
 * @param {*} text
 * @param {*} e
 * @return {*}
 */
async function promptParam(text) {
    if (!text) {
        return { parameters: { prompt: '', negative_prompt: '' }, text: '', input: '' };
    }

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
    let result = null

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

    // 正负词条处理
    try {
        result = await promptParam(text)
    } catch (error) {
        throw error
    }
    parameters = Object.assign(parameters, result.parameters)
    let input = result.input || undefined
    return { parameters, input }
}