import { FLUXDEV } from '../apps/main_key.js'
import _ from "lodash";
// 尺寸处理
function scaleParam(text) {
    const scale = {
        "竖图": { height: 1216, width: 832 },
        "长图": { height: 1216, width: 832 },
        "宽图": { height: 832, width: 1216 },
        "横图": { height: 832, width: 1216 },
        "方图": { height: 1024, width: 1024 }
    };

    let parameters = null;

    Object.entries(scale).forEach(([size, dimensions]) => {
        if (text.includes(size)) {
            parameters = { ...dimensions };
            text = text.replace(new RegExp(size, 'g'), '');
        }
    });
    let [width, height] = [1024, 1024]
    const result = /(\d{2,7})[\*×](\d{2,7})/.exec(text);
    if (result) {
        [width, height] = [Math.floor(Number(result[1]) / 64) * 64, Math.floor(Number(result[2]) / 64) * 64];

        const FLUXDEV_c = new FLUXDEV();
        const config_this = FLUXDEV_c.get_config_this()
        const maxArea = config_this.free_mode ? 3145728 : 1048576;

        while (width * height > maxArea && (width > 64 || height > 64)) {
            width -= width > 64 ? 64 : 0;
            height -= height > 64 ? 64 : 0;
        }

        parameters = { height, width };
        text = text.replace(/(\d{2,7})[\*×](\d{2,7})/g, '');
    }

    return { parameters, text };
}
function imgModelParam(text) {
    const samplers = {
        'FLUX.1-dev': 'black-forest-labs/FLUX.1-dev',
        'FLUX.1-schnell': 'Pro/black-forest-labs/FLUX.1-schnell',
        'FLUX.1-schnell': 'black-forest-labs/FLUX.1-schnell',
        'sd-turbo': 'stabilityai/sd-turbo',
        'sdxl-turbo': 'stabilityai/sdxl-turbo',
        'stable-diffusion-2-1': 'stabilityai/stable-diffusion-2-1',
        'stable-diffusion-3-medium': 'stabilityai/stable-diffusion-3-medium',
        'stable-diffusion-xl-base-1.0': 'stabilityai/stable-diffusion-xl-base-1.0',
    }
    const FLUXDEV_c = new FLUXDEV();
    const config_this = FLUXDEV_c.get_config_this()
    let parameters = { imageModel: config_this.imageModel }
    Object.entries(samplers).forEach(([alias, imageModel]) => {
        if (text.includes(alias)) {
            parameters.imageModel = imageModel
            text = text.replace(new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '')
        }
    })
    return { parameters, text }
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
    const FLUXDEV_c = new FLUXDEV();
    const config_this = FLUXDEV_c.get_config_this()
    const maxStep = config_this.free_mode ? 50 : 28
    parameters.steps = steps ? Math.min(Math.max(1, Number(steps)), maxStep) : config_this.num_inference_steps
    text = text.replace(/步数\s?\d+/g, '')
    return { parameters, text }
}


/**
 * @description: 处理prompt
 * @param {*} text
 * @param {*} e
 * @return {*}
 */
async function promptParam(text, e) {
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
export async function handleParam(e, text) {
    let parameters = {}
    let result = null

    // 尺寸处理
    result = scaleParam(text)
    parameters = Object.assign(parameters, result.parameters)
    text = result.text
    // 模型处理
    result = imgModelParam(text)
    parameters = Object.assign(parameters, result.parameters)
    text = result.text
    // 步数处理
    result = stepsParam(text)
    parameters = Object.assign(parameters, result.parameters)
    text = result.text
    // 种子处理
    result = seedParam(text)
    parameters = Object.assign(parameters, result.parameters)
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