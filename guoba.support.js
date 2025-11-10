import Config from "./components/Config.js";
import lodash from "lodash";
import path from "path";
import { pluginRoot } from "./model/path.js";

const geminiModelsByFetch = Config.getConfig()?.geminiModelsByFetch

export function supportGuoba() {
  return {
    pluginInfo: {
      name: 'SF-plugin',
      title: 'SF插件',
      author: ['@Misaka20002', '@syfantasy', '@eggacheb'],
      authorLink: ['https://github.com/Misaka20002', 'https://github.com/syfantasy', 'https://github.com/eggacheb'],
      link: 'https://github.com/Misaka20002/siliconflow-plugin',
      isV3: true,
      isV2: false,
      showInMenu: true,
      description: '基于 Yunzai 的 Synaptic Fusion 插件。SF插件——对接万物',
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
          label: '绘画功能',
          component: 'SOFT_GROUP_BEGIN'
        },
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
          field: "free_mode",
          label: "SF大图模式",
          bottomHelpMessage: "开启后可以绘制更大的图片和更多的步数；注意额度消耗；指令：2048*2048 或 步数30",
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
          field: "imageModel",
          label: "SF绘图模型",
          bottomHelpMessage: "SF设置绘图模型，同步自 https://cloud.siliconflow.cn/models?types=to-image ",
          component: "Select",
          componentProps: {
            options: [
              { label: "stabilityai/stable-diffusion-2-1（免费/图生图）", value: "stabilityai/stable-diffusion-2-1" },
              { label: "stabilityai/stable-diffusion-3-medium（免费/图生图）", value: "stabilityai/stable-diffusion-3-medium" },
              { label: "stabilityai/stable-diffusion-3-5-large（免费/图生图）", value: "stabilityai/stable-diffusion-3-5-large" },
              { label: "stabilityai/stable-diffusion-xl-base-1.0（免费/图生图）", value: "stabilityai/stable-diffusion-xl-base-1.0" },
              { label: "deepseek-ai/Janus-Pro-7B（免费）", value: "deepseek-ai/Janus-Pro-7B" },
              { label: "black-forest-labs/FLUX.1-schnell（免费）", value: "black-forest-labs/FLUX.1-schnell" },
              { label: "black-forest-labs/FLUX.1-dev", value: "black-forest-labs/FLUX.1-dev" },
              { label: "LoRA/black-forest-labs/FLUX.1-dev", value: "LoRA/black-forest-labs/FLUX.1-dev" },
              { label: "black-forest-labs/FLUX.1-pro", value: "black-forest-labs/FLUX.1-pro" },
              { label: "Pro/black-forest-labs/FLUX.1-schnell", value: "Pro/black-forest-labs/FLUX.1-schnell" },
              { label: "stabilityai/stable-diffusion-3-5-large-turbo", value: "stabilityai/stable-diffusion-3-5-large-turbo" },
              { label: "Kwai-Kolors/Kolors（免费/文生图）", value: "Kwai-Kolors/Kolors" },
              { label: "Qwen/Qwen-Image", value: "Qwen/Qwen-Image" },
              { label: "Qwen/Qwen-Image-Edit", value: "Qwen/Qwen-Image-Edit" },
              // 添加图生图模型后，还需要添加正则表达式： SF_Painting.js 处理支持图生图模型 match(/.../)
            ],
          },
        },
        {
          field: "generatePrompt",
          label: "开启自动提示词",
          bottomHelpMessage: "sf启用自动提示词；在画图时根据文本自动使用提示词模型生成英文提示词",
          component: "Switch",
        },
        {
          field: "sf_textToPaint_Prompt",
          label: "绘画提示词设定",
          bottomHelpMessage: "sf自定义你的提示词prompt",
          component: "InputTextArea",
        },
        {
          field: "translateModel",
          label: "绘画提示词模型",
          bottomHelpMessage: "sf在画图时输入的提示词是中文的时候自动使用提示词模型，同步自 https://cloud.siliconflow.cn/models?types=chat ",
          component: "Select",
          componentProps: {
            options: [
              { label: "01-ai/Yi-1.5-6B-Chat（免费）", value: "01-ai/Yi-1.5-6B-Chat" },
              { label: "01-ai/Yi-1.5-9B-Chat-16K（免费）", value: "01-ai/Yi-1.5-9B-Chat-16K" },
              { label: "Vendor-A/Qwen/Qwen2-72B-Instruct（免费）", value: "Vendor-A/Qwen/Qwen2-72B-Instruct" },
              { label: "Qwen/Qwen2-1.5B-Instruct（免费）", value: "Qwen/Qwen2-1.5B-Instruct" },
              { label: "Qwen/Qwen2-7B-Instruct（免费）", value: "Qwen/Qwen2-7B-Instruct" },
              { label: "Qwen/Qwen2.5-7B-Instruct（免费）", value: "Qwen/Qwen2.5-7B-Instruct" },
              { label: "Qwen/Qwen2.5-Coder-7B-Instruct（免费）", value: "Qwen/Qwen2.5-Coder-7B-Instruct" },
              { label: "THUDM/chatglm3-6b（免费）", value: "THUDM/chatglm3-6b" },
              { label: "THUDM/glm-4-9b-chat（免费）", value: "THUDM/glm-4-9b-chat" },
              { label: "internlm/internlm2_5-7b-chat（免费）", value: "internlm/internlm2_5-7b-chat" },
              { label: "meta-llama/Meta-Llama-3.1-8B-Instruct（免费）", value: "meta-llama/Meta-Llama-3.1-8B-Instruct" },
              { label: "google/gemma-2-9b-it（免费）", value: "google/gemma-2-9b-it" },
              { label: "AIDC-AI/Marco-o1（免费）", value: "AIDC-AI/Marco-o1" },
              { label: "deepseek-ai/DeepSeek-R1-Distill-Llama-8B（免费）", value: "deepseek-ai/DeepSeek-R1-Distill-Llama-8B" },
              { label: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B（免费）", value: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B" },
              { label: "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B（免费）", value: "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B" },
              { label: "deepseek-ai/DeepSeek-V3", value: "deepseek-ai/DeepSeek-V3" },
              { label: "deepseek-ai/DeepSeek-R1", value: "deepseek-ai/DeepSeek-R1" },
              { label: "Pro/deepseek-ai/DeepSeek-R1", value: "Pro/deepseek-ai/DeepSeek-R1" },
              { label: "Pro/deepseek-ai/DeepSeek-V3", value: "Pro/deepseek-ai/DeepSeek-V3" },
              { label: "deepseek-ai/DeepSeek-V2-Chat", value: "deepseek-ai/DeepSeek-V2-Chat" },
              { label: "deepseek-ai/DeepSeek-Coder-V2-Instruct", value: "deepseek-ai/DeepSeek-Coder-V2-Instruct" },
              { label: "deepseek-ai/DeepSeek-V2.5", value: "deepseek-ai/DeepSeek-V2.5" },
              { label: "deepseek-ai/deepseek-vl2（视觉）", value: "deepseek-ai/deepseek-vl2" },
              { label: "01-ai/Yi-1.5-34B-Chat-16K", value: "01-ai/Yi-1.5-34B-Chat-16K" },
              { label: "DianXin/DianXin-V1-Chat", value: "DianXin/DianXin-V1-Chat" },
              { label: "Pro/01-ai/Yi-1.5-6B-Chat", value: "Pro/01-ai/Yi-1.5-6B-Chat" },
              { label: "Pro/01-ai/Yi-1.5-9B-Chat-16K", value: "Pro/01-ai/Yi-1.5-9B-Chat-16K" },
              { label: "Pro/Qwen/Qwen2-1.5B-Instruct", value: "Pro/Qwen/Qwen2-1.5B-Instruct" },
              { label: "Pro/Qwen/Qwen2-7B-Instruct", value: "Pro/Qwen/Qwen2-7B-Instruct" },
              { label: "Pro/Qwen/Qwen2.5-7B-Instruct", value: "Pro/Qwen/Qwen2.5-7B-Instruct" },
              { label: "Qwen/Qwen2-57B-A14B-Instruct", value: "Qwen/Qwen2-57B-A14B-Instruct" },
              { label: "Qwen/Qwen2-72B-Instruct", value: "Qwen/Qwen2-72B-Instruct" },
              { label: "Qwen/Qwen2-Math-72B-Instruct", value: "Qwen/Qwen2-Math-72B-Instruct" },
              { label: "Qwen/Qwen2.5-14B-Instruct", value: "Qwen/Qwen2.5-14B-Instruct" },
              { label: "Qwen/Qwen2.5-32B-Instruct", value: "Qwen/Qwen2.5-32B-Instruct" },
              { label: "Qwen/Qwen2.5-72B-Instruct", value: "Qwen/Qwen2.5-72B-Instruct" },
              { label: "Qwen/Qwen2.5-72B-Instruct-128K", value: "Qwen/Qwen2.5-72B-Instruct-128K" },
              { label: "Qwen/Qwen2.5-Math-72B-Instruct", value: "Qwen/Qwen2.5-Math-72B-Instruct" },
              { label: "Qwen/QwQ-32B-Preview", value: "Qwen/QwQ-32B-Preview" },
              { label: "Qwen/QVQ-72B-Preview（视觉）", value: "Qwen/QVQ-72B-Preview" },
              { label: "Qwen/Qwen2.5-Coder-32B-Instruct", value: "Qwen/Qwen2.5-Coder-32B-Instruct" },
              { label: "Qwen/Qwen2-VL-72B-Instruct（视觉）", value: "Qwen/Qwen2-VL-72B-Instruct" },
              { label: "Pro/Qwen/Qwen2-VL-7B-Instruct（视觉）", value: "Pro/Qwen/Qwen2-VL-7B-Instruct" },
              { label: "Pro/THUDM/chatglm3-6b", value: "Pro/THUDM/chatglm3-6b" },
              { label: "Pro/THUDM/glm-4-9b-chat", value: "Pro/THUDM/glm-4-9b-chat" },
              { label: "internlm/internlm2_5-20b-chat", value: "internlm/internlm2_5-20b-chat" },
              { label: "OpenGVLab/InternVL2-26B（视觉）", value: "OpenGVLab/InternVL2-26B" },
              { label: "Pro/OpenGVLab/InternVL2-8B（视觉）", value: "Pro/OpenGVLab/InternVL2-8B" },
              { label: "meta-llama/Llama-3.3-70B-Instruct", value: "meta-llama/Llama-3.3-70B-Instruct" },
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
          bottomHelpMessage: "设置MJ接口地址，用于MJ画图；可选：https://ai.trueai.org （免费无key但每一张图片5分钟）",
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
          component: "Divider",
          label: "DD 绘图插件配置",
          componentProps: {
            orientation: "left",
            plain: true,
          },
        },
        {
          field: "dd_APIList",
          label: "DD接口列表",
          bottomHelpMessage: "设置DD绘图的API接口列表，可添加多个接口配置",
          component: "GSubForm",
          componentProps: {
            multiple: true,
            schemas: [
              {
                field: "baseUrl",
                label: "接口地址",
                component: "Input",
                bottomHelpMessage: "设置接口地址，例如：https://api.openai.com/v1/images/generations，https://api.studio.nebius.com/v1/images/generations",
                componentProps: {
                  placeholder: 'https://api.openai.com/v1/images/generations',
                },
              },
              {
                field: "apiKey",
                label: "接口Key",
                component: "Input",
                bottomHelpMessage: "设置接口Key",
                componentProps: {
                  placeholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxx',
                },
              },
              {
                field: "formatType",
                label: "格式类型",
                component: "Select",
                bottomHelpMessage: "选择请求体格式类型，不同类型的接口有不同的请求格式",
                componentProps: {
                  options: [
                    { label: "OpenAI格式", value: "openai" },
                    { label: "Nebius格式", value: "nebius" },
                    { label: "魔塔modelscope", value: "modelscope" },
                  ],
                  defaultValue: "openai",
                },
              },
              {
                field: "enableImageUpload",
                label: "图片上传功能",
                component: "Switch",
                bottomHelpMessage: "开启后支持上传图片给模型，关闭后将忽略消息中的图片",
              },
              {
                field: "model",
                label: "模型",
                component: "Input",
                bottomHelpMessage: "设置模型名称，例如：dall-e-3, black-forest-labs/flux-dev",
                componentProps: {
                  placeholder: 'dall-e-3',
                  defaultValue: 'dall-e-3',
                },
              },
              {
                field: "width",
                label: "图片宽度",
                component: "InputNumber",
                bottomHelpMessage: "设置图片宽度",
                componentProps: {
                  min: 256,
                  max: 1792,
                  step: 64,
                  defaultValue: 1024,
                },
              },
              {
                field: "height",
                label: "图片高度",
                component: "InputNumber",
                bottomHelpMessage: "设置图片高度",
                componentProps: {
                  min: 256,
                  max: 1792,
                  step: 64,
                  defaultValue: 1024,
                },
              },
              {
                field: "n",
                label: "生成数量",
                component: "InputNumber",
                bottomHelpMessage: "设置生成图片的数量（仅OpenAI格式使用，原生的dall-e-3（即官key）只支持生成数量为1，否则报错）",
                componentProps: {
                  min: 1,
                  max: 10,
                  step: 1,
                  defaultValue: 1,
                },
              },
              {
                field: "num_inference_steps",
                label: "推理步数",
                component: "InputNumber",
                bottomHelpMessage: "设置推理步数（仅Nebius等扩展格式使用，OpenAI格式不需要此参数）",
                componentProps: {
                  min: 1,
                  max: 100,
                  step: 1,
                  defaultValue: 28,
                },
              },
              {
                field: "negative_prompt",
                label: "负面提示词",
                component: "InputTextArea",
                bottomHelpMessage: "设置负面提示词（仅Nebius等扩展格式使用，OpenAI格式不需要此参数）",
                componentProps: {
                  defaultValue: "",
                },
              },
              {
                field: "enableGeneratePrompt",
                label: "启用自动提示词",
                component: "Switch",
                bottomHelpMessage: "是否对该接口启用自动提示词功能（开启后将自动优化用户输入的提示词）",
                componentProps: {
                  defaultValue: true,
                },
              },
              {
                field: "response_format",
                label: "响应格式",
                component: "Input",
                bottomHelpMessage: "设置响应格式，例如：b64_json, url（OpenAI和Nebius格式都可使用）",
                componentProps: {
                  placeholder: 'b64_json',
                  defaultValue: 'b64_json',
                },
              },
              {
                field: "response_extension",
                label: "响应扩展",
                component: "Input",
                bottomHelpMessage: "设置响应扩展格式，例如：webp, jpg（仅Nebius等扩展格式使用，OpenAI格式不需要此参数）",
                componentProps: {
                  placeholder: 'webp',
                  defaultValue: 'webp',
                },
              },
              {
                field: "seed",
                label: "随机种子",
                component: "InputNumber",
                bottomHelpMessage: "设置随机种子，-1表示随机（仅Nebius等扩展格式使用，OpenAI格式不需要此参数）",
                componentProps: {
                  min: -1,
                  step: 1,
                  defaultValue: -1,
                },
              },
              {
                field: "extraParams",
                label: "额外参数",
                component: "InputTextArea",
                bottomHelpMessage: "设置额外参数，使用JSON格式，例如：{\"response_format\": \"b64_json\",\"response_extension\": \"webp\",\"num_inference_steps\": 28,\"negative_prompt\": \"\",\"seed\": -1}",
              },
              {
                field: "requestTemplate",
                label: "请求体模板",
                component: "InputTextArea",
                bottomHelpMessage: "设置完整的请求体模板，使用JSON格式。如果设置了此项，将优先使用此模板，忽略上面的参数设置。",
              },
              {
                field: "useTemplateVariables",
                label: "使用模板变量",
                component: "Switch",
                bottomHelpMessage: "开启后会替换模板中的变量，如{{prompt}}、{{width}}等。关闭后将直接使用模板，只替换prompt字段。",
                componentProps: {
                  defaultValue: false,
                },
              },
              {
                field: "authType",
                label: "认证类型",
                component: "Select",
                bottomHelpMessage: "设置API请求的认证类型，影响Authorization请求头的格式",
                componentProps: {
                  options: [
                    { label: "Bearer Token (默认)", value: "bearer" },
                    { label: "Basic Auth", value: "basic" },
                    { label: "API Key", value: "apikey" },
                    { label: "自定义", value: "custom" },
                  ],
                  defaultValue: "bearer",
                },
              },
              {
                field: "authHeaderName",
                label: "认证头名称",
                component: "Input",
                bottomHelpMessage: "设置认证头的名称，默认为'Authorization'",
                componentProps: {
                  placeholder: 'Authorization',
                },
              },
              {
                field: "customAuthValue",
                label: "自定义认证值",
                component: "Input",
                bottomHelpMessage: "当认证类型为'自定义'时，设置完整的认证头值，将直接使用此值作为Authorization头的值",
                componentProps: {
                  placeholder: '例如：Bearer your-token-here',
                },
              },
              {
                field: "customHeaders",
                label: "自定义请求头",
                component: "InputTextArea",
                bottomHelpMessage: "设置其他自定义请求头，使用JSON格式，例如：{\"x-api-version\": \"1.0\", \"custom-header\": \"value\"}",
                componentProps: {
                  placeholder: '{"x-api-version": "1.0"}',
                },
              },
              {
                field: "responseFormat",
                label: "响应格式路径",
                component: "Input",
                bottomHelpMessage: "设置从响应中提取图片数据的路径，例如：images[0].url。如果不设置，将使用默认的解析逻辑。",
              },
              {
                field: "remark",
                label: "文件名",
                component: "Input",
                required: true,
                bottomHelpMessage: "设置接口备注",
              },
              {
                field: "customCommand",
                label: "自定义命令",
                component: "Input",
                required: true,
                rules: [
                  { pattern: '^\\D', message: '自定义命令不能以数字开头（使用数字开头的指令将根据接口序号调用）' },
                ],
                bottomHelpMessage: "可选，设置后可用 #d命令名 来使用此接口，如设置为test则可用#dtest",
              },
              {
                field: "isOnlyMaster",
                label: "仅限主人使用",
                component: "Switch",
                bottomHelpMessage: "开启后仅限主人使用此接口",
              },
              {
                field: 'dd_cdtime',
                label: 'CD时间',
                helpMessage: '单位：秒',
                bottomHelpMessage: '此接口 的CD时间，设置为0则无限制',
                component: "InputNumber",
                componentProps: {
                  min: 0,
                  step: 1,
                },
              },
              {
                field: 'dd_dailyLimit',
                label: '次数限制',
                bottomHelpMessage: '此接口 的每日限制次数，设置为0则无限制，设置为-1则仅限无限制用户使用',
                component: "InputNumber",
                componentProps: {
                  min: -1,
                  step: 1,
                },
              },
              {
                field: 'dd_unlimitedUsers',
                label: '无限制用户ID',
                bottomHelpMessage: '此接口的 主人与无限制用户无CD次数限制，填写用户ID/QQ号',
                component: "GTags",
                componentProps: {
                  placeholder: '请输入用户ID/QQ号',
                  allowAdd: true,
                  allowDel: true,
                  valueParser: ((value) => value.split(',') || []),
                },
              },
              {
                field: 'dd_onlyGroupID',
                label: '白名单群',
                bottomHelpMessage: '仅白名单群可以使用此接口，留空则所有群可用；私聊用群号8888代替',
                component: "GTags",
                componentProps: {
                  placeholder: '请输入群号',
                  allowAdd: true,
                  allowDel: true,
                  valueParser: ((value) => value.split(',') || []),
                },
              },
            ],
          },
        },
        {
          field: 'dd_usingAPI',
          label: '[#dd]使用接口',
          bottomHelpMessage: "选择要使用的接口配置，必须选择一个接口才能使用绘图功能。其他用户可使用指令：#dd接口列表 #dd使用接口[数字]",
          component: 'Select',
          componentProps: {
            options: (Config.getConfig()?.dd_APIList || []).map((item, index) => {
              return { label: item.remark || `接口${index + 1}`, value: index + 1 }
            }).concat([{ label: "请选择一个接口", value: 0 }])
          },
        },
        {
          component: "Divider",
          label: "绘画全局设置",
          componentProps: {
            orientation: "left",
            plain: true,
          },
        },
        {
          field: 'sf_cdtime',
          label: 'CD时间',
          helpMessage: '单位：秒',
          bottomHelpMessage: 'sf绘图/mj绘图 的CD时间，设置为0则无限制',
          component: "InputNumber",
          componentProps: {
            min: 0,
            step: 1,
          },
        },
        {
          field: 'sf_dailyLimit',
          label: '次数限制',
          bottomHelpMessage: 'sf绘图/mj绘图 的每日限制次数，设置为0则无限制，设置为-1则仅限无限制用户使用',
          component: "InputNumber",
          componentProps: {
            min: -1,
            step: 1,
          },
        },
        {
          field: 'sf_unlimitedUsers',
          label: '无限制用户ID',
          bottomHelpMessage: '主人与无限制用户无CD次数限制，填写用户ID/QQ号',
          component: "GTags",
          componentProps: {
            placeholder: '请输入用户ID/QQ号',
            allowAdd: true,
            allowDel: true,
            valueParser: ((value) => value.split(',') || []),
          },
        },
        {
          field: 'sf_onlyGroupID',
          label: '白名单群',
          bottomHelpMessage: '仅白名单群可以使用此接口，留空则所有群可用；私聊用群号8888代替',
          component: "GTags",
          componentProps: {
            placeholder: '请输入群号',
            allowAdd: true,
            allowDel: true,
            valueParser: ((value) => value.split(',') || []),
          },
        },
        {
          field: "simpleMode",
          label: "绘画简洁模式",
          bottomHelpMessage: "开启后合并输出图片与prompt，且不提示进入绘画队列",
          component: "Switch",
        },
        {
          component: "Divider",
          label: "直链功能配置",
          componentProps: {
            orientation: "left",
            plain: true,
          },
        },
        {
          field: "link_domain",
          label: "直链服务器域名",
          bottomHelpMessage: "设置直链服务器域名，用于图片上传和删除，复制并打开这个链接https://huggingface.co/spaces/xiaozhian/slink/tree/main?duplicate=true，可以复制huggingface空间",
          component: "Input",
        },
        {
          field: "zhilOnlyMaster",
          label: "直链仅主人可用",
          bottomHelpMessage: "#直链 指令仅主人可用",
          component: "Switch",
        },
        {
          component: "Divider",
          label: "Jimeng-API",
          componentProps: {
            orientation: "left",
            plain: true,
          },
        },
        {
          field: "Jimeng.base_url",
          label: "Jimeng-API 地址",
          bottomHelpMessage: "该功能需要自行部署Api，根据说明文档 https://github.com/iptag/jimeng-api 部署Api后填入 http://localhost:5100 ；不会部署的可填写本插件已经部署好的地址 https://misaka20001-jimeng-api.hf.space ；支持文生图、图生图、视频生成，指令： #即梦绘画[tags] #即梦绘画帮助 #即梦视频帮助",
          component: "Input",
          componentProps: {
            placeholder: 'http://localhost:5100',
          },
        },
        {
          field: "Jimeng.sessionid",
          label: "Sessionid",
          bottomHelpMessage: "获取Sessionid：打开浏览器，访问 https://jimeng.jianying.com/ai-tool/home/ 登录你的账号，按F12打开开发者工具，切换到 `Application`或 `Storage` 标签页，在左侧展开`Cookies`，点击 `https://jimeng.jianying.com` 找到名为sessionid的cookie值；若有多个 sessionid 用英文逗号分割",
          component: "Input",
        },
        {
          field: 'Jimeng.cdtime',
          label: 'CD时间',
          helpMessage: '单位：秒',
          bottomHelpMessage: '此接口 的CD时间，设置为0则无限制',
          component: "InputNumber",
          componentProps: {
            min: 0,
            step: 1,
          },
        },
        {
          field: 'Jimeng.dailyLimit',
          label: '次数限制',
          bottomHelpMessage: '此接口 的每日限制次数，设置为0则无限制，设置为-1则仅限无限制用户使用',
          component: "InputNumber",
          componentProps: {
            min: -1,
            step: 1,
          },
        },
        {
          field: 'Jimeng.unlimitedUsers',
          label: '无限制用户ID',
          bottomHelpMessage: '此接口的 主人与无限制用户无CD次数限制，填写用户ID/QQ号',
          component: "GTags",
          componentProps: {
            placeholder: '请输入用户ID/QQ号',
            allowAdd: true,
            allowDel: true,
            valueParser: ((value) => value.split(',') || []),
          },
        },
        {
          field: 'Jimeng.onlyGroupID',
          label: '白名单群',
          bottomHelpMessage: '仅白名单群可以使用此接口，留空则所有群可用；私聊用群号8888代替',
          component: "GTags",
          componentProps: {
            placeholder: '请输入群号',
            allowAdd: true,
            allowDel: true,
            valueParser: ((value) => value.split(',') || []),
          },
        },
        {
          label: '对话功能',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          component: "Divider",
          label: "BOT名称触发配置",
          componentProps: {
            orientation: "left",
            plain: true,
          },
        },
        {
          field: "botName",
          label: "BOT名称",
          bottomHelpMessage: "设置BOT的名称，当消息中包含这个名称时会触发对话；如果有多个触发词请用 | 符号进行分隔；留空则关闭；更改后重启生效",
          component: "Input",
          componentProps: {
            placeholder: "小助手",
            allowClear: true,
          },
        },
        {
          field: "toggleAtMode",
          label: "At模式",
          bottomHelpMessage: "开启At模式后，可以直接At Bot使用默认命令对话；更改后重启生效",
          component: "Switch",
        },
        {
          field: "enablePrivateChatAI",
          label: "私聊AI对话开关",
          bottomHelpMessage: "开启/关闭私聊模式下的AI对话功能",
          component: "Switch",
        },
        {
          field: "defaultCommand",
          label: "默认命令",
          bottomHelpMessage: "当触发BOT名字时使用的默认命令，可选：ss 或 gg",
          component: "Select",
          componentProps: {
            options: [
              { label: "使用#ss命令", value: "ss" },
              { label: "使用#gg命令", value: "gg" },
            ],
          },
        },
        {
          field: "autoReply",
          label: "🌟群自动回复",
          bottomHelpMessage: "允许Bot按照概率自动回复群内的消息",
          component: "GSubForm",
          componentProps: {
            multiple: true,
            schemas: [
              {
                field: "groupId",
                label: "群号",
                required: true,
                bottomHelpMessage: "允许的群组的群号",
                component: "Input",
              },
              {
                field: 'enabled',
                label: '开启自动回复',
                bottomHelpMessage: '开启或关闭该群的自动回复',
                component: 'Switch'
              },
              {
                field: "probability",
                label: "自动回复的概率",
                bottomHelpMessage: '判断此群此次自动回复的概率，默认为0.1',
                component: 'InputNumber',
                componentProps: {
                  min: 0,
                  max: 1,
                  step: 0.01
                }
              },
            ],
          },
        },
        {
          component: "Divider",
          label: "[#ss]对话相关配置",
          componentProps: {
            orientation: "left",
            plain: true,
          },
        },
        {
          field: "ss_APIList",
          label: "[#ss]接口列表",
          bottomHelpMessage: "设置#ss[对话]的API接口列表，可添加多个接口配置，填写了的部分会覆盖默认配置，不填则使用默认配置，默认配置是指[#ss]对话接口地址等，每个接口是独立的上下文，只有#ss和#gg的默认配置是共享的上下文",
          component: "GSubForm",
          componentProps: {
            multiple: true,
            schemas: [
              {
                field: "apiBaseUrl",
                label: "接口地址",
                component: "Input",
                bottomHelpMessage: "设置#ss[对话]的API接口地址，兼容所有OpenAI格式的API接口",
                componentProps: {
                  placeholder: 'https://api.siliconflow.cn/v1',
                },
              },
              {
                field: "apiKey",
                label: "接口密钥",
                component: "InputPassword",
                bottomHelpMessage: "设置#ss[对话]的API接口密钥，多个密钥使用英文逗号分割，自动轮询。",
              },
              {
                field: "model",
                label: "接口模型",
                component: "Input",
                bottomHelpMessage: "设置#ss[对话]的API接口模型",
                componentProps: {
                  placeholder: 'gpt-4',
                },
              },
              {
                field: "prompt",
                label: "接口提示词",
                component: "InputTextArea",
                bottomHelpMessage: "设置#ss[对话]的API接口提示词，自动将提示词中的字符串 {{user_name}} 替换为用户昵称/群昵称",
                componentProps: {
                  placeholder: 'You are a helpful assistant, you prefer to speak Chinese',
                },
              },
              {
                field: 'groupContextLength',
                label: '读取群聊天记录数',
                bottomHelpMessage: '允许机器人读取近期的最多群聊聊天记录条数（实际可获取条数取决于适配器）',
                component: 'InputNumber',
                componentProps: {
                  min: 0,
                  step: 1,
                },
              },
              {
                field: "useMarkdown",
                label: "图片对话模式",
                component: "Switch",
                bottomHelpMessage: "开启后将以图片形式显示对话内容，支持markdown格式",
              },
              {
                field: "forwardMessage",
                label: "发送合并消息",
                component: "Switch",
                bottomHelpMessage: "开启后在图片对话模式下会同时转发原始消息",
              },
              {
                field: "quoteMessage",
                label: "引用原消息",
                component: "Switch",
                bottomHelpMessage: "开启后回复时会引用原消息",
              },
              {
                field: "enableImageUpload",
                label: "图片上传功能",
                component: "Switch",
                bottomHelpMessage: "开启后支持上传图片给模型，关闭后将忽略消息中的图片",
              },
              {
                field: "mustNeedImgLength",
                label: "必需图片",
                bottomHelpMessage: "填写该接口必须使用的图片张数，若用户使用该接口时必须附带/引用图片的图片不足，则要求用户发送图片，常用于图生图/图片鉴赏/ControlNet",
                helpMessage: '单位：张',
                component: "InputNumber",
                componentProps: {
                  min: 0,
                  step: 1,
                },
              },
              {
                field: "mustReturnImgRetriesTimes",
                label: "必须返回图片",
                bottomHelpMessage: "重试次数：该接口必须返回图片，若没有返回图片，则执行重试的次数。",
                helpMessage: '单位：重试次数',
                component: "InputNumber",
                componentProps: {
                  min: 0,
                  step: 1,
                },
              },
              {
                field: "forwardThinking",
                label: "转发思考",
                component: "Switch",
                bottomHelpMessage: "开启后会转发思考过程，如果开启图片对话模式，则需要开启发送合并消息",
              },
              {
                field: "useContext",
                label: "上下文功能",
                component: "Switch",
                bottomHelpMessage: "开启后将对该接口保留对话历史记录，默认为关闭",
              },
              {
                field: "remark",
                label: "文件名",
                component: "Input",
                required: true,
                bottomHelpMessage: "接口配置的储存的文件名",
              },
              {
                field: "customCommand",
                label: "自定义命令",
                component: "Input",
                required: true,
                rules: [
                  { pattern: '^\\D', message: '自定义命令不能以数字开头（使用数字开头的指令将根据接口序号调用）' },
                ],
                bottomHelpMessage: "可选，设置后可用 #s命令名 来使用此接口，如设置为test则可用#stest，也可以使用#stest结束对话来结束此接口的对话",
              },
              {
                field: "isOnlyMaster",
                label: "仅限主人使用",
                component: "Switch",
                bottomHelpMessage: "开启后仅限主人使用此接口",
              },
              {
                field: 'cdtime',
                label: 'CD时间',
                helpMessage: '单位：秒',
                bottomHelpMessage: '此接口 的CD时间，设置为0则无限制',
                component: "InputNumber",
                componentProps: {
                  min: 0,
                  step: 1,
                },
              },
              {
                field: 'dailyLimit',
                label: '次数限制',
                bottomHelpMessage: '此接口 的每日限制次数，设置为0则无限制，设置为-1则仅限无限制用户使用',
                component: "InputNumber",
                componentProps: {
                  min: -1,
                  step: 1,
                },
              },
              {
                field: 'unlimitedUsers',
                label: '无限制用户ID',
                bottomHelpMessage: '此接口的 主人与无限制用户无CD次数限制，填写用户ID/QQ号',
                component: "GTags",
                componentProps: {
                  placeholder: '请输入用户ID/QQ号',
                  allowAdd: true,
                  allowDel: true,
                  valueParser: ((value) => value.split(',') || []),
                },
              },
              {
                field: 'onlyGroupID',
                label: '白名单群',
                bottomHelpMessage: '仅白名单群可以使用此接口，留空则所有群可用；私聊用群号8888代替',
                component: "GTags",
                componentProps: {
                  placeholder: '请输入群号',
                  allowAdd: true,
                  allowDel: true,
                  valueParser: ((value) => value.split(',') || []),
                },
              },
            ],
          },
        },
        {
          field: 'ss_usingAPI',
          label: '[#ss]主人使用接口',
          bottomHelpMessage: "选择主人要使用的接口配置；其他用户可使用指令：#sfss接口列表 #sfss使用接口[数字]",
          component: 'Select',
          componentProps: {
            options: (Config.getConfig()?.ss_APIList || []).map((item, index) => {
              return { label: item.remark || `接口${index + 1}`, value: index + 1 }
            }).concat([{ label: "使用默认配置", value: 0 }])
          },
        },
        {
          field: "ss_apiBaseUrl",
          label: "[#ss]对话接口地址",
          bottomHelpMessage: "设置#ss[对话] 的对话API接口地址，兼容所有OpenAI格式的API接口，默认无连续对话功能，如有需要可以打开下面的上下文开关，若不填则使用SF接口",
          component: "Input",
          componentProps: {
            placeholder: 'https://api.siliconflow.cn/v1',
          },
        },
        {
          field: "ss_Key",
          label: "[#ss]对话API Key",
          bottomHelpMessage: "设置#ss 对话的API接口的Key，多个密钥使用英文逗号分割，自动轮询。",
          component: 'InputPassword'
        },
        {
          field: "ss_model",
          label: "[#ss]对话API模型",
          bottomHelpMessage: "设置#ss 对话的API接口模型",
          component: "Input",
          componentProps: {
            placeholder: 'gpt-4',
          },
        },
        {
          field: "ss_Prompt",
          label: "[#ss]对话API提示词",
          bottomHelpMessage: "设置#ss 对话的API接口的提示词/人格/扮演的角色，自动将提示词中的字符串 {{user_name}} 替换为用户昵称/群昵称",
          component: "InputTextArea",
          componentProps: {
            placeholder: 'You are a helpful assistant, you prefer to speak Chinese',
          },
        },
        {
          field: 'ss_groupContextLength',
          label: '[#ss]读取群聊天记录数',
          bottomHelpMessage: '允许机器人读取近期的最多群聊聊天记录条数（实际可获取条数取决于适配器）',
          component: 'InputNumber',
          componentProps: {
            min: 0,
            step: 1,
          },
        },
        {
          field: "ss_useMarkdown",
          label: "[#ss]图片对话模式",
          bottomHelpMessage: "开启后将以图片形式显示对话内容，支持markdown格式",
          component: "Switch",
        },
        {
          field: "ss_forwardMessage",
          label: "[#ss]发送合并消息",
          bottomHelpMessage: "开启后在图片对话模式下会同时转发原始消息",
          component: "Switch",
        },
        {
          field: "ss_quoteMessage",
          label: "[#ss]引用原消息",
          bottomHelpMessage: "是否引用原消息",
          component: "Switch",
        },
        {
          field: "ss_enableImageUpload",
          label: "[#ss]图片上传功能",
          bottomHelpMessage: "开启后支持上传图片给模型，关闭后将忽略消息中的图片",
          component: "Switch",
        },
        {
          field: "ss_mustNeedImgLength",
          label: "[#ss]必需图片",
          bottomHelpMessage: "填写该接口必须使用的图片张数，若用户使用该接口时必须附带/引用图片的图片不足，则要求用户发送图片，常用于图生图/图片鉴赏/ControlNet",
          helpMessage: '单位：张',
          component: "InputNumber",
          componentProps: {
            min: 0,
            step: 1,
          },
        },
        {
          field: "ss_mustReturnImgRetriesTimes",
          label: "必须返回图片",
          bottomHelpMessage: "[#ss]重试次数：该接口必须返回图片，若没有返回图片，则执行重试的次数。",
          helpMessage: '单位：重试次数',
          component: "InputNumber",
          componentProps: {
            min: 0,
            step: 1,
          },
        },
        {
          field: "ss_forwardThinking",
          label: "[#ss]转发思考",
          bottomHelpMessage: "是否转发思考过程",
          component: "Switch",
        },
        {
          field: "ss_isOnlyMaster",
          label: "[#ss]仅限主人使用",
          bottomHelpMessage: "开启后默认配置仅限主人使用",
          component: "Switch",
        },
        {
          component: "Divider",
          label: "[#gg]Gemini API配置",
          componentProps: {
            orientation: "left",
            plain: true,
          },
        },
        {
          field: "gg_APIList",
          label: "[#gg]接口列表",
          bottomHelpMessage: "设置#gg[对话]的API接口列表，可添加多个接口配置，填写了的部分会覆盖默认配置，不填则使用默认配置，默认配置是指[#gg]Gemini反代地址等，每个接口是独立的上下文，只有#ss和#gg的默认配置是共享的上下文",
          component: "GSubForm",
          componentProps: {
            multiple: true,
            schemas: [
              {
                field: "apiBaseUrl",
                label: "接口地址",
                component: "Input",
                bottomHelpMessage: "设置#gg[对话]的API接口地址，对https://generativelanguage.googleapis.com 反代，内置反代不可用时可选用： https://gemini.maliy.top",
                componentProps: {
                  placeholder: 'https://gemini.maliy.top',
                },
              },
              {
                field: "apiKey",
                label: "接口密钥",
                component: "InputPassword",
                bottomHelpMessage: "设置#gg[对话]的API接口密钥，Key可以在https://aistudio.google.com/app/apikey获取，多个密钥使用英文逗号分割，自动轮询。",
              },
              {
                field: "model",
                label: "接口模型",
                bottomHelpMessage: '默认值：gemini-2.0-flash；推荐：gemini-exp-1206,gemini-2.0-flash-thinking-exp-01-21；可用模型每日自动更新，立即更新指令：#sf插件立即执行每日自动任务',
                component: 'Select',
                componentProps: {
                  options: geminiModelsByFetch.map(s => { return { label: s, value: s } })
                }
              },
              {
                field: "prompt",
                label: "接口提示词",
                component: "InputTextArea",
                bottomHelpMessage: "设置#gg[对话]的API接口提示词，自动将提示词中的字符串 {{user_name}} 替换为用户昵称/群昵称",
                componentProps: {
                  placeholder: '你是一个有用的助手，你更喜欢说中文。你会根据用户的问题，通过搜索引擎获取最新的信息来回答问题。你的回答会尽可能准确、客观。',
                },
              },
              {
                field: 'groupContextLength',
                label: '读取群聊天记录数',
                bottomHelpMessage: '允许机器人读取近期的最多群聊聊天记录条数（实际可获取条数取决于适配器）',
                component: 'InputNumber',
                componentProps: {
                  min: 0,
                  step: 1,
                },
              },
              {
                field: "useMarkdown",
                label: "图片对话模式",
                component: "Switch",
                bottomHelpMessage: "开启后将以图片形式显示对话内容，支持markdown格式",
              },
              {
                field: "forwardMessage",
                label: "发送合并消息",
                component: "Switch",
                bottomHelpMessage: "开启后在图片对话模式下会同时转发原始消息",
              },
              {
                field: "quoteMessage",
                label: "引用原消息",
                component: "Switch",
                bottomHelpMessage: "开启后回复时会引用原消息",
              },
              {
                field: "useSearch",
                label: "搜索功能",
                component: "Switch",
                bottomHelpMessage: "开启后Gemini将使用搜索引擎获取最新信息来回答问题，仅限gemini-2.0-flash-exp模型及后续支持该功能的模型",
              },
              {
                field: "enableImageUpload",
                label: "图片上传功能",
                component: "Switch",
                bottomHelpMessage: "开启后支持上传图片给模型，关闭后将忽略消息中的图片",
              },
              {
                field: "mustNeedImgLength",
                label: "必需图片",
                bottomHelpMessage: "填写该接口必须使用的图片张数，若用户使用该接口时必须附带/引用图片的图片不足，则要求用户发送图片，常用于图生图/图片鉴赏/ControlNet",
                helpMessage: '单位：张',
                component: "InputNumber",
                componentProps: {
                  min: 0,
                  step: 1,
                },
              },
              {
                field: "enableImageGeneration",
                label: "文生图功能",
                component: "Switch",
                bottomHelpMessage: "开启后Gemini将支持文生图功能，可以生成图片，仅限gemini-2.0-flash-exp模型及后续支持该功能的模型",
              },
              {
                field: "mustReturnImgRetriesTimes",
                label: "必须返回图片",
                bottomHelpMessage: "重试次数：该接口必须返回图片，若没有返回图片，则执行重试的次数。",
                helpMessage: '单位：重试次数',
                component: "InputNumber",
                componentProps: {
                  min: 0,
                  step: 1,
                },
              },
              {
                field: "useContext",
                label: "上下文功能",
                component: "Switch",
                bottomHelpMessage: "开启后将对该接口保留对话历史记录，默认为关闭",
              },
              {
                field: "remark",
                label: "文件名",
                component: "Input",
                required: true,
                bottomHelpMessage: "接口配置的备注说明",
              },
              {
                field: "customCommand",
                label: "自定义命令",
                component: "Input",
                required: true,
                rules: [
                  { pattern: '^\\D', message: '自定义命令不能以数字开头（使用数字开头的指令将根据接口序号调用）' },
                ],
                bottomHelpMessage: "可选，设置后可用 #g命令名 来使用此接口，如设置为test则可用#gtest，也可以使用#gtest结束对话来结束此接口的对话",
              },
              {
                field: "isOnlyMaster",
                label: "仅限主人使用",
                component: "Switch",
                bottomHelpMessage: "开启后仅限主人使用此接口",
              },
              {
                field: 'cdtime',
                label: 'CD时间',
                helpMessage: '单位：秒',
                bottomHelpMessage: '此接口 的CD时间，设置为0则无限制',
                component: "InputNumber",
                componentProps: {
                  min: 0,
                  step: 1,
                },
              },
              {
                field: 'dailyLimit',
                label: '次数限制',
                bottomHelpMessage: '此接口 的每日限制次数，设置为0则无限制，设置为-1则仅限无限制用户使用',
                component: "InputNumber",
                componentProps: {
                  min: -1,
                  step: 1,
                },
              },
              {
                field: 'unlimitedUsers',
                label: '无限制用户ID',
                bottomHelpMessage: '此接口的 主人与无限制用户无CD次数限制，填写用户ID/QQ号',
                component: "GTags",
                componentProps: {
                  placeholder: '请输入用户ID/QQ号',
                  allowAdd: true,
                  allowDel: true,
                  valueParser: ((value) => value.split(',') || []),
                },
              },
              {
                field: 'onlyGroupID',
                label: '白名单群',
                bottomHelpMessage: '仅白名单群可以使用此接口，留空则所有群可用；私聊用群号8888代替',
                component: "GTags",
                componentProps: {
                  placeholder: '请输入群号',
                  allowAdd: true,
                  allowDel: true,
                  valueParser: ((value) => value.split(',') || []),
                },
              },
            ],
          },
        },
        {
          field: 'gg_usingAPI',
          label: '[#gg]主人使用接口',
          bottomHelpMessage: "选择主人要使用的接口配置；其他用户可使用指令：#sfgg接口列表 #sfgg使用接口[数字]",
          component: 'Select',
          componentProps: {
            options: (Config.getConfig()?.gg_APIList || []).map((item, index) => {
              return { label: item.remark || `接口${index + 1}`, value: index + 1 }
            }).concat([{ label: "使用默认配置", value: 0 }])
          },
        },
        {
          field: "ggBaseUrl",
          label: "[#gg]Gemini反代地址",
          bottomHelpMessage: "设置#gg[对话] 的API接口地址，对https://generativelanguage.googleapis.com 反代；留空则使用内置地址，内置反代不可用时可选用： https://gemini.maliy.top",
          component: "Input",
          componentProps: {
            placeholder: 'https://gemini.maliy.top',
          },
        },
        {
          field: "ggKey",
          label: "[#gg]Gemini API Key",
          bottomHelpMessage: "设置#gg 对话的API接口的Key，Key可以在https://aistudio.google.com/app/apikey获取；留空则使用内置Key，多个密钥使用英文逗号分割，自动轮询。",
          component: 'InputPassword',
        },
        {
          field: 'gg_model',
          label: '[#gg]gemini模型',
          bottomHelpMessage: '默认值：gemini-2.0-flash；推荐：gemini-exp-1206,gemini-2.0-flash-thinking-exp-01-21；可用模型每日自动更新，立即更新指令：#sf插件立即执行每日自动任务',
          component: 'Select',
          componentProps: {
            options: geminiModelsByFetch.map(s => { return { label: s, value: s } })
          }
        },
        {
          field: "gg_Prompt",
          label: "[#gg]对话API提示词",
          bottomHelpMessage: "设置#gg 对话的API接口的系统提示词，自动将提示词中的字符串 {{user_name}} 替换为用户昵称/群昵称",
          component: "InputTextArea",
          componentProps: {
            placeholder: '你是一个有用的助手，你更喜欢说中文。你会根据用户的问题，通过搜索引擎获取最新的信息来回答问题。你的回答会尽可能准确、客观。',
          },
        },
        {
          field: 'gg_groupContextLength',
          label: '[#gg]读取群聊天记录数',
          bottomHelpMessage: '允许机器人读取近期的最多群聊聊天记录条数（实际可获取条数取决于适配器）',
          component: 'InputNumber',
          componentProps: {
            min: 0,
            step: 1,
          },
        },
        {
          field: "gg_useMarkdown",
          label: "[#gg]图片对话模式",
          bottomHelpMessage: "开启后将以图片形式显示对话内容，支持markdown格式",
          component: "Switch",
        },
        {
          field: "gg_forwardMessage",
          label: "[#gg]发送合并消息",
          bottomHelpMessage: "开启后在图片对话模式下会同时转发原始消息",
          component: "Switch",
        },
        {
          field: "gg_quoteMessage",
          label: "[#gg]引用原消息",
          bottomHelpMessage: "开启后回复时会引用原消息",
          component: "Switch",
        },
        {
          field: "gg_useSearch",
          label: "[#gg]搜索功能",
          bottomHelpMessage: "开启后Gemini将使用搜索引擎获取最新信息来回答问题，仅限gemini-2.0-flash-exp模型及后续支持该功能的模型",
          component: "Switch",
        },
        {
          field: "gg_enableImageUpload",
          label: "[#gg]图片上传功能",
          bottomHelpMessage: "开启后支持上传图片给模型，关闭后将忽略消息中的图片",
          component: "Switch",
        },
        {
          field: "gg_mustNeedImgLength",
          label: "[#gg]必需图片",
          bottomHelpMessage: "填写该接口必须使用的图片张数，若用户使用该接口时必须附带/引用图片的图片不足，则要求用户发送图片，常用于图生图/图片鉴赏/ControlNet",
          helpMessage: '单位：张',
          component: "InputNumber",
          componentProps: {
            min: 0,
            step: 1,
          },
        },
        {
          field: "gg_enableImageGeneration",
          label: "[#gg]文生图功能",
          bottomHelpMessage: "开启后Gemini将支持文生图功能，可以生成图片，仅限gemini-2.0-flash-exp模型及后续支持该功能的模型",
          component: "Switch",
        },
        {
          field: "gg_mustReturnImgRetriesTimes",
          label: "[#gg]必须返回图片",
          bottomHelpMessage: "重试次数：该接口必须返回图片，若没有返回图片，则执行重试的次数。",
          helpMessage: '单位：重试次数',
          component: "InputNumber",
          componentProps: {
            min: 0,
            step: 1,
          },
        },
        {
          field: "gg_isOnlyMaster",
          label: "[#gg]仅限主人使用",
          bottomHelpMessage: "开启后默认配置仅限主人使用",
          component: "Switch",
        },
        {
          component: "Divider",
          label: "对话全局设置",
          componentProps: {
            orientation: "left",
            plain: true,
          },
        },
        {
          field: "gg_ss_useContext",
          label: "上下文功能",
          bottomHelpMessage: "[#ss][#gg]共用，开启后将保留对话历史记录，上下文#gg与#ss的上下文共享",
          component: "Switch",
        },
        {
          field: "gg_maxHistoryLength",
          label: "历史记录条数",
          bottomHelpMessage: "[#ss][#gg]共用，设置保留的历史记录条数，仅保留最近的N条记录；可用指令：#sf结束对话 #sf结束全部对话",
          component: "InputNumber",
          componentProps: {
            min: 1,
            step: 1,
          },
        },
        {
          field: "gg_HistoryExTime",
          label: "历史记录过期时间",
          helpMessage: '单位：小时',
          bottomHelpMessage: "[#ss][#gg]共用，设置保留的历史记录的过期时间；可用指令：#sf结束对话 #sf结束全部对话",
          component: "InputNumber",
          componentProps: {
            min: 1,
            step: 1,
          },
        },
        {
          field: "groupMultiChat",
          label: "群聊多人对话",
          bottomHelpMessage: "开启后群聊中的用户可以在同一话题中与AI聊天，每个群聊都有独立的对话上下文",
          component: "Switch",
        },
        {
          label: '暖群功能',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          component: "Divider",
          label: "群自动打招呼配置",
          componentProps: {
            orientation: "left",
            plain: true,
          },
        },
        {
          field: "groupSayHello.enabled",
          label: "启用自动打招呼",
          bottomHelpMessage: "开启后将在配置的群中定时自动打招呼，使用Gemini生成打招呼内容；更改后重启生效；可用指令：#打招呼配置 #立即打招呼",
          component: "Switch",
        },
        {
          field: 'groupSayHello.cron_time',
          label: '定时表达式配置',
          bottomHelpMessage: '定时打招呼，重启生效，默认每1小时执行一次：0 0 * * * ? *',
          component: 'EasyCron',
          componentProps: {
            placeholder: '请输入或选择Cron表达式',
          },
        },
        {
          field: "groupSayHello.allowGroups",
          label: "🥝群单独设置",
          bottomHelpMessage: "填写允许自动打招呼的群号列表，留空则不在任何群打招呼；可在群内使用 #自动打招呼开启/关闭 来管理",
          component: "GSubForm",
          componentProps: {
            multiple: true,
            schemas: [
              {
                field: "groupId",
                label: "群号",
                required: true,
                bottomHelpMessage: "允许的群组的群号；提示：可以对同一个群配置多个不同接口的配置",
                component: "Input",
              },
              {
                field: 'switchOn',
                label: '开启打招呼',
                bottomHelpMessage: '开启或关闭该群的自动打招呼',
                component: 'Switch'
              },
              {
                field: "replyRate",
                label: "打招呼的概率",
                bottomHelpMessage: '到预定的定时表达式时间后，判断此群此次打招呼的概率，默认为1',
                component: 'InputNumber',
                componentProps: {
                  min: 0,
                  max: 1,
                  step: 0.01
                }
              },
              {
                field: 'usingAPI',
                label: '使用接口',
                bottomHelpMessage: "选择要使用的Gemini接口配置，需要先在 对话功能标签页中设置-[#gg]接口；（如果更改了接口顺序的话，记得也要修改此选项）",
                component: 'Select',
                componentProps: {
                  options: (Config.getConfig()?.gg_APIList || []).map((item, index) => {
                    return { label: item.remark || `接口${index + 1}`, value: index + 1 }
                  }).concat([{ label: "使用默认配置", value: 0 }])
                },
              },
              {
                field: "groupPrompt",
                label: "群单独提示词",
                bottomHelpMessage: '除了接口中的系统提示词外，还可以在这里设置输入提示词。',
                component: "Input",
                componentProps: {
                  placeholder: '请根据以下最近的群聊记录，生成一条像真人一样的回复，长度控制在50字以内，直接输出内容，不要加任何前缀或解释。',
                },
              },
              {
                field: 'trueAtUser',
                label: 'At用户',
                bottomHelpMessage: '在打招呼中真的At用户',
                component: 'Switch'
              },
              {
                field: "botQQArr",
                label: "使用的Bot QQ号",
                bottomHelpMessage: "指定使用哪个Bot发送打招呼消息，留空则使用默认Bot；多个Bot时填写QQ号",
                component: "GTags",
                componentProps: {
                  placeholder: '请输入Bot QQ号',
                  allowAdd: true,
                  allowDel: true,
                  valueParser: ((value) => value.split(',') || []),
                },
              },
            ],
          },
        },
        {
          label: '群自动表情包配置',
          component: 'Divider'
        },
        {
          field: 'autoEmoticons.useEmojiSave',
          label: '启用表情保存',
          bottomHelpMessage: '是否启用表情保存/偷取/发送；更改后重启生效；会自动发送保存在 /data/autoEmoticons/emoji_save/群号/ 和 /data/autoEmoticons/PaimonChuoYiChouPictures/ 目录下的表情包；群单独指令：#哒咩 #自动表情包[开启|关闭] #表情包配置',
          component: 'Switch'
        },
        {
          field: 'autoEmoticons.confirmCount',
          label: '表情确认次数',
          bottomHelpMessage: '在记录时间内接收多少次才保存表情包',
          component: 'InputNumber',
          componentProps: {
            min: 0,
            step: 1
          }
        },
        {
          field: 'autoEmoticons.replyRate',
          label: '发送表情概率',
          bottomHelpMessage: '发送偷取表情的概率',
          component: 'InputNumber',
          componentProps: {
            min: 0,
            max: 1,
            step: 0.01
          }
        },
        {
          field: 'autoEmoticons.sendCD',
          label: '发送表情冷却时间',
          bottomHelpMessage: '发送表情的冷却时间（秒）',
          component: 'InputNumber',
          componentProps: {
            min: 1,
            step: 1
          }
        },
        {
          field: 'autoEmoticons.maxEmojiCount',
          label: '表情包最大数量',
          bottomHelpMessage: '每个群最大的表情包储存数量，储存在 data/autoEmoticons/emoji_save/ 文件夹下',
          component: 'InputNumber',
          componentProps: {
            min: 0,
            step: 1
          }
        },
        {
          field: 'autoEmoticons.maxEmojiSize',
          label: '表情大小限制',
          bottomHelpMessage: '表情包文件大小限制 (MB)',
          component: 'InputNumber',
          componentProps: {
            min: 0,
            step: 1
          }
        },
        {
          field: 'autoEmoticons.allowGroups',
          label: '表情包白名单群',
          bottomHelpMessage: '需要保存和发送表情包的群号列表，为空数组时表示所有群；（推荐设置该选项，设置后支持无触发自动发送表情包，否则只能接受任意信息后概率触发表情包）',
          component: "GTags",
          componentProps: {
            placeholder: '请输入qq群号',
            allowAdd: true,
            allowDel: true,
            valueParser: (value) => value.split(',') || []
          },
        },
        {
          field: 'autoEmoticons.getBotByQQ_targetQQArr',
          label: 'BotQQ号',
          bottomHelpMessage: 'Bot多开qq时指定一个或多个Bot发送表情包，否则将随机使用1个已登录的Bot',
          component: "GTags",
          componentProps: {
            placeholder: '请输入qq号',
            allowAdd: true,
            allowDel: true,
            valueParser: ((value) => value.split(',') || []),
          },
        },
        {
          label: '复读 & 打断复读配置',
          component: 'Divider'
        },
        {
          field: "autoRepeat_config",
          label: "🍓群单独设置",
          bottomHelpMessage: "复读 & 打断复读；群单独指令：#自动复读[开启|关闭] #打断复读[开启|关闭] #自动复读状态",
          component: "GSubForm",
          componentProps: {
            multiple: true,
            schemas: [
              {
                field: "groupId",
                label: "群号",
                required: true,
                bottomHelpMessage: "群号",
                component: "Input",
              },
              {
                field: "enabled",
                label: "自动复读",
                required: false,
                bottomHelpMessage: "是否启用自动复读，默认关闭",
                component: 'Switch'
              },
              {
                field: "triggerCount",
                label: "触发复读的次数",
                required: false,
                bottomHelpMessage: "触发复读的次数，默认3次",
                component: "InputNumber",
                componentProps: {
                  min: 1,
                  step: 1,
                },
              },
              {
                field: "probability",
                label: "复读概率",
                required: false,
                bottomHelpMessage: "复读概率，默认1",
                component: "InputNumber",
                componentProps: {
                  min: 0,
                  max: 1,
                  step: 0.01,
                },
              },
              {
                field: "breakEnabled",
                label: "打断复读",
                required: false,
                bottomHelpMessage: "是否启用打断复读，默认关闭",
                component: 'Switch'
              },
              {
                field: "breakCount",
                label: "打断的次数",
                required: false,
                bottomHelpMessage: "打断的次数，默认5次",
                component: "InputNumber",
                componentProps: {
                  min: 1,
                  step: 1,
                },
              },
              {
                field: "breakProbability",
                label: "打断概率",
                required: false,
                bottomHelpMessage: "打断概率，默认0.8",
                component: "InputNumber",
                componentProps: {
                  min: 0,
                  max: 1,
                  step: 0.01,
                },
              },
              {
                field: "cooldown",
                label: "冷却时间",
                required: false,
                bottomHelpMessage: "冷却时间（秒），默认30秒",
                component: "InputNumber",
                componentProps: {
                  min: 1,
                  step: 1,
                },
              },
            ],
          },
        },
        {
          label: '语音功能',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          label: 'Fish.audio的设置',
          component: 'Divider'
        },
        {
          field: "voiceSwitch",
          label: "语音功能开关",
          bottomHelpMessage: "更改后重启生效",
          component: "Switch",
        },
        {
          field: 'fish_apiKey',
          label: 'Fish ApiKey',
          bottomHelpMessage: '收费，但是用手机号接码后可以获得10刀，API KEY获取地址：https://fish.audio/zh-CN/go-api/api-keys',
          component: 'Input'
        },
        {
          field: 'fish_reference_id',
          label: '发音人ID',
          bottomHelpMessage: '这里填入你想要的模型model的代码，例如派蒙的是efc1ce3726a64bbc947d53a1465204aa；可用指令：#搜索fish音色[名称]',
          component: 'Input'
        },
        {
          field: 'fish_text_blacklist',
          label: '同传文本黑名单',
          bottomHelpMessage: '可以写上你不想发音的句子，例如一些命令反馈',
          component: "GTags",
          componentProps: {
            placeholder: '请输文本',
            allowAdd: true,
            allowDel: true,
            showPrompt: true,
            promptProps: {
              content: '请输文本',
              okText: '添加',
              rules: [
                { required: true, message: '不能为空' },
              ],
            },
            valueParser: ((value) => value.split(',') || []),
          },
        },
        {
          field: "enableTranslation",
          label: "翻译功能开关",
          bottomHelpMessage: "开启翻译功能，将要进行同传的语言变成日语",
          component: "Switch",
        },
        {
          field: "targetLang",
          label: "翻译目标语言",
          bottomHelpMessage: "翻译目标语言",
          component: "Select",
          componentProps: {
            options: [
              { label: "日语", value: "JA" },
              { label: "英语", value: "EN" },
            ],
          },
        },
        {
          label: 'WebSocket服务',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          component: "Divider",
          label: "WebSocket服务配置",
          componentProps: {
            orientation: "left",
            plain: true,
          },
        },
        {
          field: "enableWS",
          label: "启用WebSocket服务",
          bottomHelpMessage: "是否启用WebSocket服务，用于在网页端 https://sf.maliy.top/ 或 https://sfd.maliy.top/ ，进行对话&绘图；如果是从没有ws的版本更新过来的，请重新安装依赖；重启生效",
          component: "Switch",
        },
        {
          field: "wsPort",
          label: "服务端口",
          bottomHelpMessage: "WebSocket服务监听的端口号，默认8081，请确保服务器防火墙开放此端口；重启生效",
          component: "InputNumber",
          componentProps: {
            min: 1,
            max: 65535,
            step: 1,
          },
        },
        {
          field: "wsLogLevel",
          label: "日志级别",
          bottomHelpMessage: "WebSocket服务的日志记录级别；重启生效",
          component: "Select",
          componentProps: {
            options: [
              { label: "调试", value: "debug" },
              { label: "信息", value: "info" },
              { label: "警告", value: "warn" },
              { label: "错误", value: "error" },
            ],
          },
        },
        {
          field: "wsDefaultUser",
          label: "Web端默认用户名",
          bottomHelpMessage: "设置Web端用户的默认昵称，提示词中的字符串 {{user_name}} 会被替换为该用户名；重启生效",
          component: "Input",
          componentProps: {
            placeholder: "小白",
          },
        },
        {
          field: "wsPassword",
          label: "WebSocket密码",
          bottomHelpMessage: "设置WebSocket服务的访问密码，建议修改默认密码；重启生效",
          component: "InputPassword",
          componentProps: {
            placeholder: "请输入访问密码",
          },
        },
        {
          label: '视频解析',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          field: "douyinTV",
          label: "抖音解析",
          bottomHelpMessage: "启用抖音解析；需要安装 Python3 和 依赖 pip install aiohttp ；此开关重启生效",
          component: "Switch",
        },
        {
          field: 'turnOnBilitv',
          label: 'b站解析',
          bottomHelpMessage: '开启b站后，将会解析并发送bilibili链接或小程序关联的视频；此开关重启生效',
          component: 'Switch'
        },
        {
          field: 'video_maxSizeMB',
          label: '视频大小限制',
          bottomHelpMessage: 'b站、抖音解析视频容量超过该值将不会下载，防止发送信息时爆内存重启；此值重启生效',
          helpMessage: '单位：MB',
          component: 'InputNumber',
          componentProps: {
            min: 0,
            step: 1
          }
        },
        {
          label: '帮助',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          component: 'Divider',
          label: '配置教程',
          componentProps: {
            orientation: 'left',
            plain: true,
          },
        },
        {
          field: 'readme',
          label: '插件首页（必读） 🍌',
          component: 'Input',
          componentProps: {
            readonly: true,
            defaultValue: 'https://github.com/AIGC-Yunzai/siliconflow-plugin'
          }
        },
        {
          field: 'tutorial_link',
          label: '绘画&对话接口配置教程 🍈',
          component: 'Input',
          componentProps: {
            readonly: true,
            defaultValue: 'https://aigc-yunzai.me/siliconflow/%E5%A6%82%E4%BD%95%E9%85%8D%E7%BD%AE'
          }
        },
        {
          field: 'mj_helper',
          label: '手办化ai生图配置教程 🍉',
          component: 'Input',
          componentProps: {
            readonly: true,
            defaultValue: 'https://github.com/AIGC-Yunzai/siliconflow-plugin/blob/main/docs/openrouter_ai.md'
          }
        },
        {
          component: 'Divider',
          label: '辅助工具',
          componentProps: {
            orientation: 'left',
            plain: true,
          },
        },
        {
          field: 'tags_link',
          label: 'AI画图Tags生产站 🥭',
          component: 'Input',
          componentProps: {
            readonly: true,
            defaultValue: 'https://nai4-tag-select.pages.dev/'
          }
        },
        {
          field: 'slink_link',
          label: '直链服务器 🍎',
          component: 'Input',
          componentProps: {
            readonly: true,
            defaultValue: 'https://huggingface.co/spaces/xiaozhian/slink/tree/main?duplicate=true'
          }
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

        // 直接赋值所有数组类型的配置项
        config.sf_keys = data['sf_keys']
        config.ss_APIList = data['ss_APIList']
        config.gg_APIList = data['gg_APIList']
        config.dd_APIList = data['dd_APIList']
        config.fish_text_blacklist = data['fish_text_blacklist']
        config.groupSayHello.allowGroups = data['groupSayHello.allowGroups']
        config.autoEmoticons.allowGroups = data['autoEmoticons.allowGroups']
        config.autoEmoticons.getBotByQQ_targetQQArr = data['autoEmoticons.getBotByQQ_targetQQArr']
        config.autoRepeat_config = data['autoRepeat_config']
        config.Jimeng.unlimitedUsers = data['Jimeng.unlimitedUsers']
        config.Jimeng.onlyGroupID = data['Jimeng.onlyGroupID']

        // 验证配置
        try {
          Config.validateConfig(config)
        } catch (err) {
          return Result.ok({}, '配置验证失败: ' + err.message)
        }

        // 其他处理保持不变
        config.sfBaseUrl = config.sfBaseUrl.replace(/\/$/, '')
        config.mj_apiBaseUrl = config.mj_apiBaseUrl.replace(/\/$/, '')
        config.mj_translationBaseUrl = config.mj_translationBaseUrl.replace(/\/$/, '')

        try {
          const saved = Config.setConfig(config)
          if (!saved) {
            return Result.ok({}, '保存失败')
          }
          return Result.ok({}, '保存成功~')
        } catch (err) {
          return Result.ok({}, '保存失败: ' + err.message)
        }
      },
    },
  }
}
