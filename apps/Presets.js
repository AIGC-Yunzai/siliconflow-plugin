import plugin from '../../../lib/plugins/plugin.js'
import Config from '../components/Config.js'

export class Jimeng extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'sf插件-绘画预设',
            /** 功能描述 */
            dsc: '绘画预设',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 1011,
            rule: [
                {
                    /** 命令正则匹配 */
                    reg: '^#sf预设列表',
                    /** 执行方法 */
                    fnc: 'showPresetsList'
                },
                {
                    reg: '^#sf预设(添加|删除|查看)',
                    fnc: 'managePresetsList',
                    permission: 'master'
                },
            ]
        })
        this.helpMsg = `\n可用指令：\n #sf预设列表 #sf预设[添加|删除|查看]`
    }

    async showPresetsList(e) {
        const presets_config = Config.getConfig("presets")

        if (!presets_config.presets || presets_config.presets.length === 0) {
            await e.reply("暂无预设列表" + this.helpMsg, true)
            return
        }

        const presetNames = presets_config.presets.map((preset, index) => {
            return `${index + 1}. ${preset.name}`
        }).join('\n')

        const message = `当前预设列表：\n${presetNames}`
        e.reply(message + this.helpMsg, true)
    }

    async managePresetsList(e) {
        const presets_config = Config.getConfig("presets")
        const action = e.msg.match(/^#sf预设(添加|删除|查看)/)[1]

        if (action === '查看') {
            if (!presets_config.presets || presets_config.presets.length === 0) {
                await e.reply("暂无预设列表" + this.helpMsg, true)
                return
            }

            // 获取要查看的预设名称或序号
            let viewTarget = e.msg.replace(/^#sf预设查看/, '').trim()

            if (!viewTarget) {
                // 显示预设列表
                const presetList = presets_config.presets.map((preset, index) => {
                    return `${index + 1}. ${preset.name}`
                }).join('\n')
                await e.reply(`请在120秒内发送要查看的预设名称或序号：\n${presetList}`, true, { recallMsg: 119 })
                const e_view = await this.awaitContext()
                if (!e_view || !e_view.msg) {
                    await e.reply('[sf预设查看]操作已取消', true)
                    return
                }
                viewTarget = e_view.msg.trim()
                if (!viewTarget) {
                    await e.reply('[sf预设查看]输入不能为空，操作已取消', true)
                    return
                }
            }

            // 判断是序号还是名称
            let viewIndex = -1
            const targetNumber = parseInt(viewTarget)
            if (!isNaN(targetNumber) && targetNumber > 0 && targetNumber <= presets_config.presets.length) {
                viewIndex = targetNumber - 1
            } else {
                viewIndex = presets_config.presets.findIndex(p => p.name === viewTarget)
            }

            if (viewIndex === -1) {
                await e.reply(`未找到预设"${viewTarget}"` + this.helpMsg, true)
                return
            }

            const viewedPreset = presets_config.presets[viewIndex]
            // const message = `预设名称：${viewedPreset.name}\n预设内容：\n${viewedPreset.prompt}`
            const message = `${viewedPreset.prompt}`
            await e.reply(message, true)

        } else if (action === '添加') {
            // 获取预设名称
            let presetName = e.msg.replace(/^#sf预设添加/, '').trim()

            if (!presetName) {
                await e.reply('请在120秒内发送预设名称：', true, { recallMsg: 119 })
                const e_name = await this.awaitContext()
                if (!e_name || !e_name.msg) {
                    await e.reply('[sf预设添加]操作已取消', true)
                    return
                }
                presetName = e_name.msg.trim()
                if (!presetName) {
                    await e.reply('[sf预设添加]预设名称不能为空，操作已取消', true)
                    return
                }
            }

            // 获取预设内容
            await e.reply(`请在120秒内发送预设名"${presetName}"的内容(发送空格取消)：`, true, { recallMsg: 119 })
            const e_prompt = await this.awaitContext()
            if (!e_prompt || !e_prompt.msg) {
                await e.reply('[sf预设添加]操作已取消', true)
                return
            }
            const presetPrompt = e_prompt.msg.trim()
            if (!presetPrompt) {
                await e.reply('[sf预设添加]预设内容不能为空，操作已取消', true)
                return
            }

            // 检查是否已存在同名预设
            if (!presets_config.presets) {
                presets_config.presets = []
            }
            const existingIndex = presets_config.presets.findIndex(p => p.name === presetName)
            if (existingIndex !== -1) {
                await e.reply(`预设"${presetName}"已存在，是否覆盖？(y/n)`, true, { recallMsg: 119 })
                const e_confirm = await this.awaitContext()
                if (!e_confirm || !e_confirm.msg || !['是', 'yes', 'y', '确认'].includes(e_confirm.msg.trim().toLowerCase())) {
                    await e.reply('[sf预设添加]操作已取消', true)
                    return
                }
                presets_config.presets[existingIndex] = { name: presetName, prompt: presetPrompt }
                await Config.setConfig(presets_config, "presets")
                await e.reply(`预设"${presetName}"已更新成功！` + this.helpMsg, true)
            } else {
                presets_config.presets.push({ name: presetName, prompt: presetPrompt })
                await Config.setConfig(presets_config, "presets")
                await e.reply(`预设"${presetName}"添加成功！` + this.helpMsg, true)
            }

        } else if (action === '删除') {
            if (!presets_config.presets || presets_config.presets.length === 0) {
                await e.reply("暂无预设列表，无法删除", true)
                return
            }

            // 获取要删除的预设名称或序号
            let deleteTarget = e.msg.replace(/^#sf预设删除/, '').trim()

            if (!deleteTarget) {
                // 显示预设列表
                const presetList = presets_config.presets.map((preset, index) => {
                    return `${index + 1}. ${preset.name}`
                }).join('\n')
                await e.reply(`请在120秒内发送要删除的预设名称或序号：\n${presetList}`, true, { recallMsg: 119 })
                const e_delete = await this.awaitContext()
                if (!e_delete || !e_delete.msg) {
                    await e.reply('[sf预设删除]操作已取消', true)
                    return
                }
                deleteTarget = e_delete.msg.trim()
                if (!deleteTarget) {
                    await e.reply('[sf预设删除]输入不能为空，操作已取消', true)
                    return
                }
            }

            // 判断是序号还是名称
            let deleteIndex = -1
            const targetNumber = parseInt(deleteTarget)
            if (!isNaN(targetNumber) && targetNumber > 0 && targetNumber <= presets_config.presets.length) {
                deleteIndex = targetNumber - 1
            } else {
                deleteIndex = presets_config.presets.findIndex(p => p.name === deleteTarget)
            }

            if (deleteIndex === -1) {
                await e.reply(`未找到预设"${deleteTarget}"`, true)
                return
            }

            // 回复确认
            const deletedPreset = presets_config.presets[deleteIndex]
            await e.reply(`确认删除预设"${deletedPreset.name}"(y/n)？`, true, { recallMsg: 119 })
            const e_confirmDelete = await this.awaitContext()
            if (!e_confirmDelete || !e_confirmDelete.msg || !['是', 'yes', 'y', '确认'].includes(e_confirmDelete.msg.trim().toLowerCase())) {
                await e.reply('[sf预设删除]操作已取消', true)
                return
            }

            presets_config.presets.splice(deleteIndex, 1)
            await Config.setConfig(presets_config, "presets")
            await e.reply(`预设"${deletedPreset.name}"已删除成功！` + this.helpMsg, true)
        }
    }


}