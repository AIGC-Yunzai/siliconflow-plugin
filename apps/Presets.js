import plugin from '../../../lib/plugins/plugin.js'
import Config from '../components/Config.js'
import common from '../../../lib/common/common.js';
import {
    parseSourceImg,
    url2Base64,
} from '../utils/getImg.js'
import { handleParam } from '../utils/Jimeng/parse_Jimeng.js'
import { memberControlProcess } from '../utils/memberControl.js'
import { applyPresets } from '../utils/applyPresets.js'

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
                }
            ]
        })
    }

    async showPresetsList(e) {
        const presets_config = Config.getConfig("presets")

        if (!presets_config.presets || presets_config.presets.length === 0) {
            await e.reply("暂无预设列表", true)
            return
        }

        const presetNames = presets_config.presets.map((preset, index) => {
            return `${index + 1}. ${preset.name}`
        }).join('\n')

        const message = `当前预设列表：\n${presetNames}`
        await e.reply(message, true)
    }


}