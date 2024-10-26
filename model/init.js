import fs from 'fs'
import Config from '../components/Config.js'
import { pluginRoot } from '../model/path.js'
import {
  readYaml,
  writeYaml,
} from '../utils/common.js'

class Init {
  constructor() {
    this.initConfig()
  }

  initConfig() {
    const config_default_path = `${pluginRoot}/config/config_default.yaml`
    if (!fs.existsSync(config_default_path)) {
      logger.error('默认设置文件不存在，请检查或重新安装插件')
      return true
    }
    const config_path = `${pluginRoot}/config/config/config.yaml`
    if (!fs.existsSync(config_path)) {
      logger.error('设置文件不存在，将使用默认设置文件')
      fs.copyFileSync(config_default_path, config_path)
    }
    const config_default_yaml = Config.getDefConfig()
    const config_yaml = Config.getConfig()
    for (const key in config_default_yaml) {
      if (!(key in config_yaml)) {
        config_yaml[key] = config_default_yaml[key]
      }
    }
    for (const key in config_yaml) {
      if (!(key in config_default_yaml)) {
        delete config_yaml[key]
      }
    }
    Config.setConfig(config_yaml)

    // fishAudio_default
    const fishAudio_default_path = `${pluginRoot}/config/fishAudio_default.yaml`
    if (!fs.existsSync(fishAudio_default_path)) {
      logger.mark('默认设置文件fishAudio不存在，请检查或重新安装插件')
      return true
    }
    const config_path_fishAudio = `${pluginRoot}/config/config/fishAudio.yaml`
    if (!fs.existsSync(config_path_fishAudio)) {
      logger.mark('设置文件fishAudio不存在，将使用默认设置文件')
      fs.copyFileSync(fishAudio_default_path, config_path_fishAudio)
    }
    let fishAudio_default_yaml = readYaml(`${pluginRoot}/config/fishAudio_default.yaml`)
    let fishAudio_yaml = readYaml(`${pluginRoot}/config/config/fishAudio.yaml`)
    for (const key in fishAudio_default_yaml) {
      if (!(key in fishAudio_yaml)) {
        fishAudio_yaml[key] = fishAudio_default_yaml[key]
      }
    }
    for (const key in fishAudio_yaml) {
      if (!(key in fishAudio_default_yaml)) {
        delete fishAudio_yaml[key]
      }
    }
    writeYaml(`${pluginRoot}/config/config/fishAudio.yaml`, fishAudio_yaml)



  }
}

export default new Init()
