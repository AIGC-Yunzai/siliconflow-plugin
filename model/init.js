import fs from 'fs'
import Config from '../components/Config.js'
import { pluginRoot } from '../model/path.js'

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
  }
}

export default new Init()
