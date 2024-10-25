import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Config from '../components/Config.js'
import YAML from 'yaml'
import _ from 'lodash'

// 确保路径
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fishDir = path.join(__dirname, '../data/fish')

// 确保fish目录存在
if (!fs.existsSync(fishDir)) {
    fs.mkdirSync(fishDir, { recursive: true })
}

// 获取配置的辅助函数
function getFishConfig() {
    let config = Config.getConfig()
    return {
        apiKey: config.fish_apiKey || '',
        defaultVoice: config.defaultVoice || '54a5170264694bfc8e9ad98df7bd89c3',
        enableTranslation: config.enableTranslation !== undefined ? config.enableTranslation : true,
        targetLang: config.targetLang || 'JA',
        syncConfig: config.syncConfig || {}
    }
}

// 保存配置的辅助函数
function saveFishConfig(fishConfig) {
    let config = Config.getConfig()
    config.fish_apiKey = fishConfig.apiKey
    config.defaultVoice = fishConfig.defaultVoice  
    config.enableTranslation = fishConfig.enableTranslation
    config.targetLang = fishConfig.targetLang
    config.syncConfig = fishConfig.syncConfig
    Config.setConfig(config)
}

// 音色文件路径
const fishAudioPath = path.join(fishDir, 'Fish-Audio.json')
let voices = []
if (fs.existsSync(fishAudioPath)) {
    const fishAudioContent = fs.readFileSync(fishAudioPath, 'utf8')
    voices = JSON.parse(fishAudioContent).space
} else {
    console.error('Fish-Audio.json not found in the specified directory')
}

// 获取指定音色
function getVoice(value) {
    if (value) {
        const selectedVoice = voices.find(v => v.speaker === value || v.name === value)
        if (selectedVoice) {
            return selectedVoice
        }
    }
    return voices[0]
}

export class FishPlugin extends plugin {
    constructor() {
        super({
            name: 'Fish TTS语音同传',
            dsc: '利用Fish TTS技术实现同声传译',
            event: 'message',
            priority: -101101,
            rule: [
                {
                    reg: '^#fish(\\d+)同传(\\d+)$',
                    fnc: 'configureSync',
                    permission: 'master'
                },
                {
                    reg: '^#设置fish key(.*)$',
                    fnc: 'setFishKey',
                    permission: 'master'
                },
                {
                    reg: '^#设置(fish)?音色(.*)$',
                    fnc: 'setVoice',
                    permission: 'master'
                },
                {
                    reg: '^#(fish)?同传帮助$',
                    fnc: 'showHelp'
                },
                {
                    reg: '^#(fish查看配置|查看fish配置)$',
                    fnc: 'viewConfig'
                },
                {
                    reg: '^#删除fish同传(\\d+)$',
                    fnc: 'deleteConfig',
                    permission: 'master'
                },
                {
                    reg: '^#查看fish音色$',
                    fnc: 'viewVoices'
                },
                {
                    reg: '^#搜索fish音色(.*)$',
                    fnc: 'searchVoices'
                },
                {
                    reg: '^#fish添加音色',
                    fnc: 'addVoice',
                    permission: 'master'
                },
                {
                    reg: '^#(开启|关闭)fish翻译$',
                    fnc: 'toggleTranslation',
                    permission: 'master'
                },
                {
                    reg: '^#设置(fish)?翻译语言(.*)$',
                    fnc: 'setTargetLang',
                    permission: 'master'
                },
                {
                    reg: '',
                    fnc: 'handleMessage',
                    log: false
                }
            ]
        })
        this.debouncedSyncTranslation = _.debounce(this.syncTranslation.bind(this), 1, { leading: true, trailing: false })
    }

    // 处理消息
    async handleMessage(e) {
        return this.debouncedSyncTranslation(e)
    }

    // 同传翻译
    async syncTranslation(e) {
        const config = getFishConfig()
        if (!e.group_id || !e.user_id) return false

        const groupId = e.group_id.toString()
        if (!config.syncConfig[groupId] || !config.syncConfig[groupId].includes(e.user_id)) {
            return false
        }

        const text = e.msg
        const selectedVoice = getVoice(config.defaultVoice)

        try {
            const audioBuffer = await this.generateAudio(text, selectedVoice.speaker, config)
            if (audioBuffer) {
                const audioBase64 = audioBuffer.toString('base64')
                const audioSegment = segment.record(`base64://${audioBase64}`)
                await e.reply(audioSegment)
                return true
            }
        } catch (error) {
            console.error('同传 TTS 失败:', error)
        }

        return false
    }

