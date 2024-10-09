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
          field: "drawKey",
          label: "flux设置画图key",
          bottomHelpMessage: "flux设置画图key",
          component: "Input",
          componentProps: {
            placeholder: 'xxxxxxxxxxxxx',
          },
        },
        {
          field: "translateKey",
          label: "flux设置翻译key",
          bottomHelpMessage: "flux设置翻译key",
          component: "Input",
          componentProps: {
            placeholder: 'xxxxxxxxxxxxx',
          },
        },
        {
          field: "translateBaseUrl",
          label: "flux设置翻译源",
          bottomHelpMessage: "flux设置翻译源",
          component: "Input",
          componentProps: {
            placeholder: 'xxxxxxxxxxxxx',
          },
        },
        {
          field: "translateModel",
          label: "flux设置翻译模型",
          bottomHelpMessage: "flux设置翻译模型",
          component: "Input",
          componentProps: {
            placeholder: 'xxxxxxxxxxxxx',
          },
        },
        {
          field: "generatePrompt",
          label: "启用自动prompt",
          bottomHelpMessage: "启用自动prompt",
          component: "Switch",
        },
        {
          field: "imageModel",
          label: "flux设置绘图模型",
          bottomHelpMessage: "flux设置绘图模型",
          component: "Input",
          componentProps: {
            placeholder: 'xxxxxxxxxxxxx',
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
        config.translateBaseUrl = config.translateBaseUrl.replace(/\/$/, '')
        Config.setConfig(config)
        // config 写入内存
        const FLUXDEV_c = new FLUXDEV();
        FLUXDEV_c.saveConfig(config, true)
        return Result.ok({}, '保存成功~')
      },
    },
  }
}
