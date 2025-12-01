import _ from "lodash";

// 尺寸处理
function scaleParam(text, e) {
    // 确保text是字符串
    if (!text || typeof text !== 'string') {
        return { parameters: { height: 1024, width: 1024 }, text: text || '' };
    }

    const scale = {
        "竖图": { height: 1216, width: 832 },
        "长图": { height: 1216, width: 832 },
        "宽图": { height: 832, width: 1216 },
        "横图": { height: 832, width: 1216 },
        "方图": { height: 1024, width: 1024 },

        "--1:1": { height: 1024, width: 1024 },
        "--16:9": { height: 832, width: 1216 },
        "--9:16": { height: 1216, width: 832 },

        "--1：1": { height: 1024, width: 1024 },
        "--16：9": { height: 832, width: 1216 },
        "--9：16": { height: 1216, width: 832 },
    };

    let parameters = { height: 1024, width: 1024 };

    Object.entries(scale).forEach(([size, dimensions]) => {
        if (text.includes(size)) {
            parameters = { ...dimensions };
            text = text.replace(new RegExp(size, 'g'), '');
        }
    });
    const result = /(\d{2,7})[\*×](\d{2,7})/.exec(text);
    if (result) {
        let [width, height] = [Math.floor(Number(result[1]) / 64) * 64, Math.floor(Number(result[2]) / 64) * 64];

        const maxArea = e.sfRuntime.config.free_mode ? 3145728 : 1048576;

        while (width * height > maxArea && (width > 64 || height > 64)) {
            width -= width > 64 ? 64 : 0;
            height -= height > 64 ? 64 : 0;
        }

        parameters = { height: height, width: width };
        text = text.replace(/(\d{2,7})[\*×](\d{2,7})/g, '');
    }

    return { parameters, text };
}
function imgModelParam(text, e) {
    // 确保text是字符串
    if (!text || typeof text !== 'string') {
        return { parameters: { imageModel: e?.sfRuntime?.config?.imageModel || 'stabilityai/stable-diffusion-xl-base-1.0' }, text: text || '' };
    }

    const samplers = {
        // 注释掉 非免费的
        // 'FLUX.1-dev': 'black-forest-labs/FLUX.1-dev',
        // 'FLUX.1-schnell': 'Pro/black-forest-labs/FLUX.1-schnell',
        'FLUX.1-schnell': 'black-forest-labs/FLUX.1-schnell',
        'sd-turbo': 'stabilityai/sd-turbo',
        'sdxl-turbo': 'stabilityai/sdxl-turbo',
        'stable-diffusion-2-1': 'stabilityai/stable-diffusion-2-1',
        'stable-diffusion-3-medium': 'stabilityai/stable-diffusion-3-medium',
        'stable-diffusion-xl-base-1.0': 'stabilityai/stable-diffusion-xl-base-1.0',
    }
    let parameters = { imageModel: e?.sfRuntime?.config?.imageModel || 'stabilityai/stable-diffusion-xl-base-1.0' }
    Object.entries(samplers).forEach(([alias, imageModel]) => {
        if (text.includes(alias)) {
            parameters.imageModel = imageModel
            text = text.replace(new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '')
        }
    })
    return { parameters, text }
}
function seedParam(text) {
    // 确保text是字符串
    if (!text || typeof text !== 'string') {
        return { parameters: { seed: Math.floor((Math.random() + Math.floor(Math.random() * 9 + 1)) * Math.pow(10, 9)) }, text: text || '' };
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
function stepsParam(text, e) {
    // 确保text是字符串
    if (!text || typeof text !== 'string') {
        return { parameters: { steps: e?.sfRuntime?.config?.num_inference_steps || 28 }, text: text || '' };
    }

    let parameters = {}
    let steps = text.match(/步数\s?(\d+)/)?.[1]
    // 安全地访问 e.sfRuntime.config
    const maxStep = e?.sfRuntime?.config?.free_mode ? 50 : 28
    parameters.steps = steps ? Math.min(Math.max(1, Number(steps)), maxStep) : (e?.sfRuntime?.config?.num_inference_steps || 28)
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

/** 参考图片数量 */
function callGetImgs(text) {
    let parameters = {}
    let upimgs = text.match(/(--)?(upimgs)\s?=?\s?([-+]?\d+(\.)?(\d+)?)/i)?.[3]
    if (upimgs) {
        parameters.upimgs = parseInt(Number(upimgs))
        if (parameters.upimgs < 1) parameters.upimgs = 0
        if (parameters.upimgs > 5) parameters.upimgs = 5
        text = text.replace(/(--)?(upimgs)\s?=?\s?([-+]?\d+(\.)?(\d+)?)/ig, '')
    }
    return { parameters, text }
}

/**
 * @description: 处理prompt
 * @param {*} text
 * @param {*} e
 * @return {*}
 */
async function promptParam(text, e) {
    // 确保text是字符串
    if (!text || typeof text !== 'string') {
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
 * @description: 处理画图参数
 * @param {*} e
 * @param {*} text
 * @return {*} { parameters, input }
 */
export async function handleParam(e, text, skipImgModel = false) {
    // 确保e和text参数存在
    if (!e) {
        throw new Error('参数e不能为空');
    }

    // 确保text是字符串
    if (!text || typeof text !== 'string') {
        text = '';
    }

    let parameters = {}
    let result = null

    // 尺寸处理
    result = scaleParam(text, e)
    parameters = Object.assign(parameters, result.parameters)
    text = result.text
    // 模型处理
    if (!skipImgModel) {
        result = imgModelParam(text, e)
        parameters = Object.assign(parameters, result.parameters)
        text = result.text
    }
    // 步数处理
    result = stepsParam(text, e)
    parameters = Object.assign(parameters, result.parameters)
    text = result.text
    // 种子处理
    result = seedParam(text)
    parameters = Object.assign(parameters, result.parameters)
    text = result.text
    // 上传图片数量
    result = callGetImgs(text)
    parameters = Object.assign(parameters, result.parameters)
    text = result.text
    // 自动提示词处理
    result = isGeneratePrompt(text, e)
    text = result.text

    // 正负词条处理
    try {
        result = await promptParam(text, e)
    } catch (error) {
        throw error
    }
    parameters = Object.assign(parameters, result.parameters)
    let input = result.input || undefined
    return { parameters, input }
}