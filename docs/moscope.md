# 目录

- [目录](#目录)
- [魔搭API推理介绍](#魔搭api推理介绍)
- [配置教程](#配置教程)
- [使用教程](#使用教程)
  - [基础语法](#基础语法)
  - [高级语法](#高级语法)
    - [🎨 让AI绘画成为日常，让创意永不枯竭！✨](#-让ai绘画成为日常让创意永不枯竭)

# 魔搭API推理介绍

- 此项目根据魔搭官方API搭建：[魔搭API推理首页](https://www.modelscope.cn/docs/model-service/API-Inference/intro)
- **实名认证**后每日可免费绘画2000次（但每个模型有独立的次数限制）
- 魔搭目前已经有 5w+ 的模型可供选择 [图生图模型](https://www.modelscope.cn/models?filter=inference_type&page=1&tabKey=task&tasks=image-to-image&type=multi-modal) 、 [文生图模型](https://www.modelscope.cn/models?filter=inference_type&page=1&tabKey=task&tasks=text-to-image-synthesis&type=multi-modal)

# 配置教程

<img width="549" height="795" alt="image" src="https://github.com/user-attachments/assets/843a4565-cd45-4196-9ec2-ccb521d7e34a" />

- 进入 [锅巴插件](https://github.com/guoba-yunzai/guoba-plugin)-sf插件配置-绘画功能(标签页)-DD 绘图插件配置-DD接口列表 中新增一个接口
- ~~在`接口地址`填入 `https://api-inference.modelscope.cn/`~~ （`接口地址` 已经内置，不需要填写）
- 在`接口Key`填入 [你获取的Key/访问令牌](https://modelscope.cn/my/myaccesstoken)
  - 注意要**实名认证**才能拥有每日免费2000次绘画使用的额度（但每个模型有独立的次数限制）
- 在`绘画模型`中填入你在 [图生图模型](https://www.modelscope.cn/models?filter=inference_type&page=1&tabKey=task&tasks=image-to-image&type=multi-modal) 或 [文生图模型](https://www.modelscope.cn/models?filter=inference_type&page=1&tabKey=task&tasks=text-to-image-synthesis&type=multi-modal) 或 中找到的喜欢的模型，点进去例如 [/Qwen/Qwen-Image-Edit-2511](https://www.modelscope.cn/models/Qwen/Qwen-Image-Edit-2511) ，然后复制粘贴 `模型名`
- 在 `文件名` 中填写你喜欢的文件名
- 在 `自定义命令` 中填写你喜欢的自定义命令，例如 `qwenedit`

> [!tip]
> 你可以创建数个不同的自定义指令对应不同的 model

# 使用教程
## 基础语法
- 给Bot发送 `#dqwenedit 将女孩改成炫彩发型` 试试~

## 高级语法
- 常用参数
  - 自定义宽高: `#dqwenedit a white cat, 1920*1080`
  - 开启自动提示词: `#dqwenedit a white cat, --自动提示词开`
  - 负面提示词: `#dqwenedit a white cat, ntags = nsfw, lowres, {bad}, error`
- 高级传参
  - 所有 modelscope 支持的参数都可以通过 `--` 传递给 modelscope : `#dqwenedit a white cat, --model Qwen/Qwen-Image-Edit-2511 --seed 123456 --steps 50 --guidance 0.8 --loras <lora-repo-id>, ntags = nsfw, lowres, {bad}, error`

---

<div align="center">

### 🎨 让AI绘画成为日常，让创意永不枯竭！✨

**[📚 查看插件主页](/) | [💬 加入交流群](https://qm.qq.com/q/unjAw930RO) | [⭐ 给个Star](/)**

</div>

