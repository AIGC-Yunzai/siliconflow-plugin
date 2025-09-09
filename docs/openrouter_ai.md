# 目录

- [目录](#目录)
- [`#s手办化` 接口创建教程](#s手办化-接口创建教程)
  - [2025年9月5日 更新说明](#2025年9月5日-更新说明)
  - [OpenRouter.ai 配置教程](#openrouterai-配置教程)
- [`#g手办化` 接口创建教程](#g手办化-接口创建教程)
- [类似 ControlNet 一般控制图片](#类似-controlnet-一般控制图片)
- [多模态模型的更多的提示词](#多模态模型的更多的提示词)
    - [🎨 让AI绘画成为日常，让创意永不枯竭！✨](#-让ai绘画成为日常让创意永不枯竭)


# `#s手办化` 接口创建教程

> [!TIP]
> 本篇无任何 **邀请码（AFF）**，纯发电
>

## 2025年9月5日 更新说明

- OpenRouter.ai 的 google/gemini-2.5-flash-image-preview:free 开始收费了...
- 不过它还有其他的免费模型，例如参考下面的**配置教程**用免费的 [DeepSeek: DeepSeek V3.1 (free)](https://openrouter.ai/deepseek/deepseek-chat-v3.1:free) 或 [Venice: Uncensored (free)](https://openrouter.ai/cognitivecomputations/dolphin-mistral-24b-venice-edition:free) 玩玩角色扮演对话... >///<

## OpenRouter.ai 配置教程

- 注册并登录 [openrouter.ai](https://openrouter.ai/)
- 创建你的 [key](https://openrouter.ai/settings/keys) 保存备用
- 打开 [models](https://openrouter.ai/models?max_price=0) 找到你想要的模型，例如现在介绍的手办化ai生图模型 [Google: Gemini 2.5 Flash Image Preview (free)](https://openrouter.ai/google/gemini-2.5-flash-image-preview:free)，点击 API 选项卡可以看到此模型的调用方式：
    ```js
    fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
        "Authorization": "Bearer <OPENROUTER_API_KEY>",
        "HTTP-Referer": "<YOUR_SITE_URL>", // Optional. Site URL for rankings on openrouter.ai.
        "X-Title": "<YOUR_SITE_NAME>", // Optional. Site title for rankings on openrouter.ai.
        "Content-Type": "application/json"
    },
    body: JSON.stringify({
        "model": "google/gemini-2.5-flash-image-preview:free",
        "messages": [
        {
            "role": "user",
            "content": [
            {
                "type": "text",
                "text": "What is in this image?"
            },
            {
                "type": "image_url",
                "image_url": {
                "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg"
                }
            }
            ]
        }
        ]
    })
    });
    ```
- 按照图片填入 [锅巴插件](https://github.com/guoba-yunzai/guoba-plugin)-sf插件配置-ss接口列表 中

    <img width="800" alt="image" src="https://github.com/user-attachments/assets/11c60eea-b12a-42c1-83cd-88845558e98b" />

    <img width="800" alt="image" src="https://github.com/user-attachments/assets/28a6354a-e126-47af-bfb5-e00ee9853703" />

    其中提示词为:

    ```
    Please turn this photo into a figure. Behind it, there should be a packaging box with a large clear front window, printed character artwork, the product name, logo, barcode, a small specs or authenticity panel, and a handwriten price tag sticker on one corner. There is also a computer monitor screen at the back, showing the design sketch of the figure. In front of the box, on a round plastic base, place the figure version of the photo I gave you, and the figure must be three-dimensional. I'd like the PVC material to be clearly represented. It would be even better if the background is indoors.
    ```

- 对Bot使用 `#s手办化` 指令即可（可引用图片/附带图片/后续发送图片）

    <img width="400" alt="image" src="https://github.com/user-attachments/assets/b599b948-4ea1-4d38-826d-a164e3fb7400" />

# `#g手办化` 接口创建教程

> [!TIP]
> 连接 Gemini 官网或使用反代
> 
> 其中 `gemini-2.5-flash-image-preview` 模型目前Google对其限时免费，考虑到其属于 flash 类别，将来也许将永久免费
>

- 按照图片填入 [锅巴插件](https://github.com/guoba-yunzai/guoba-plugin)-sf插件配置-gg接口列表 中
  - 其中接口地址留空则优先使用全局 `[#gg]Gemini反代地址`
  - 其中Key填写你的 [GeminiKey](https://aistudio.google.com/app/apikey) 或者留空使用本插件的公益站（如果还有额度的话）
 
    <img width="400" alt="image" src="https://github.com/user-attachments/assets/ac8c2bbd-b560-4023-85e5-9bb29b2e9e58" />


    其中提示词为:

    ```
    Please turn this photo into a figure. Behind it, there should be a packaging box with a large clear front window, printed character artwork, the product name, logo, barcode, a small specs or authenticity panel, and a handwriten price tag sticker on one corner. There is also a computer monitor screen at the back, showing the design sketch of the figure. In front of the box, on a round plastic base, place the figure version of the photo I gave you, and the figure must be three-dimensional. I'd like the PVC material to be clearly represented. It would be even better if the background is indoors.
    ```

- 对Bot使用 `#g手办化` 指令即可（可引用图片/附带图片/后续发送图片）

    <img width="400" alt="image" src="https://github.com/user-attachments/assets/2fd8a3a1-128b-42b2-97f0-571880399da5" />


# 类似 ControlNet 一般控制图片

> [!TIP]
> 同时适用于 `#s` 和 `#g` 接口
>

- 锅巴设置中如下，把 `必需图片` 改为 `2`

    <img width="800" alt="image" src="https://github.com/user-attachments/assets/7360abf1-6ffa-405f-913b-334cc84b385b" />

- 对Bot使用该指令

    <img width="400" alt="image" src="https://github.com/user-attachments/assets/0cf678db-bc68-4cf4-9a87-af38b147d9fa" />

- Bot返回

    <img width="400" alt="image" src="https://github.com/user-attachments/assets/97a0a07d-e1c4-40b4-b9e0-74961ac22142" />

# 多模态模型的更多的提示词

- 参考[这篇文章](https://bytedance.larkoffice.com/docx/L4vCdah1DoDg7axVdYGcoplSn9f)


---

<div align="center">

### 🎨 让AI绘画成为日常，让创意永不枯竭！✨

**[📚 查看插件主页](/) | [💬 加入交流群](https://qm.qq.com/q/unjAw930RO) | [⭐ 给个Star](/)**

</div>

