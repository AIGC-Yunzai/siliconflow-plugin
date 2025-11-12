/**
 * 应用预设到文本中
 * @param {string} text - 原始输入文本
 * @param {object} config - 配置对象,包含 presets 数组
 * @param {Array} config.presets - 预设数组,每个预设包含 name 和 prompt
 * @returns {object} 返回对象包含:
 *   - processedText: 处理后的文本(预设名替换为预设文本)
 *   - usedPresets: 使用过的预设数组 [{name, prompt}]
 *   - originalText: 原始文本
 */
export function applyPresets(text, config) {
    let originalText = text || '';
    if (!text || typeof text !== 'string') {
        return {
            processedText: text || '',
            usedPresets: [],
            originalText
        }
    }

    const presets = config?.presets || []
    if (!Array.isArray(presets) || presets.length === 0) {
        return {
            processedText: text,
            usedPresets: [],
            originalText
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

        // 1. 检查文本中是否包含预设名(支持中文和英文) 2. 使用非贪婪匹配，确保精确匹配预设名
        const regex = new RegExp(escapeRegExp(presetName), 'gi')

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

            // 标记使用的预设
            originalText = originalText.replace(regex, `{sf预设: ${presetName}}`)
        }
    }

    return {
        processedText: processedText.trim(),
        usedPresets,
        originalText
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