import YAML from 'yaml'
import fs from 'fs'
import path from 'path'
import { pluginRoot } from '../model/path.js'
import lodash from 'lodash'

// 递归获取目录下所有文件
function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir)
  files.forEach(file => {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList)
    } else {
      fileList.push(filePath)
    }
  })
  return fileList
}

class Config {
  constructor() {
    // 初始化配置缓存和监听处理器
    this.configCache = {}
    // 配置文件排除缓存列表(prompts相关的不缓存)
    this.noCacheFiles = []
    this.watchHandlers = {}

    this.initConfig()
    this.initConfig_fishAudio()
    // this.initConfig_geminiModels()

    // 设置文件监听
    this.setupWatchers()
  }

  initConfig() {
    // config.yaml
    this.checkCopyDef('config')
    let config_default_yaml = this.getDefConfig('config')
    let config_yaml = this.getConfig('config')

    // 同步默认配置的新字段，但跳过清理逻辑
    this.setConfig(this.syncDefKeys(config_yaml, config_default_yaml), 'config', true)
  }

  initConfig_fishAudio() {
    // fishAudio.yaml
    this.checkCopyDef('fishAudio')
    let fishAudio_default_yaml = this.getDefConfig('fishAudio')
    let fishAudio_yaml = this.getConfig('fishAudio')
    this.setConfig(this.syncDefKeys(fishAudio_yaml, fishAudio_default_yaml), 'fishAudio', true)
  }

  // initConfig_geminiModels() {
  //   // geminiModelsByFetch.yaml
  //   this.checkCopyDef('geminiModelsByFetch')
  // }

