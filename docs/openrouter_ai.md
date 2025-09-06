# 2025年9月5日 OpenRouter.ai 的 google/gemini-2.5-flash-image-preview:free 模型免费3天之后开始收费了...

~~...不过他还有其他的免费模型，也可以参考这篇文章 >///<~~

# OpenRouter.ai 配置教程

> [!TIP]
> 本篇无任何 **邀请码（AFF）**，纯发电
>

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

## 类似 ControlNet 一般控制图片

- 锅巴设置中如下，把 `必需图片` 改为 `2`

    <img width="800" alt="image" src="https://github.com/user-attachments/assets/7360abf1-6ffa-405f-913b-334cc84b385b" />

- 对Bot使用该指令

    <img width="400" alt="image" src="https://github.com/user-attachments/assets/0cf678db-bc68-4cf4-9a87-af38b147d9fa" />

- Bot返回

    <img width="400" alt="image" src="https://github.com/user-attachments/assets/97a0a07d-e1c4-40b4-b9e0-74961ac22142" />

## 自回归生图模型的更多的提示词

- 参考[这篇文章](https://bytedance.larkoffice.com/docx/L4vCdah1DoDg7axVdYGcoplSn9f)
