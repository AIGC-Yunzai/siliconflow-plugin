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
  getConfig() {
    try {
      // 读取主配置文件
      let config = YAML.parse(
        fs.readFileSync(`${pluginRoot}/config/config/config.yaml`, 'utf-8')
      )

      // 读取gemini额外的模型列表
      const defaultArr = ['gemini-2.0-flash', 'gemini-exp-1206', 'gemini-2.0-flash-thinking-exp-01-21']
      try {
        const modelPath = `${pluginRoot}/config/config/geminiModelsByFetch.yaml`
        const fetchModels = YAML.parse(fs.readFileSync(modelPath, 'utf-8')) || []
        config.geminiModelsByFetch = lodash.uniq([...defaultArr, ...fetchModels]);
      } catch (err) {
        // logger.error('[sf插件]读取geminiModelsByFetch.yaml失败', err)
        config.geminiModelsByFetch = defaultArr
      }

      // 递归读取所有yaml文件
      const configDir = `${pluginRoot}/config/config/prompts`
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }

      const files = getAllFiles(configDir).filter(f => f.endsWith('.yaml') || f.endsWith('.txt')) // 匹配旧版本的yaml格式的prompt

      files.forEach(file => {
        const fileName = path.basename(file, path.extname(file))
        let content
        if (file.endsWith('.yaml')) { // 匹配旧版本的yaml格式的prompt
          content = YAML.parse(fs.readFileSync(file, 'utf-8'))?.prompt
        } else if (file.endsWith('.txt')) {
          content = fs.readFileSync(file, 'utf-8')
        }

        // 处理ss默认配置
        if (fileName === 'ss_default') {
          config.ss_Prompt = content
        }
        // 处理gg默认配置  
        else if (fileName === 'gg_default') {
          config.gg_Prompt = content
        }
        // 处理ss接口配置
        else if (fileName.startsWith('ss_') && config.ss_APIList) {
          const remark = fileName.slice(3) // 去掉'ss_'前缀
          const ssApi = config.ss_APIList.find(api => api.remark.replace(/\\|\/|:|\*|\?|\"|<|>|\||\.$/g, '_') === remark)
          if (ssApi) {
            ssApi.prompt = content
          }
        }
        // 处理gg接口配置
        else if (fileName.startsWith('gg_') && config.gg_APIList) {
          const remark = fileName.slice(3) // 去掉'gg_'前缀
          const ggApi = config.gg_APIList.find(api => api.remark.replace(/\\|\/|:|\*|\?|\"|<|>|\||\.$/g, '_') === remark)
          if (ggApi) {
            ggApi.prompt = content
          }
        }
      })

      return config

    } catch (err) {
      logger.error('读取config.yaml失败', err)
      return false
    }
  }

  getDefConfig() {
    try {
      const config_default_yaml = YAML.parse(
        fs.readFileSync(`${pluginRoot}/config/config_default.yaml`, 'utf-8')
      )
      return config_default_yaml
    } catch (err) {
      logger.error('读取config_default.yaml失败', err)
      return false
    }
  }

  // 添加新的检查方法
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

  setConfig(config_data) {
    try {
      // 创建新对象避免引用问题
      const newConfig = JSON.parse(JSON.stringify(config_data))

      const promptDir = `${pluginRoot}/config/config/prompts`
      if (!fs.existsSync(promptDir)) {
        fs.mkdirSync(promptDir, { recursive: true })
      }

      // 验证配置
      this.validateConfig(newConfig)

      // 检查是否需要更新ss默认prompt
      if ('ss_Prompt' in newConfig) {
        fs.writeFileSync(
          path.join(promptDir, 'ss_default.txt'),
          newConfig.ss_Prompt ?? ''
        )
        // 删除旧的ss_default.yaml文件
        const ssDefaultYamlPath = path.join(promptDir, 'ss_default.yaml') // 匹配旧版本的yaml格式的prompt
        if (fs.existsSync(ssDefaultYamlPath)) {
          fs.unlinkSync(ssDefaultYamlPath)
        }
      }
      delete newConfig.ss_Prompt

      // 检查是否需要更新gg默认prompt
      if ('gg_Prompt' in newConfig) {
        fs.writeFileSync(
          path.join(promptDir, 'gg_default.txt'),
          newConfig.gg_Prompt ?? ''
        )
        // 删除旧的gg_default.yaml文件
        const ggDefaultYamlPath = path.join(promptDir, 'gg_default.yaml') // 匹配旧版本的yaml格式的prompt
        if (fs.existsSync(ggDefaultYamlPath)) {
          fs.unlinkSync(ggDefaultYamlPath)
        }
      }
      delete newConfig.gg_Prompt

      // 保存ss接口prompt
      if (newConfig.ss_APIList) {
        newConfig.ss_APIList.forEach(api => {
          if (api.remark) {
            fs.writeFileSync(
              path.join(promptDir, `ss_${api.remark.replace(/\\|\/|:|\*|\?|\"|<|>|\||\.$/g, '_')}.txt`),
              api.prompt ?? ''
            )
            // 删除旧的ss接口yaml文件
            const ssApiYamlPath = path.join(promptDir, `ss_${api.remark.replace(/\\|\/|:|\*|\?|\"|<|>|\||\.$/g, '_')}.yaml`) // 匹配旧版本的yaml格式的prompt
            if (fs.existsSync(ssApiYamlPath)) {
              fs.unlinkSync(ssApiYamlPath)
            }
            delete api.prompt
          }
        })
      }

      // 保存gg接口prompt
      if (newConfig.gg_APIList) {
        newConfig.gg_APIList.forEach(api => {
          if (api.remark) {
            fs.writeFileSync(
              path.join(promptDir, `gg_${api.remark.replace(/\\|\/|:|\*|\?|\"|<|>|\||\.$/g, '_')}.txt`),
              api.prompt ?? ''
            )
            // 删除旧的gg接口yaml文件
            const ggApiYamlPath = path.join(promptDir, `gg_${api.remark.replace(/\\|\/|:|\*|\?|\"|<|>|\||\.$/g, '_')}.yaml`) // 匹配旧版本的yaml格式的prompt
            if (fs.existsSync(ggApiYamlPath)) {
              fs.unlinkSync(ggApiYamlPath)
            }
            delete api.prompt
          }
        })
      }

      // 清理已删除接口的prompt文件
      const files = getAllFiles(promptDir).filter(f => f.endsWith('.yaml') || f.endsWith('.txt')) // 匹配旧版本的yaml格式的prompt
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

      // 保存主配置
      fs.writeFileSync(
        `${pluginRoot}/config/config/config.yaml`,
        YAML.stringify(newConfig)
      )
      return true
    } catch (err) {
      logger.error('写入config.yaml失败', err)
      return false
    }
  }
}

export default new Config()