    // 生成音频
    async generateAudio(text, voiceId, config) {
        let translatedText = text
        if (config.enableTranslation) {
            translatedText = await this.translateText(text)
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 20000)

        try {
            const response = await fetch('https://api.fish.audio/v1/tts', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: translatedText,
                    reference_id: voiceId,
                    format: 'mp3',
                    latency: 'normal'
                }),
                signal: controller.signal
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                throw new Error(`无法从服务器获取音频数据：${response.statusText}`)
            }

            return Buffer.from(await response.arrayBuffer())
        } catch (error) {
            console.error('生成音频失败:', error)
            return null
        }
    }

    // 翻译文本
    async translateText(text) {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)
        const config = getFishConfig()

        try {
            const response = await fetch("https://deeplx.mingming.dev/translate", {
                method: 'POST',
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    "text": text,
                    "source_lang": "auto",
                    "target_lang": config.targetLang,
                    "quality": "normal"
                }),
                signal: controller.signal
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                throw new Error('翻译失败: ' + response.statusText)
            }

            const result = await response.json()
            return result.data
        } catch (error) {
            console.error('翻译失败:', error)
            return text
        }
    }

    // 配置同传
    async configureSync(e) {
        const config = getFishConfig()
        const match = e.msg.match(/^#fish(\d+)同传(\d+)$/)
        if (!match) {
            await e.reply('指令格式错误，正确格式为：#fish群号同传QQ号')
            return
        }

        const [, groupId, userId] = match
        
        if (!config.syncConfig[groupId]) {
            config.syncConfig[groupId] = []
        }
        
        if (!config.syncConfig[groupId].includes(Number(userId))) {
            config.syncConfig[groupId].push(Number(userId))
            saveFishConfig(config)
            await e.reply(`已设置群 ${groupId} 对 QQ号 ${userId} 进行同传`)
        } else {
            await e.reply(`群 ${groupId} 已经对 QQ号 ${userId} 进行同传`)
        }
    }

    // 设置Fish API Key
    async setFishKey(e) {
        const config = getFishConfig()
        const keyMatch = e.msg.match(/^#设置fish key\s*(.+)$/)
        if (keyMatch) {
            config.apiKey = keyMatch[1].trim()
            saveFishConfig(config)
            await e.reply('Fish API Key 已更新')
        } else {
            await e.reply('设置失败，请确保输入了有效的 API Key')
        }
    }

    // 设置音色
    async setVoice(e) {
        const config = getFishConfig()
        const voiceName = e.msg.replace(/^#设置(fish)?音色/, '').trim()
        let voice

        if (voiceName.length === 32 && /^[a-f0-9]+$/.test(voiceName)) {
            voice = getVoice(voiceName)
        } else {
            voice = getVoice(voiceName)
        }

        if (voice) {
            config.defaultVoice = voice.speaker
            saveFishConfig(config)
            await e.reply(`默认音色已设置为: ${voice.name}`)
        } else {
            await e.reply('未找到指定的音色，请检查名称或reference_id是否正确')
        }
    }

    // 显示帮助信息
    async showHelp(e) {
        const helpMessage = `Fish同传插件使用帮助：
1. 设置同传：#fish群号同传QQ号
   例：#fish56789同传12345
2. 设置API Key：#设置fish key 你的API密钥
3. 设置音色：#设置fish音色 音色名称 或 #设置fish音色 reference_id
4. 查看帮助：#同传帮助 或 #fish同传帮助
5. 查看当前配置：#fish查看配置 或 #查看fish配置
6. 删除同传配置：#删除fish同传序号
7. 查看音色列表：#查看fish音色
8. 搜索音色：#搜索fish音色 关键词
9. 添加新音色：#fish添加音色音色名称,reference_id
10. 开启翻译功能：#开启fish翻译
11. 关闭翻译功能：#关闭fish翻译
12. 设置翻译语言：#设置翻译语言 JA/EN (日语/英语)`

        await e.reply(helpMessage)
    }

    // 查看配置
    async viewConfig(e) {
        const config = getFishConfig()
        let configList = []
        let index = 1

        if (config.syncConfig) {
            for (const [groupId, userIds] of Object.entries(config.syncConfig)) {
                for (const userId of userIds) {
                    configList.push(`${index}. 群号: ${groupId}, QQ号: ${userId}`)
                    index++
                }
            }
        }

        const currentVoice = getVoice(config.defaultVoice)
        configList.push(`当前音色: ${currentVoice.name} (${currentVoice.speaker})`)
        configList.push(`翻译功能: ${config.enableTranslation ? '开启' : '关闭'}`)
        configList.push(`翻译语言: ${config.targetLang === 'JA' ? '日语' : '英语'}`)

        if (configList.length === 3) {
            await e.reply('当前没有配置任何同传')
        } else {
            await e.reply(['当前Fish同传配置：', ...configList].join('\n'))
        }
    }

    // 删除同传配置
    async deleteConfig(e) {
        const config = getFishConfig()
        const match = e.msg.match(/^#删除fish同传(\d+)$/)
        if (!match) {
            await e.reply('指令格式错误，正确格式为：#删除fish同传序号')
            return
        }

        const index = parseInt(match[1])
        let currentIndex = 1
        let deleted = false

        if (config.syncConfig) {
            for (const [groupId, userIds] of Object.entries(config.syncConfig)) {
                for (let i = 0; i < userIds.length; i++) {
                    if (currentIndex === index) {
                        userIds.splice(i, 1)
                        if (userIds.length === 0) {
                            delete config.syncConfig[groupId]
                        }
                        deleted = true
                        break
                    }
                    currentIndex++
                }
                if (deleted) break
            }
        }

        if (deleted) {
            saveFishConfig(config)
            await e.reply(`已删除序号 ${index} 的同传配置`)
        } else {
            await e.reply(`未找到序号 ${index} 的同传配置`)
        }
    }

    // 查看音色列表
    async viewVoices(e) {
        const voiceList = voices.map(voice => `${voice.name} (${voice.speaker})`).join('\n')
        await e.reply(`可用的Fish音色列表：\n${voiceList}`)
    }

    // 搜索音色
    async searchVoices(e) {
        const keyword = e.msg.replace(/^#搜索fish音色/, '').trim().toLowerCase()
        const matchedVoices = voices.filter(voice => 
            voice.name.toLowerCase().includes(keyword) || 
            voice.speaker.toLowerCase().includes(keyword)
        )

        if (matchedVoices.length === 0) {
            await e.reply('没有找到匹配的音色')
            return
        }

        const voiceList = matchedVoices.map(voice => `${voice.name} (${voice.speaker})`).join('\n')
        await e.reply(`搜索结果：\n${voiceList}`)
    }

   // 添加音色
   async addVoice(e) {
       const match = e.msg.match(/^#fish添加音色\s*(.+?)\s*[,，]\s*(.+)$/)
       if (!match) {
           await e.reply('指令格式错误。正确格式：#fish添加音色音色名称,reference_id')
           return
       }

       const [, voiceName, voiceId] = match

       const existingVoice = voices.find(v => v.name === voiceName || v.speaker === voiceId)
       if (existingVoice) {
           await e.reply('该音色名称或reference_id已存在，请使用不同的名称或id。')
           return
       }

       voices.push({
           name: voiceName,
           speaker: voiceId
       })

       fs.writeFileSync(fishAudioPath, JSON.stringify({ space: voices }, null, 2))
       await e.reply(`音色添加成功：${voiceName} (${voiceId})`)
   }

   // 开启或关闭翻译
   async toggleTranslation(e) {
       const config = getFishConfig()
       const action = e.msg.includes('开启')
       config.enableTranslation = action
       saveFishConfig(config)
       await e.reply(`已${action ? '开启' : '关闭'}fish翻译功能`)
   }

    // 设置翻译语言
    async setTargetLang(e) {
        const config = getFishConfig()
        let lang = e.msg.replace(/^#设置(fish)?翻译语言/, '').trim().toUpperCase()
    
        // 支持使用 "英语" 或 "日语"
        if (lang === '英语') lang = 'EN'
        else if (lang === '日语') lang = 'JA'
    
        if (!['JA', 'EN'].includes(lang)) {
            await e.reply('目标语言设置错误，仅支持 "日语" 或 "英语"')
            return
        }
    
        config.targetLang = lang
        saveFishConfig(config)
        await e.reply(`已将翻译目标语言设置为: ${lang === 'JA' ? '日语' : '英语'}`)
    }
}
