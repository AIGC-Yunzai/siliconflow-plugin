/**
 * 应用预设到文本中
 * @param {string} text - 原始输入文本
 * @param {object} config - 配置对象,包含 presets 数组
 * @param {Array} config.presets - 预设数组,每个预设包含 name 和 prompt
 * @returns {object} 返回对象包含:
 *   - processedText: 处理后的文本(预设名替换为预设文本)
 *   - usedPresets: 使用过的预设数组 [{name, prompt}]
 *   - replaceDisplay: 替换显示文本的方法(text) => displayText
 */
export function applyPresets(text, config) {
    if (!text || typeof text !== 'string') {
        return {
            processedText: text || '',
            usedPresets: [],
            replaceDisplay: (text) => text || ''
        }
    }

    const presets = config?.presets || []
    if (!Array.isArray(presets) || presets.length === 0) {
        return {
            processedText: text,
            usedPresets: [],
            replaceDisplay: (text) => text || ''
        }
    }

    let processedText = text
    const usedPresets = []

    // 遍历所有预设,查找并替换
    for (const preset of presets) {
        if (!preset.name || !preset.prompt) {
            continue
        }

        const presetName = preset.name.trim()
        const presetPrompt = preset.prompt.trim()

        // 检查文本中是否包含预设名(支持多种分隔符)
        const regex = new RegExp(`\\b${escapeRegExp(presetName)}\\b`, 'gi')

        if (regex.test(processedText)) {
            // 记录使用的预设
            if (!usedPresets.some(p => p.name === presetName)) {
                usedPresets.push({
                    name: presetName,
                    prompt: presetPrompt
                })
            }

            // 替换预设名为预设文本(用于API请求)
            processedText = processedText.replace(regex, presetPrompt)
        }
    }

    // 返回替换显示文本的方法
    const replaceDisplay = (text) => {
        if (!text || usedPresets.length === 0) {
            return text || ''
        }
        let displayText = text
        for (const preset of usedPresets) {
            const displayRegex = new RegExp(escapeRegExp(preset.prompt), 'gi')
            displayText = displayText.replace(displayRegex, `{预设${preset.name}}`)
        }
        return displayText
    }

    return {
        processedText: processedText.trim(),
        usedPresets,
        replaceDisplay
    }
}

/**
 * 转义正则表达式特殊字符
 * @param {string} string - 需要转义的字符串
 * @returns {string} 转义后的字符串
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 生成预设使用说明
 * @param {Array} usedPresets - 使用过的预设数组
 * @returns {string} 预设使用说明文本
 */
export function generatePresetInfo(usedPresets) {
    if (!Array.isArray(usedPresets) || usedPresets.length === 0) {
        return ''
    }

    const presetNames = usedPresets.map(p => p.name).join('、')
    return `\n使用预设：${presetNames}`
}