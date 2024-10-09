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
          component: "Input",
          componentProps: {
            placeholder: 'xxxxxxxxxxxxx',
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
