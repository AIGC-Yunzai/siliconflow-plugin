import YAML from 'yaml'
import fs from 'fs'
import path from 'path'
import { pluginRoot } from '../model/path.js'

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
      const config_yaml = YAML.parse(
        fs.readFileSync(`${pluginRoot}/config/config/config.yaml`, 'utf-8')
      )

      // 创建新对象避免引用问题
      let config = JSON.parse(JSON.stringify(config_yaml))

      // 递归读取所有yaml文件
      const configDir = `${pluginRoot}/config/config/prompts`
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }

      const files = getAllFiles(configDir).filter(f => f.endsWith('.yaml'))

      files.forEach(file => {
        const fileName = path.basename(file, '.yaml')
        const content = YAML.parse(fs.readFileSync(file, 'utf-8'))

        // 处理ss默认配置
        if (fileName === 'ss_default') {
          config.ss_Prompt = content.prompt
        }
        // 处理gg默认配置  
        else if (fileName === 'gg_default') {
          config.gg_Prompt = content.prompt
        }
        // 处理ss接口配置
        else if (fileName.startsWith('ss_') && config.ss_APIList) {
          const remark = fileName.slice(3) // 去掉'ss_'前缀
          const ssApi = config.ss_APIList.find(api => api.remark === remark)
          if (ssApi) {
            ssApi.prompt = content.prompt
          }
        }
        // 处理gg接口配置
        else if (fileName.startsWith('gg_') && config.gg_APIList) {
          const remark = fileName.slice(3) // 去掉'gg_'前缀
          const ggApi = config.gg_APIList.find(api => api.remark === remark)
          if (ggApi) {
            ggApi.prompt = content.prompt
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
        const fileName = `ss_${api.remark}`
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
        const fileName = `gg_${api.remark}`
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
          path.join(promptDir, 'ss_default.yaml'),
          YAML.stringify({ prompt: newConfig.ss_Prompt ?? '' })
        )
      }
      delete newConfig.ss_Prompt

      // 检查是否需要更新gg默认prompt
      if ('gg_Prompt' in newConfig) {
        fs.writeFileSync(
          path.join(promptDir, 'gg_default.yaml'),
          YAML.stringify({ prompt: newConfig.gg_Prompt ?? '' })
        )
      }
      delete newConfig.gg_Prompt

      // 保存ss接口prompt
      if (newConfig.ss_APIList) {
        newConfig.ss_APIList.forEach(api => {
          if (api.remark) {
            fs.writeFileSync(
              path.join(promptDir, `ss_${api.remark}.yaml`),
              YAML.stringify({ prompt: api.prompt ?? '' })
            )
            delete api.prompt
          }
        })
      }

      // 保存gg接口prompt
      if (newConfig.gg_APIList) {
        newConfig.gg_APIList.forEach(api => {
          if (api.remark) {
            fs.writeFileSync(
              path.join(promptDir, `gg_${api.remark}.yaml`),
              YAML.stringify({ prompt: api.prompt ?? '' })
            )
            delete api.prompt
          }
        })
      }

      // 清理已删除接口的prompt文件
      const files = getAllFiles(promptDir).filter(f => f.endsWith('.yaml'))
      files.forEach(file => {
        const fileName = path.basename(file, '.yaml')
        if (fileName === 'ss_default' || fileName === 'gg_default') {
          return
        }
        // 处理ss接口文件
        if (fileName.startsWith('ss_')) {
          const remark = fileName.slice(3)
          const exists = newConfig.ss_APIList?.some(api => api.remark === remark)
          if (!exists) {
            fs.unlinkSync(file)
          }
        }
        // 处理gg接口文件
        else if (fileName.startsWith('gg_')) {
          const remark = fileName.slice(3)
          const exists = newConfig.gg_APIList?.some(api => api.remark === remark)
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
