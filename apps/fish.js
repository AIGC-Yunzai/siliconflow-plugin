import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import Config from '../components/Config.js'
import _ from 'lodash'
import common from '../../../lib/common/common.js';
import {
    readYaml,
    writeYaml,
} from '../utils/common.js'
import { pluginRoot } from "../model/path.js";

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
                    reg: '^#sf搜索fish发音人(.*)$',
                    fnc: 'searchFishVoices'
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
        const config = Config.getConfig()
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
            logger.info("[SF-FISH]正在生成音频")
            const response = await fetch('https://api.fish.audio/v1/tts', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${config.fish_apiKey}`,
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
        const config = Config.getConfig()

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
        let config = Config.getConfig()
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
            Config.setConfig(config)
            await e.reply(`已设置群 ${groupId} 对 QQ号 ${userId} 进行同传`)
        } else {
            await e.reply(`群 ${groupId} 已经对 QQ号 ${userId} 进行同传`)
        }
    }

    // 设置Fish API Key
    async setFishKey(e) {
        let config = Config.getConfig()
        const keyMatch = e.msg.match(/^#设置fish key\s*(.+)$/)
        if (keyMatch) {
            config.fish_apiKey = keyMatch[1].trim()
            Config.setConfig(config)
            await e.reply('Fish API Key 已更新')
        } else {
            await e.reply('设置失败，请确保输入了有效的 API Key')
        }
    }

    // 设置音色
    async setVoice(e) {
        let config = Config.getConfig()
        const voiceName = e.msg.replace(/^#设置(fish)?音色/, '').trim()
        let voice

        if (voiceName.length === 32 && /^[a-f0-9]+$/.test(voiceName)) {
            voice = getVoice(voiceName)
        } else {
            voice = getVoice(voiceName)
        }

        if (voice) {
            config.defaultVoice = voice.speaker
            Config.setConfig(config)
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
12. 设置翻译语言：#设置翻译语言 JA/EN (日语/英语)
13. 从Fish官网使用tag搜索发音人：#sf搜索fish发音人[tag]`

        await e.reply(helpMessage)
    }

    // 查看配置
    async viewConfig(e) {
        const config = Config.getConfig()
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
        configList.push(`可用指令：#删除fish同传[num]`)

        if (configList.length === 3) {
            await e.reply('当前没有配置任何同传')
        } else {
            await e.reply(['当前Fish同传配置：', ...configList].join('\n'))
        }
    }

    // 删除同传配置
    async deleteConfig(e) {
        let config = Config.getConfig()
        const match = e.msg.match(/^#删除fish同传(\d+)$/)
        if (!match) {
            await e.reply('指令格式错误，例子：#删除fish同传1')
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
            Config.setConfig(config)
            await e.reply(`已删除序号 ${index} 的同传配置`)
        } else {
            await e.reply(`未找到序号 ${index} 的同传配置`)
        }
    }

    // 查看音色列表
    async viewVoices(e) {
        const fishAudio_yaml = readYaml(`${pluginRoot}/config/config/fishAudio.yaml`)
        const voiceList = fishAudio_yaml.map(voice => `${voice.name} (${voice.speaker})`).join('\n')
        await e.reply(`可用的Fish音色列表：\n${voiceList}`)
    }

    // 搜索音色
    async searchVoices(e) {
        const keyword = e.msg.replace(/^#搜索fish音色/, '').trim().toLowerCase()
        const fishAudio_yaml = readYaml(`${pluginRoot}/config/config/fishAudio.yaml`)
        const matchedVoices = fishAudio_yaml.filter(voice =>
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
        let fishAudio_yaml = readYaml(`${pluginRoot}/config/config/fishAudio.yaml`)
        const match = e.msg.match(/^#fish添加音色\s*(.+?)\s*[,，]\s*(.+)$/)
        if (!match) {
            await e.reply('指令格式错误。正确格式：#fish添加音色音色名称,reference_id')
            return
        }

        const [, voiceName, voiceId] = match

        const existingVoice = fishAudio_yaml.find(v => v.name === voiceName || v.speaker === voiceId)
        if (existingVoice) {
            await e.reply('该音色名称或reference_id已存在，请使用不同的名称或id。')
            return
        }

        fishAudio_yaml.push({
            name: voiceName,
            speaker: voiceId
        })

        writeYaml(`${pluginRoot}/config/config/fishAudio.yaml`, fishAudio_yaml)
        await e.reply(`音色添加成功：${voiceName} (${voiceId})`)
    }

    // 开启或关闭翻译
    async toggleTranslation(e) {
        let config = Config.getConfig()
        const action = e.msg.includes('开启')
        config.enableTranslation = action
        Config.setConfig(config)
        await e.reply(`已${action ? '开启' : '关闭'}fish翻译功能`)
    }

    // 设置翻译语言
    async setTargetLang(e) {
        let config = Config.getConfig()
        let lang = e.msg.replace(/^#设置(fish)?翻译语言/, '').trim().toUpperCase()

        // 支持使用 "英语" 或 "日语"
        if (lang === '英语') lang = 'EN'
        else if (lang === '日语') lang = 'JA'

        if (!['JA', 'EN'].includes(lang)) {
            await e.reply('目标语言设置错误，仅支持 "日语" 或 "英语"')
            return
        }

        config.targetLang = lang
        Config.setConfig(config)
        await e.reply(`已将翻译目标语言设置为: ${lang === 'JA' ? '日语' : '英语'}`)
    }

    /**
     * @description: 从Fish官网使用tag搜索发音人：#sf搜索fish发音人[tag]
     * @param {*} e
     * @return {*}
     */
    async searchFishVoices(e) {
        // 读取配置
        const config_date = Config.getConfig()

        if (config_date.fish_apiKey.length == 0) {
            e.reply("请先在锅巴中设置fish.audio的Api Key", true);
            return
        }
        const keyword = e.msg.replace(/^#sf搜索fish发音人/, '').trim();

        const options = {
            method: 'GET',
            headers: { Authorization: `Bearer ${config_date.fish_apiKey}` }
        };

        let optionMsg = "可用指令：#sf设置fish发音人"
        let msgArr = [`Fish发音人列表 ${keyword}：`];
        await fetch(`https://api.fish.audio/model?tag=${encodeURIComponent(keyword)}`, options)
            .then(response => response.json())
            .then(response => {
                for (let index = 0; index < response.total; index++) {
                    if (0 == index) optionMsg += response.items[0]._id
                    msgArr.push(`名称：${response.items[index].title}\n发音人ID：${response.items[index]._id}`)
                }
            })
            .catch(err => logger.error(err));

        msgArr.push(optionMsg)
        const msgx = await common.makeForwardMsg(e, msgArr, `Fish发音人`)
        await e.reply(msgx);
    }


}

// 获取指定音色
function getVoice(value) {
    const fishAudio_yaml = readYaml(`${pluginRoot}/config/config/fishAudio.yaml`)
    if (value) {
        const selectedVoice = fishAudio_yaml.find(v => v.speaker === value || v.name === value)
        if (selectedVoice) {
            return selectedVoice
        }
    }
    return fishAudio_yaml[0]
}