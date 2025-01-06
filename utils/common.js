import yaml from 'yaml'
import fs from 'fs'
/** 读取YAML文件 */
export function readYaml(filePath) {
    return yaml.parse(fs.readFileSync(filePath, 'utf8'))
}

/** 写入YAML文件 */
export function writeYaml(filePath, data) {
    fs.writeFileSync(filePath, yaml.stringify(data), 'utf8')
}

/**
 * @description: 获取适配器Uin
 * @param {*} e
 * @return {*}
 */
export function getUin(e) {
    if (e?.self_id) return e.self_id
    if (e?.bot?.uin) return e.bot.uin
    if (Array.isArray(Bot.uin)) {
        if (Config.trssBotUin && Bot.uin.indexOf(Config.trssBotUin) > -1) { return Config.trssBotUin } else {
            Bot.uin.forEach((u) => {
                if (Bot[u].self_id) {
                    return Bot[u].self_id
                }
            })
            return Bot.uin[Bot.uin.length - 1]
        }
    } else return Bot.uin
}