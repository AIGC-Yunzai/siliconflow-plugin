import Config from "./components/Config.js";
import lodash from "lodash";
import path from "path";
import { pluginRoot } from "./model/path.js";

export function supportGuoba() {
  return {
    pluginInfo: {
      name: 'siliconflow-plugin',
      title: 'SF插件',
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
          label: "SF接口地址",
          bottomHelpMessage: "设置SF接口地址；用于画图和翻译",
          component: "Input",
          componentProps: {
            placeholder: 'https://api.siliconflow.cn/v1',
          },
        },
        {
          field: "sf_keys",
          label: "sf keys",
          bottomHelpMessage: "设置sf的key；登录https://cloud.siliconflow.cn/account/ak 后获取API密钥；用于免费/收费画图；设置多个时可多路并发",
          component: "GSubForm",
          componentProps: {
            multiple: true,
            schemas: [
              {
                field: "sf_key",
                label: "sf key",
                required: true,
                component: "Input",
                bottomHelpMessage: "登录https://cloud.siliconflow.cn/account/ak 后获取API密钥；",
                componentProps: {
                  placeholder: "sk-xxxxxxxxxxxxxxxxxxxxxxxx",
                },
              },
              {
                field: "name",
                label: "名称",
                component: "Input",
                required: false,
              },
              {
                field: "remark",
                label: "备注",
                component: "Input",
                required: false,
              },
              {
                field: "isDisable",
                label: "是否禁用",
                component: "Switch",
                required: false,
              },
            ],
          },
        },
        {
          field: "generatePrompt",
          label: "SF自动提示词",
          bottomHelpMessage: "启用自动提示词；在画图时根据文本自动使用提示词模型生成英文提示词",
          component: "Switch",
        },
        {
          field: "sf_textToPaint_Prompt",
          label: "SF提示词prompt",
          bottomHelpMessage: "自定义你的提示词prompt",
          component: "InputTextArea",
        },
        {
          field: "free_mode",
          label: "SF大图模式",
          bottomHelpMessage: "开启后可以绘制更大的图片和更多的步数；注意额度消耗；指令：2048*2048 或 步数30",
          component: "Switch",
        },
        {
          field: "simpleMode",
          label: "SF简洁模式",
          bottomHelpMessage: "开启后合并输出图片与prompt，且不提示进入绘画队列",
          component: "Switch",
        },
        {
          field: "num_inference_steps",
          label: "SF推理步数",
          bottomHelpMessage: "设置默认推理步数；注意额度消耗",
          component: "InputNumber",
          componentProps: {
            min: 1,
            step: 1,
          },
        },
        {
          field: "translateModel",
          label: "SF提示词模型",
          bottomHelpMessage: "在画图时输入的提示词是中文的时候自动使用提示词模型",
          component: "Select",
          componentProps: {
            options: [
              { label: "零一万物/Yi-1.5-6B-Chat（免费）", value: "01-ai/Yi-1.5-6B-Chat" },
              { label: "零一万物/Yi-1.5-9B-Chat-16K（免费）", value: "01-ai/Yi-1.5-9B-Chat-16K" },
              { label: "Vendor-A/通义千问/Qwen2-72B-Instruct（免费）", value: "Vendor-A/Qwen/Qwen2-72B-Instruct" },
              { label: "通义千问/Qwen2-1.5B-Instruct（免费）", value: "Qwen/Qwen2-1.5B-Instruct" },
              { label: "通义千问/Qwen2-7B-Instruct（免费）", value: "Qwen/Qwen2-7B-Instruct" },
              { label: "通义千问/Qwen2.5-7B-Instruct（免费）", value: "Qwen/Qwen2.5-7B-Instruct" },
              { label: "通义千问/Qwen2.5-Coder-7B-Instruct（免费）", value: "Qwen/Qwen2.5-Coder-7B-Instruct" },
              { label: "智谱AI/chatglm3-6b（免费）", value: "THUDM/chatglm3-6b" },
              { label: "智谱AI/glm-4-9b-chat（免费）", value: "THUDM/glm-4-9b-chat" },
              { label: "internlm/internlm2_5-7b-chat（免费）", value: "internlm/internlm2_5-7b-chat" },
              { label: "深度求索/DeepSeek-V2-Chat", value: "deepseek-ai/DeepSeek-V2-Chat" },
              { label: "深度求索/DeepSeek-Coder-V2-Instruct", value: "deepseek-ai/DeepSeek-Coder-V2-Instruct" },
              { label: "深度求索/DeepSeek-V2.5", value: "deepseek-ai/DeepSeek-V2.5" },
              { label: "零一万物/Yi-1.5-34B-Chat-16K", value: "01-ai/Yi-1.5-34B-Chat-16K" },
              { label: "中国电信/DianXin-V1-Chat", value: "DianXin/DianXin-V1-Chat" },
              { label: "Pro/零一万物/Yi-1.5-6B-Chat", value: "Pro/01-ai/Yi-1.5-6B-Chat" },
              { label: "Pro/零一万物/Yi-1.5-9B-Chat-16K", value: "Pro/01-ai/Yi-1.5-9B-Chat-16K" },
              { label: "Pro/通义千问/Qwen2-1.5B-Instruct", value: "Pro/Qwen/Qwen2-1.5B-Instruct" },
              { label: "Pro/通义千问/Qwen2-7B-Instruct", value: "Pro/Qwen/Qwen2-7B-Instruct" },
              { label: "Pro/通义千问/Qwen2.5-7B-Instruct", value: "Pro/Qwen/Qwen2.5-7B-Instruct" },
              { label: "通义千问/Qwen2-57B-A14B-Instruct", value: "Qwen/Qwen2-57B-A14B-Instruct" },
              { label: "通义千问/Qwen2-72B-Instruct", value: "Qwen/Qwen2-72B-Instruct" },
              { label: "通义千问/Qwen2-Math-72B-Instruct", value: "Qwen/Qwen2-Math-72B-Instruct" },
              { label: "通义千问/Qwen2.5-14B-Instruct", value: "Qwen/Qwen2.5-14B-Instruct" },
              { label: "通义千问/Qwen2.5-32B-Instruct", value: "Qwen/Qwen2.5-32B-Instruct" },
              { label: "通义千问/Qwen2.5-72B-Instruct", value: "Qwen/Qwen2.5-72B-Instruct" },
              { label: "通义千问/Qwen2.5-72B-Instruct-128K", value: "Qwen/Qwen2.5-72B-Instruct-128K" },
              { label: "通义千问/Qwen2.5-Math-72B-Instruct", value: "Qwen/Qwen2.5-Math-72B-Instruct" },
              { label: "Pro/智谱AI/chatglm3-6b", value: "Pro/THUDM/chatglm3-6b" },
              { label: "Pro/智谱AI/glm-4-9b-chat", value: "Pro/THUDM/glm-4-9b-chat" },
              { label: "internlm/internlm2_5-20b-chat", value: "internlm/internlm2_5-20b-chat" }
            ],
          },
        },
        {
          field: "imageModel",
          label: "SF绘图模型",
          bottomHelpMessage: "flux设置绘图模型",
          component: "Select",
          componentProps: {
            options: [
              { label: "black-forest-labs/FLUX.1-dev", value: "black-forest-labs/FLUX.1-dev" },
              { label: "Pro/black-forest-labs/FLUX.1-schnell", value: "Pro/black-forest-labs/FLUX.1-schnell" },
              { label: "black-forest-labs/FLUX.1-schnell（免费）", value: "black-forest-labs/FLUX.1-schnell" },
              { label: "stabilityai/sd-turbo（免费）", value: "stabilityai/sd-turbo" },
              { label: "stabilityai/sdxl-turbo（免费）", value: "stabilityai/sdxl-turbo" },
              { label: "stabilityai/stable-diffusion-2-1（免费/图生图）", value: "stabilityai/stable-diffusion-2-1" },
              { label: "stabilityai/stable-diffusion-3-medium（免费/图生图）", value: "stabilityai/stable-diffusion-3-medium" },
              { label: "stabilityai/stable-diffusion-xl-base-1.0（免费/图生图）", value: "stabilityai/stable-diffusion-xl-base-1.0" }
            ],
          },
        },
        {
          component: "Divider",
          label: "MJ 相关配置",
          componentProps: {
            orientation: "left",
            plain: true,
          },
        },
        {
          field: "mj_apiBaseUrl",
          label: "MJ接口地址",
          bottomHelpMessage: "设置MJ接口地址，用于MJ画图；可选：https://ai.trueai.org （免费无key但每一张图片5分钟）或 https://api.ephone.ai",
          component: "Input",
          componentProps: {
            placeholder: 'https://ai.trueai.org',
          },
        },
        {
          field: "mj_apiKey",
          label: "MJ接口Key",
          bottomHelpMessage: "你的账户的API Key",
          component: "Input",
          componentProps: {
            placeholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxx',
          },
        },
        {
          field: "mj_mode",
          label: "MJ绘画模式",
          bottomHelpMessage: "MJ绘画模式",
          component: "Select",
          componentProps: {
            options: [
              { label: "fast", value: "fast" },
              { label: "slow", value: "slow" },
            ],
          },
        },
        {
          field: "mj_translationEnabled",
          label: "MJ自动提示词",
          bottomHelpMessage: "启用自动提示词；在画图时根据文本自动使用提示词模型生成英文提示词",
          component: "Switch",
        },
        {
          field: "mj_translationBaseUrl",
          label: "MJ提示词接口地址",
          bottomHelpMessage: "填写提供标准openAI API的接口地址",
          component: "Input",
          componentProps: {
            placeholder: 'https://',
          },
        },
        {
          field: "mj_translationKey",
          label: "MJ提示词接口Key",
          bottomHelpMessage: "填写提供标准openAI API的接口Key",
          component: "Input",
          componentProps: {
            placeholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxx',
          },
        },
        {
          field: "mj_translationModel",
          label: "MJ提示词模型",
          bottomHelpMessage: "填写提供标准openAI API的接口的模型",
          component: "Input",
          componentProps: {
            placeholder: 'gpt-4o',
          },
        },
        {
          label: 'fish.audio的设置',
          component: 'Divider'
        },
        {
          field: "fish_HandlerOn",
          label: "Fish语音开关",
          bottomHelpMessage: "开启chatgpt-插件 Fish语音合成后处理器，用于在对话中自动合成语音（需要配置key且chatgpt插件内云转码设置为“文件”）",
          component: "Switch",
        },
        {
          field: 'fishApiKey',
          label: 'Api Key',
          bottomHelpMessage: '收费，API KEY获取地址：https://fish.audio/zh-CN/go-api/api-keys',
          component: 'Input'
        },
        {
          field: 'fish_reference_id',
          label: '发音人ID',
          bottomHelpMessage: '这里填入你想要的模型model的代码，例如派蒙的是efc1ce3726a64bbc947d53a1465204aa；说明：api.fish.audio 不受 vits默认角色 控制，仅由 发音人ID 决定其发音人；可用指令：#搜索fish发音人[名称]',
          component: 'Input'
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
        config.sf_keys = data['sf_keys']
        config.sfBaseUrl = config.sfBaseUrl.replace(/\/$/, '')
        config.mj_apiBaseUrl = config.mj_apiBaseUrl.replace(/\/$/, '')
        config.mj_translationBaseUrl = config.mj_translationBaseUrl.replace(/\/$/, '')
        Config.setConfig(config)
        return Result.ok({}, '保存成功~')
      },
    },
  }
}
