import plugin from '../../../lib/plugins/plugin.js'
import common from '../../../lib/common/common.js'
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

    buildPresetNodes(presets_config, withIndex = false, nodeSize = 1) {
        const presets = presets_config.presets || []
        const presetList = presets.map((preset, index) => {
            const presetName = presets_config.antiMisoperation ? `{预设:${preset.name}}` : preset.name
            return withIndex ? `${index + 1}. ${presetName}` : presetName
        })

        const nodes = []
        for (let i = 0; i < presetList.length; i += nodeSize) {
            nodes.push(presetList.slice(i, i + nodeSize).join('\n'))
        }
        return nodes
    }

    async sendManagePresetsList(e, presets_config, title) {
        const presetNodes = this.buildPresetNodes(presets_config, true, 50)
        presetNodes.push(this.helpMsg)
        await e.reply(await common.makeForwardMsg(e, presetNodes, title))
    }

    async showPresetsList(e) {
        const presets_config = Config.getConfig("presets")

        if (!presets_config.presets || presets_config.presets.length === 0) {
            await e.reply("暂无预设列表" + this.helpMsg, true)
            return
        }

        /** 合并转发最大节点数 */
        const maxForwardNodes = 80
        const presetNodes = this.buildPresetNodes(presets_config)
        const totalForwardMsgs = Math.ceil(presetNodes.length / maxForwardNodes)

        for (let i = 0; i < presetNodes.length; i += maxForwardNodes) {
            const chunk = presetNodes.slice(i, i + maxForwardNodes)
            const currentForwardMsg = Math.floor(i / maxForwardNodes) + 1
            const title = totalForwardMsgs > 1 ? `当前预设列表 ${currentForwardMsg}/${totalForwardMsgs}` : '当前预设列表'

            if (currentForwardMsg === totalForwardMsgs) {
                chunk.push(this.helpMsg)
            }
            await e.reply(await common.makeForwardMsg(e, chunk, title))
        }
    }

    async managePresetsList(e) {
        const presets_config = Config.getConfig("presets")
        const msg = e.msg.replace(/{预设:(.*?)}/g, '$1')
        const action = msg.match(/^#sf预设(添加|删除|查看)/)[1]

        if (action === '查看') {
            if (!presets_config.presets || presets_config.presets.length === 0) {
                await e.reply("暂无预设列表" + this.helpMsg, true)
                return
            }

            // 获取要查看的预设名称或序号
            let viewTarget = msg.replace(/^#sf预设查看/, '').trim()

            if (!viewTarget) {
                // 显示预设列表
                await e.reply('请在120秒内发送要查看的预设名称或序号：', true, { recallMsg: 119 })
                await this.sendManagePresetsList(e, presets_config, '可查看预设列表')
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
            let presetName = msg.replace(/^#sf预设添加/, '').trim()

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
                await e.reply(`预设"${presetName}"已更新成功！触发词：\n ${presets_config.antiMisoperation ? `{预设:${presetName}}` : presetName}\n` + this.helpMsg, true)
            } else {
                presets_config.presets.push({ name: presetName, prompt: presetPrompt })
                await Config.setConfig(presets_config, "presets")
                await e.reply(`预设"${presetName}"添加成功！触发词：\n ${presets_config.antiMisoperation ? `{预设:${presetName}}` : presetName}\n` + this.helpMsg, true)
            }

        } else if (action === '删除') {
            if (!presets_config.presets || presets_config.presets.length === 0) {
                await e.reply("暂无预设列表，无法删除", true)
                return
            }

            // 获取要删除的预设名称或序号
            let deleteTarget = msg.replace(/^#sf预设删除/, '').trim()

            if (!deleteTarget) {
                // 显示预设列表
                await e.reply('请在120秒内发送要删除的预设名称或序号：', true, { recallMsg: 119 })
                await this.sendManagePresetsList(e, presets_config, '可删除预设列表')
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
