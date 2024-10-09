import Init from '../model/init.js'

export class init extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'siliconflow-配置初始化',
            /** 功能描述 */
            dsc: '配置初始化',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 1009,
            rule: [
                {
                    /** 命令正则匹配 */
                    reg: '^(/|#)配置初始化$',
                    /** 执行方法 */
                    fnc: 'init',
                    /** 主人判断 */
                    permission: "master",
                }
            ]
        })
    }

    async init(e) {
        Init.initConfig()
    }
}