# 目录

- [目录](#目录)
- [魔塔API推理介绍](#魔塔api推理介绍)
- [配置教程](#配置教程)
    - [🎨 让AI绘画成为日常，让创意永不枯竭！✨](#-让ai绘画成为日常让创意永不枯竭)

# 魔塔API推理介绍

- 此项目根据魔塔官方API搭建：[魔塔API推理首页](https://www.modelscope.cn/docs/model-service/API-Inference/intro)
- **实名认证**后每日可免费绘画2000次

# 配置教程

> 只需填写 5 个参数即可使用啦>_<

- 进入 [锅巴插件](https://github.com/guoba-yunzai/guoba-plugin)-sf插件配置-绘画功能(标签页)-DD 绘图插件配置-DD接口列表 中新增一个接口
- 在`接口地址`填入 `https://api-inference.modelscope.cn/v1/images/generations`
- 在`接口Key`填入 [你获取的Key/访问令牌](https://modelscope.cn/my/myaccesstoken)
  - 注意要**实名认证**才能拥有每日免费2000次绘画使用的额度
- 在`请求体模板`中填入
```JSON
{
  "model": "MusePublic/14_ckpt_SD_XL",
  "prompt": "loli",
  "negative_prompt": "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry",
  "size": "1080x1440",
  "seed": -1,
  "steps": 30,
  "guidance": 7
}
```
- 在 `文件名` 中填写你喜欢的文件名
- 在 `自定义命令` 中填写你喜欢的自定义命令，例如 `魔塔SDXL绘画`
- 结束！最后给Bot发送 `#d魔塔SDXL绘画 a cute cat girl` 试试~

> [!NOTE]
> 其中 "model" 可以换成你喜欢的其他模型名，这里给你推荐几个哦: `MusePublic/14_ckpt_SD_XL` `ModelE/MiaoMiao-Harem` `atonyxu/Kohaku-XL` `ModelE/Animagine-XL`
> 
> 你可以创建数个不同的自定义指令对应不同的 model


---

<div align="center">

### 🎨 让AI绘画成为日常，让创意永不枯竭！✨

**[📚 查看插件主页](/) | [💬 加入交流群](https://qm.qq.com/q/unjAw930RO) | [⭐ 给个Star](/)**

</div>

