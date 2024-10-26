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