  /**
   * @description: 检查设置文件，当其不存在时复制默认设置文件
   * @param {string} configName
   * @return {*}
   */
  checkCopyDef(configName) {
    const config_default_path = `${pluginRoot}/config/${configName}_default.yaml`
    const config_path = `${pluginRoot}/config/config/${configName}.yaml`

    if (!fs.existsSync(config_default_path)) {
      logger.mark(`[SF插件]默认设置文件${configName}不存在，请检查或重新安装插件`)
      return true
    }

    if (!fs.existsSync(config_path)) {
      logger.mark(`[SF插件]设置文件${configName}不存在，将使用默认设置文件`)
      // 确保目录存在
      const configDir = path.dirname(config_path)
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }
      fs.copyFileSync(config_default_path, config_path)
    }
  }

  getConfig(configName = 'config') {
    // 检查是否是不缓存的配置文件
    if (this.noCacheFiles.includes(configName)) {
      // 直接从文件读取
      try {
        const configPath = `${pluginRoot}/config/config/${configName}.yaml`
        let config = YAML.parse(fs.readFileSync(configPath, 'utf-8'))
        return this.enhanceConfig(config, configName)
      } catch (err) {
        logger.error(`读取设置文件 ${configName}.yaml 失败，将使用默认配置`)
        return this.getDefConfig(configName)
      }
    }

    // 对其他文件使用缓存
    if (this.configCache[configName]) {
      // 深拷贝缓存的配置
      const clonedConfig = this.deepCloneConfig(this.configCache[configName])
      // 为拷贝的配置添加 getter（只对主配置）
      if (configName === 'config') {
        return this.enhanceConfig(clonedConfig, configName)
      }
      return clonedConfig
    }

    // 否则从文件读取并缓存
    try {
      const configPath = `${pluginRoot}/config/config/${configName}.yaml`
      let configData = YAML.parse(fs.readFileSync(configPath, 'utf-8'))

      // 缓存原始配置（不添加 getter）
      this.configCache[configName] = configData

      // 为返回的配置添加 getter
      if (configName === 'config') {
        return this.enhanceConfig(this.deepCloneConfig(configData), configName)
      }
      return this.deepCloneConfig(configData)
    } catch (err) {
      logger.error(`读取设置文件 ${configName}.yaml 失败，将使用默认配置`)
      // 使用默认配置并缓存
      const defConfig = this.getDefConfig(configName)
      this.configCache[configName] = defConfig
      if (configName === 'config') {
        return this.enhanceConfig(this.deepCloneConfig(defConfig), configName)
      }
      return this.deepCloneConfig(defConfig)
    }
  }

  /**
   * 增强配置，添加额外的数据处理
   */
  enhanceConfig(config, configName) {
    if (configName === 'config') {
      // 读取gemini额外的模型列表
      const defaultGeminiModels = ['gemini-2.0-flash', 'gemini-exp-1206', 'gemini-2.0-flash-thinking-exp-01-21', 'gemini-2.5-flash', 'gemini-2.5-pro']
      try {
        const modelPath = `${pluginRoot}/config/config/geminiModelsByFetch.yaml`
        const fetchGeminiModels = YAML.parse(fs.readFileSync(modelPath, 'utf-8')) || []
        config.geminiModelsByFetch = lodash.uniq([...defaultGeminiModels, ...fetchGeminiModels]);
      } catch (err) {
        // logger.error('[sf插件]读取geminiModelsByFetch.yaml失败', err)
        config.geminiModelsByFetch = defaultGeminiModels
      }

      // 为API列表添加 prompt 获取器，而不是直接读取 prompt 内容
      if (config.ss_APIList && Array.isArray(config.ss_APIList)) {
        config.ss_APIList.forEach(api => {
          if (api.remark) {
            // 使用 getter 属性实现按需读取
            Object.defineProperty(api, 'prompt', {
              get: () => {
                // console.log(`[SF插件] 正在读取 ss prompt: ${api.remark}`)
                return this.getPrompt('ss', api.remark)
              },
              enumerable: true,
              configurable: true
            })
          }
        })
      }

      if (config.gg_APIList && Array.isArray(config.gg_APIList)) {
        config.gg_APIList.forEach(api => {
          if (api.remark) {
            // 使用 getter 属性实现按需读取
            Object.defineProperty(api, 'prompt', {
              get: () => {
                // console.log(`[SF插件] 正在读取 gg prompt: ${api.remark}`)
                return this.getPrompt('gg', api.remark)
              },
              enumerable: true,
              configurable: true
            })
          }
        })
      }

      // 为默认 prompt 添加 getter
      Object.defineProperty(config, 'ss_Prompt', {
        get: () => {
          // console.log(`[SF插件] 正在读取 ss 默认 prompt`)
          return this.getPrompt('ss', 'default')
        },
        enumerable: true,
        configurable: true
      })

      Object.defineProperty(config, 'gg_Prompt', {
        get: () => {
          // console.log(`[SF插件] 正在读取 gg 默认 prompt`)
          return this.getPrompt('gg', 'default')
        },
        enumerable: true,
        configurable: true
      })
    }

    return config
  }

  /**
   * 按需读取prompt文件
   */
  getPrompt(type, remark) {
    try {
      const promptDir = `${pluginRoot}/config/config/prompts`
      let fileName

      if (remark === 'default') {
        fileName = `${type}_default.txt`
      } else {
        fileName = `${type}_${remark.replace(/\\|\/|:|\*|\?|\"|<|>|\||\.$/g, '_')}.txt`
      }

      const filePath = path.join(promptDir, fileName)

      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8')
      } else {
        return ''
      }
    } catch (err) {
      logger.error(`读取prompt文件失败: ${type}_${remark}`, err)
      return ''
    }
  }

  /**
   * 深拷贝配置对象，正确处理 getter 属性
   */
  deepCloneConfig(obj) {
    if (obj === null || typeof obj !== 'object') return obj

    if (obj instanceof Array) {
      return obj.map(item => this.deepCloneConfig(item))
    }

    const cloned = {}
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const descriptor = Object.getOwnPropertyDescriptor(obj, key)
        if (descriptor && descriptor.get) {
          // 跳过 getter 属性，不复制到新对象中
          continue
        } else {
          cloned[key] = this.deepCloneConfig(obj[key])
        }
      }
    }
    return cloned
  }

  getDefConfig(configName = 'config') {
    try {
      return YAML.parse(
        fs.readFileSync(`${pluginRoot}/config/${configName}_default.yaml`, 'utf-8')
      )
    } catch (err) {
      logger.error(`读取默认设置文件 ${configName} 失败，请重新安装插件`, err)
      return false
    }
  }

  setConfig(config_data, configName = 'config', skipCleanup = false) {
    try {
      // 深拷贝配置，但需要特殊处理 getter 属性
      const newConfig = this.deepCloneConfig(config_data)

      const promptDir = `${pluginRoot}/config/config/prompts`
      if (!fs.existsSync(promptDir)) {
        fs.mkdirSync(promptDir, { recursive: true })
      }

      // 验证配置
      this.validateConfig(newConfig)

      // 仅在非初始化时处理 prompt 文件写入
      if (!skipCleanup) {
        // 检查是否需要更新ss默认prompt
        if ('ss_Prompt' in config_data) {
          const promptValue = typeof config_data.ss_Prompt === 'function' ? config_data.ss_Prompt() : config_data.ss_Prompt
          fs.writeFileSync(
            path.join(promptDir, 'ss_default.txt'),
            promptValue ?? ''
          )
          delete newConfig.ss_Prompt
        }

        // 检查是否需要更新gg默认prompt
        if ('gg_Prompt' in config_data) {
          const promptValue = typeof config_data.gg_Prompt === 'function' ? config_data.gg_Prompt() : config_data.gg_Prompt
          fs.writeFileSync(
            path.join(promptDir, 'gg_default.txt'),
            promptValue ?? ''
          )
          delete newConfig.gg_Prompt
        }        // 保存ss接口prompt
        if (config_data.ss_APIList) {
          config_data.ss_APIList.forEach((api, index) => {
            if (api.remark && 'prompt' in api) {
              const promptValue = typeof api.prompt === 'function' ? api.prompt() : api.prompt
              fs.writeFileSync(
                path.join(promptDir, `ss_${api.remark.replace(/\\|\/|:|\*|\?|\"|<|>|\||\.$/g, '_')}.txt`),
                promptValue ?? ''
              )
              // 从 newConfig 中删除 prompt 字段
              if (newConfig.ss_APIList && newConfig.ss_APIList[index]) {
                delete newConfig.ss_APIList[index].prompt
              }
            }
          })
        }

        // 保存gg接口prompt
        if (config_data.gg_APIList) {
          config_data.gg_APIList.forEach((api, index) => {
            if (api.remark && 'prompt' in api) {
              const promptValue = typeof api.prompt === 'function' ? api.prompt() : api.prompt
              fs.writeFileSync(
                path.join(promptDir, `gg_${api.remark.replace(/\\|\/|:|\*|\?|\"|<|>|\||\.$/g, '_')}.txt`),
                promptValue ?? ''
              )
              // 从 newConfig 中删除 prompt 字段
              if (newConfig.gg_APIList && newConfig.gg_APIList[index]) {
                delete newConfig.gg_APIList[index].prompt
              }
            }
          })
        }
      } else {
        // 初始化时，只需要清理配置对象中的 getter 属性，不写入文件
        if ('ss_Prompt' in config_data) {
          delete newConfig.ss_Prompt
        }
        if ('gg_Prompt' in config_data) {
          delete newConfig.gg_Prompt
        }
        if (newConfig.ss_APIList) {
          newConfig.ss_APIList.forEach((api, index) => {
            if (api && 'prompt' in api) {
              delete newConfig.ss_APIList[index].prompt
            }
          })
        }
        if (newConfig.gg_APIList) {
          newConfig.gg_APIList.forEach((api, index) => {
            if (api && 'prompt' in api) {
              delete newConfig.gg_APIList[index].prompt
            }
          })
        }
      }

      // 清理已删除接口的prompt文件（仅在非初始化时执行）
      if (!skipCleanup) {
        const files = getAllFiles(promptDir).filter(f => f.endsWith('.txt'))
        files.forEach(file => {
          const fileName = path.basename(file, path.extname(file))
          if (fileName === 'ss_default' || fileName === 'gg_default') {
            return
          }
          // 处理ss接口文件
          if (fileName.startsWith('ss_')) {
            const remark = fileName.slice(3)
            const exists = newConfig.ss_APIList?.some(api => api.remark.replace(/\\|\/|:|\*|\?|\"|<|>|\||\.$/g, '_') === remark)
            if (!exists) {
              fs.unlinkSync(file)
            }
          }
          // 处理gg接口文件
          else if (fileName.startsWith('gg_')) {
            const remark = fileName.slice(3)
            const exists = newConfig.gg_APIList?.some(api => api.remark.replace(/\\|\/|:|\*|\?|\"|<|>|\||\.$/g, '_') === remark)
            if (!exists) {
              fs.unlinkSync(file)
            }
          }
        })
      }

      // 保存主配置
      const configPath = `${pluginRoot}/config/config/${configName}.yaml`
      fs.writeFileSync(configPath, YAML.stringify(newConfig))

      // 对 不在排除列表中的 配置文件更新缓存
      if (!this.noCacheFiles.includes(configName)) {
        this.configCache[configName] = newConfig
      }

      return true
    } catch (err) {
      logger.error(`写入 ${configName}.yaml 失败`, err)
      return false
    }
  }

  // 设置文件监听
  setupWatchers() {
    const configDir = `${pluginRoot}/config/config`

    // 监听整个配置目录
    try {
      // 获取所有配置文件
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
        return
      }

      const configFiles = fs.readdirSync(configDir)
        .filter(file => file.endsWith('.yaml'))
        .map(file => file.replace('.yaml', ''))

      // 为每个配置文件设置监听
      configFiles.forEach(configName => {
        const configPath = `${configDir}/${configName}.yaml`

        // 先清除已有的监听器
        if (this.watchHandlers[configName]) {
          this.watchHandlers[configName].close()
        }

        // 设置新的监听器
        this.watchHandlers[configName] = fs.watch(configPath, () => {
          logger.debug(`[SF插件] 检测到配置文件 ${configName}.yaml 被外部修改，将重新加载`)
          // 清除缓存，下次 getConfig 时会重新读取
          delete this.configCache[configName]
        })
      })

      // 监听prompts目录
      const promptsDir = `${configDir}/prompts`
      if (fs.existsSync(promptsDir)) {
        if (this.watchHandlers['prompts']) {
          this.watchHandlers['prompts'].close()
        }

        this.watchHandlers['prompts'] = fs.watch(promptsDir, { recursive: true }, (eventType, filename) => {
          if (filename && filename.endsWith('.txt')) {
            logger.debug(`[SF插件] 检测到prompt文件 ${filename} 被${eventType === 'rename' ? '修改/删除' : '变更'}`)
            // prompts文件不缓存，所以不需要清除缓存
          }
        })
      }

      logger.debug(`[SF插件] 已设置 ${configFiles.length} 个配置文件的监听`)
    } catch (err) {
      logger.error(`[SF插件] 设置配置文件监听失败`, err)
    }
  }

  /** 同步默认配置中新的 keys 并删除不存在的 keys */
  syncDefKeys(currentConfig, defaultConfig) {
    for (const key in defaultConfig) {
      if (!(key in currentConfig)) {
        currentConfig[key] = defaultConfig[key]
      }
    }
    for (const key in currentConfig) {
      if (!(key in defaultConfig)) {
        delete currentConfig[key]
      }
    }
    return currentConfig
  }

  /** 更新Config_yaml的YAML文件 */
  updateConfig(key, value, configName = 'config') {
    const data = this.getConfig(configName)
    if (!data) logger.error(`无法读取设置文件 ${configName}.yaml`)
    data[key] = value
    this.setConfig(data, configName)
    return data
  }

  /** 验证配置文件 */
  validateConfig(config) {
    const existingRemarks = new Set(['ss_default', 'gg_default']) // 预置的默认文件名

    // 检查ss_APIList
    if (config.ss_APIList && Array.isArray(config.ss_APIList)) {
      for (const api of config.ss_APIList) {
        if (!api.remark) {
          throw new Error('SS接口配置缺少必填的备注(remark)字段')
        }
        const fileName = `ss_${api.remark.replace(/\\|\/|:|\*|\?|\"|<|>|\||\.$/g, '_')}`
        if (existingRemarks.has(fileName)) {
          throw new Error(`SS接口配置的备注"${api.remark}"重复`)
        }
        existingRemarks.add(fileName)
      }
    }

    // 检查gg_APIList
    if (config.gg_APIList && Array.isArray(config.gg_APIList)) {
      for (const api of config.gg_APIList) {
        if (!api.remark) {
          throw new Error('GG接口配置缺少必填的备注(remark)字段')
        }
        const fileName = `gg_${api.remark.replace(/\\|\/|:|\*|\?|\"|<|>|\||\.$/g, '_')}`
        if (existingRemarks.has(fileName)) {
          throw new Error(`GG接口配置的备注"${api.remark}"重复`)
        }
        existingRemarks.add(fileName)
      }
    }
  }
}

export default new Config()
