import Config from "./components/Config.js";
import lodash from "lodash";
import path from "path";
import { pluginRoot } from "./model/path.js";
import { FLUXDEV } from './apps/main_key.js'

export function supportGuoba() {
  return {
    pluginInfo: {
      name: 'siliconflow-plugin',
      title: 'AI绘画插件',
      author: ['@Misaka20002', '@syfantasy'],
      authorLink: ['https://github.com/Misaka20002', 'https://github.com/syfantasy'],
      link: 'https://github.com/Misaka20002/siliconflow-plugin',
      isV3: true,
      isV2: false,
      showInMenu: true,
      description: '基于 Yunzai 的接入 Siliconflow 的插件',
      // 显示图标，此为个性化配置
      // 图标可在 https://icon-sets.iconify.design 这里进行搜索
      icon: 'fluent-emoji-flat:artist-palette',
      // 图标颜色，例：#FF0000 或 rgb(255, 0, 0)
      iconColor: '#000000',
      // 如果想要显示成图片，也可以填写图标路径（绝对路径）
      iconPath: path.join(pluginRoot, 'resources/readme/girl.png'),
    },
    configInfo: {
      schemas: [
        {
          component: "Divider",
          label: "Siliconflow 相关配置",
          componentProps: {
            orientation: "left",
            plain: true,
          },
        },
        {
          field: "sfBaseUrl",
          label: "接口地址",
          bottomHelpMessage: "设置接口地址；用于画图和翻译",
          component: "Input",
          componentProps: {
            placeholder: 'https://api.siliconflow.cn/v1',
          },
        },
        {
          field: "drawKey",
          label: "画图key",
          bottomHelpMessage: "flux设置画图key；登录https://cloud.siliconflow.cn/account/ak 后获取API密钥",
          component: "Input",
          componentProps: {
            placeholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          },
        },
        {
          field: "translateKey",
          label: "翻译key",
          bottomHelpMessage: "flux设置翻译key",
          component: "Input",
          componentProps: {
            placeholder: 'xxxxxxxxxxxxx',
          },
        },
        {
          field: "translateModel",
          label: "翻译模型",
          bottomHelpMessage: "flux设置翻译模型",
          component: "Select",
          componentProps: {
            options: [
             { label: "深度求索/DeepSeek-V2-Chat", value: "deepseek-ai/DeepSeek-V2-Chat" },
             { label: "深度求索/DeepSeek-Coder-V2-Instruct", value: "deepseek-ai/DeepSeek-Coder-V2-Instruct" },
             { label: "深度求索/DeepSeek-V2.5", value: "deepseek-ai/DeepSeek-V2.5" },
             { label: "零一万物/Yi-1.5-34B-Chat-16K", value: "01-ai/Yi-1.5-34B-Chat-16K" },
             { label: "零一万物/Yi-1.5-6B-Chat", value: "01-ai/Yi-1.5-6B-Chat" },
             { label: "零一万物/Yi-1.5-9B-Chat-16K", value: "01-ai/Yi-1.5-9B-Chat-16K" },
             { label: "中国电信/DianXin-V1-Chat", value: "DianXin/DianXin-V1-Chat" },
             { label: "Pro/零一万物/Yi-1.5-6B-Chat", value: "Pro/01-ai/Yi-1.5-6B-Chat" },
             { label: "Pro/零一万物/Yi-1.5-9B-Chat-16K", value: "Pro/01-ai/Yi-1.5-9B-Chat-16K" },
             { label: "Pro/通义千问/Qwen2-1.5B-Instruct", value: "Pro/Qwen/Qwen2-1.5B-Instruct" },
             { label: "Pro/通义千问/Qwen2-7B-Instruct", value: "Pro/Qwen/Qwen2-7B-Instruct" },
             { label: "Pro/通义千问/Qwen2.5-7B-Instruct", value: "Pro/Qwen/Qwen2.5-7B-Instruct" },
             { label: "通义千问/Qwen2-1.5B-Instruct", value: "Qwen/Qwen2-1.5B-Instruct" },
             { label: "通义千问/Qwen2-57B-A14B-Instruct", value: "Qwen/Qwen2-57B-A14B-Instruct" },
             { label: "通义千问/Qwen2-72B-Instruct", value: "Qwen/Qwen2-72B-Instruct" },
             { label: "通义千问/Qwen2-7B-Instruct", value: "Qwen/Qwen2-7B-Instruct" },
             { label: "通义千问/Qwen2-Math-72B-Instruct", value: "Qwen/Qwen2-Math-72B-Instruct" },
             { label: "通义千问/Qwen2.5-14B-Instruct", value: "Qwen/Qwen2.5-14B-Instruct" },
             { label: "通义千问/Qwen2.5-32B-Instruct", value: "Qwen/Qwen2.5-32B-Instruct" },
             { label: "通义千问/Qwen2.5-72B-Instruct", value: "Qwen/Qwen2.5-72B-Instruct" },
             { label: "通义千问/Qwen2.5-72B-Instruct-128K", value: "Qwen/Qwen2.5-72B-Instruct-128K" },
             { label: "通义千问/Qwen2.5-7B-Instruct", value: "Qwen/Qwen2.5-7B-Instruct" },
             { label: "通义千问/Qwen2.5-Coder-7B-Instruct", value: "Qwen/Qwen2.5-Coder-7B-Instruct" },
             { label: "通义千问/Qwen2.5-Math-72B-Instruct", value: "Qwen/Qwen2.5-Math-72B-Instruct" },
             { label: "Pro/智谱AI/chatglm3-6b", value: "Pro/THUDM/chatglm3-6b" },
             { label: "Pro/智谱AI/glm-4-9b-chat", value: "Pro/THUDM/glm-4-9b-chat" },
             { label: "智谱AI/chatglm3-6b", value: "THUDM/chatglm3-6b" },
             { label: "智谱AI/glm-4-9b-chat", value: "THUDM/glm-4-9b-chat" },
             { label: "Vendor-A/通义千问/Qwen2-72B-Instruct", value: "Vendor-A/Qwen/Qwen2-72B-Instruct" },
             { label: "internlm/internlm2_5-20b-chat", value: "internlm/internlm2_5-20b-chat" },
             { label: "internlm/internlm2_5-7b-chat", value: "internlm/internlm2_5-7b-chat" }
            ],
          },
        },
        {
          field: "generatePrompt",
          label: "自动prompt",
          bottomHelpMessage: "启用自动prompt",
          component: "Switch",
        },
        {
          field: "imageModel",
          label: "绘图模型",
          bottomHelpMessage: "flux设置绘图模型",
          component: "Select",
          componentProps: {
            options: [
              { label: "black-forest-labs/FLUX.1-dev", value: "black-forest-labs/FLUX.1-dev" },
              { label: "Pro/black-forest-labs/FLUX.1-schnell", value: "Pro/black-forest-labs/FLUX.1-schnell" },
              { label: "black-forest-labs/FLUX.1-schnell", value: "black-forest-labs/FLUX.1-schnell" },
              { label: "stabilityai/sd-turbo", value: "stabilityai/sd-turbo" },
              { label: "stabilityai/sdxl-turbo", value: "stabilityai/sdxl-turbo" },
              { label: "stabilityai/stable-diffusion-2-1", value: "stabilityai/stable-diffusion-2-1" },
              { label: "stabilityai/stable-diffusion-3-medium", value: "stabilityai/stable-diffusion-3-medium" },
              { label: "stabilityai/stable-diffusion-xl-base-1.0", value: "stabilityai/stable-diffusion-xl-base-1.0" }
            ],
          },
        },
      ],
      getConfigData() {
        let config = Config.getConfig()
        return config
      },

      setConfigData(data, { Result }) {
        let config = {}
        for (let [keyPath, value] of Object.entries(data)) {
          lodash.set(config, keyPath, value)
        }
        config = lodash.merge({}, Config.getConfig(), config)
        config.sfBaseUrl = config.sfBaseUrl.replace(/\/$/, '')
        Config.setConfig(config)
        // config 写入内存
        const FLUXDEV_c = new FLUXDEV();
        FLUXDEV_c.saveConfig(config, true)
        return Result.ok({}, '保存成功~')
      },
    },
  }
}
