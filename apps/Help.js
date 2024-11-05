import plugin from '../../../lib/plugins/plugin.js'
import Render from '../components/Render.js'
import { style } from '../resources/help/imgs/config.js'
import _ from 'lodash'

export class help extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'siliconflow-帮助',
            /** 功能描述 */
            dsc: 'siliconflow帮助',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 1009,
            rule: [
                {
                    /** 命令正则匹配 */
                    reg: '^(/|#)(sf|SF|siliconflow)帮助$',
                    /** 执行方法 */
                    fnc: 'help'
                }
            ]
        })
    }

    async help(e) {
        const helpCfg = {
            "themeSet": false,
            "title": "Siliconflow帮助",
            "subTitle": "Siliconflow-Bot",
            "colWidth": 265,
            "theme": "all",
            "themeExclude": [
                "default"
            ],
            "colCount": 2,
            "bgBlur": true
        }
        const helpList = [
            {
                "group": "Siliconflow帮助",
                "list": [
                    {
                        "icon": 1,
                        "title": "#mjp [描述]",
                        "desc": "使用 MID_JOURNEY 绘画"
                    },
                    {
                        "icon": 5,
                        "title": "#niji [描述]",
                        "desc": "使用 NIJI_JOURNEY 绘画"
                    },
                    {
                        "icon": 8,
                        "title": "#mjc [描述]",
                        "desc": "引用一张图片,自动在提示词后添加--cref URL，可在描述中加--cw 0~100,数字越低变化越大"
                    },
                    {
                        "icon": 2,
                        "title": "#nic [描述]",
                        "desc": "与mjc相同，但会自动添加--niji参数，生成二次元风格图片"
                    },
                    {
                        "icon": 7,
                        "title": "#sf绘图 [描述]",
                        "desc": "使用 Siliconflow 预设模型绘画"
                    },
                    {
                        "icon": 11,
                        "title": "#sf绘图 [描述][横图]",
                        "desc": "指定绘画参数 [横图|竖图|方图|512*512|步数20]"
                    },
                    {
                        "icon": 54,
                        "title": "#ss [对话]",
                        "desc": "与LLM对话"
                    },
                    // {
                    //     "icon": 86,
                    //     "title": "#sf设置生成提示词 [开|关]",
                    //     "desc": "设置生成提示词开关"
                    // },
                    {
                        "icon": 61,
                        "title": "#fish群号同传QQ号",
                        "desc": "设置TTS同传，例如#fish56789同传12345"
                    },
                    {
                        "icon": 62,
                        "title": "#fish查看配置",
                        "desc": "查看当前fish同传配置信息"
                    },
                    {
                        "icon": 9,
                        "title": "#直链",
                        "desc": "获取图片的直链地址"
                    },
                    {
                        "icon": 10,
                        "title": "#删除直链[图链]",
                        "desc": "删除已上传的图片直链"
                    },
                    {
                        "icon": 12,
                        "title": "#设置直链域名 [域名]",
                        "desc": "设置图片直链上传服务器域名"
                    },
                ],
            },
            {
                "group": 'SF-plugin设置（请使用Guoba-Plugin进行操作）',
                list: [
                    {
                        "icon": 91,
                        "title": "#mjp帮助",
                        "desc": "获取 mjp 帮助"
                    },
                    {
                        "icon": 60,
                        "title": "#(fish)同传帮助",
                        "desc": "获取 fish 同传帮助信息"
                    },
                    {
                        "icon": 3,
                        "title": "#sf设置帮助",
                        "desc": "获取 sf 设置帮助"
                    },
                    {
                        "icon": 38,
                        "title": "#sf更新",
                        "desc": "更新本插件"
                    },
                ]
            }
        ]
        let helpGroup = []
        _.forEach(helpList, (group) => {
            _.forEach(group.list, (help) => {
                let icon = help.icon * 1
                if (!icon) {
                    help.css = 'display:none'
                } else {
                    let x = (icon - 1) % 10
                    let y = (icon - x - 1) / 10
                    help.css = `background-position:-${x * 50}px -${y * 50}px`
                }
            })
            helpGroup.push(group)
        })

        let themeData = await this.getThemeData(helpCfg, helpCfg)
        return await Render.render('help/index', {
            helpCfg,
            helpGroup,
            ...themeData,
            element: 'default'
        }, { e, scale: 1.6 })
    }

    async getThemeCfg() {
        let resPath = '{{_res_path}}/help/imgs/'
        return {
            main: `${resPath}/main.png`,
            bg: `${resPath}/bg.jpg`,
            style: style
        }
    }

    async getThemeData(diyStyle, sysStyle) {
        let helpConfig = _.extend({}, sysStyle, diyStyle)
        let colCount = Math.min(5, Math.max(parseInt(helpConfig?.colCount) || 3, 2))
        let colWidth = Math.min(500, Math.max(100, parseInt(helpConfig?.colWidth) || 265))
        let width = Math.min(2500, Math.max(800, colCount * colWidth + 30))
        let theme = await this.getThemeCfg()
        let themeStyle = theme.style || {}
        let ret = [`
          body{background-image:url(${theme.bg});width:${width}px;}
          .container{background-image:url(${theme.main});width:${width}px;}
          .help-table .td,.help-table .th{width:${100 / colCount}%}
          `]
        let css = function (sel, css, key, def, fn) {
            let val = (function () {
                for (let idx in arguments) {
                    if (!_.isUndefined(arguments[idx])) {
                        return arguments[idx]
                    }
                }
            })(themeStyle[key], diyStyle[key], sysStyle[key], def)
            if (fn) {
                val = fn(val)
            }
            ret.push(`${sel}{${css}:${val}}`)
        }
        css('.help-title,.help-group', 'color', 'fontColor', '#ceb78b')
        css('.help-title,.help-group', 'text-shadow', 'fontShadow', 'none')
        css('.help-desc', 'color', 'descColor', '#eee')
        css('.cont-box', 'background', 'contBgColor', 'rgba(43, 52, 61, 0.8)')
        css('.cont-box', 'backdrop-filter', 'contBgBlur', 3, (n) => diyStyle.bgBlur === false ? 'none' : `blur(${n}px)`)
        css('.help-group', 'background', 'headerBgColor', 'rgba(34, 41, 51, .4)')
        css('.help-table .tr:nth-child(odd)', 'background', 'rowBgColor1', 'rgba(34, 41, 51, .2)')
        css('.help-table .tr:nth-child(even)', 'background', 'rowBgColor2', 'rgba(34, 41, 51, .4)')
        return {
            style: `<style>${ret.join('\n')}</style>`,
            colCount
        }
    }
}

