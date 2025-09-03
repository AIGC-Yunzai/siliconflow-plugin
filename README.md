![](https://socialify.git.ci/AIGC-Yunzai/siliconflow-plugin/image?font=KoHo&forks=1&issues=1&language=1&name=1&owner=1&pattern=Circuit%20Board&pulls=1&stargazers=1&theme=Auto)

# SiliconFlow-PLUGIN(SF-PLUGIN ——对接万物) 🍓

<img decoding="async" align=right src="resources/readme/girl.png" width="35%">

- 一个适用于 [Yunzai 系列机器人框架](https://github.com/yhArcadia/Yunzai-Bot-plugins-index) 多功能AI集成插件，支持多种AI服务和模型：
  - 🎨 AI绘图：支持SiliconFlow、Midjourney等多个绘图模型，支持文生图和图生图
  - 🤖 智能对话：集成多种对话模型，支持历史记录、用户昵称获取、预设列表快速切换，预设拥有独立上下文，结合Markdown图片输出以获得沉浸式角色扮演体验
  - 🔍 实时搜索：通过#gg命令实现智能搜索和信息聚合
  - 🗣️ 语音合成：集成Fishaudio的高质量TTS服务
  - 📊 资源管理：支持多key负载均衡，提供图片直链获取等功能
  - 🔗 链接处理：自动提取和处理消息中的URL
  - 📱 视频解析：支持抖音、哔哩哔哩视频解析
  - ⚡ WebSocket：支持WebSocket与前端通信实现实时对话与绘图，详情看[前端地址](https://sf.maliy.top)，[部署教程](https://github.com/AIGC-Yunzai/SF-WEB)


## 安装插件

#### 1. 克隆仓库

```
git clone https://github.com/AIGC-Yunzai/siliconflow-plugin.git ./plugins/siliconflow-plugin
```

> [!NOTE]
> 如果你的网络环境较差，无法连接到 Github，可以使用 [GitHub Proxy](https://ghproxy.link/) 提供的文件代理加速下载服务：
>
> ```bash
> git clone https://ghfast.top/https://github.com/AIGC-Yunzai/siliconflow-plugin.git ./plugins/siliconflow-plugin
> ```
> 如果已经下载过本插件需要修改代理加速下载服务地址，在插件根目录使用：
> ```bash
> git remote set-url origin https://ghfast.top/https://github.com/AIGC-Yunzai/siliconflow-plugin.git
> ```

#### 2. 安装依赖

```
pnpm install --filter=siliconflow-plugin
```

#### 3. 安装 Python 与依赖（可选）

- `抖音解析` 功能将调用 Python 对 抖音视频进行解析

```sh
# Ubuntu 中安装 Python 的方法
sudo apt update
sudo apt install python3  # 安装最新 Python 3
sudo apt install python3-venv python3-pip  # 安装虚拟环境和 pip
# 安装依赖（依赖约5MB）
pip install aiohttp
```

## 插件配置

> [!WARNING]
> 非常不建议手动修改配置文件，本插件已兼容 [Guoba-plugin](https://github.com/guoba-yunzai/guoba-plugin) ，请使用锅巴插件对配置项进行修改

## 功能列表

<img decoding="async" align=right src="https://github.com/user-attachments/assets/9698e837-49e7-4c19-8dab-6aa17d1faed4" width="35%">

请使用 `#sf帮助` 获取完整帮
- [x] `#sf绘画[tags][引用图片]` 使用sf接口绘画
- [x] `#mjp[tags]` 使用MJ接口绘画
- [x] `#gg[gemini提问/实时搜索]`
- [x] `#ss[自定义gpt-api接口提问]`
- [x] 自动 Fishaudio 语音合成
- [x] `#直链[引用图片]` 图片直链获取
- [X] 支持接口列表，方便快速切换预设，预设具有独立的上下文
  - 例如自定义一个生成图片prompt的命令 `#gtag 一个美丽的女孩`
- [X] 自动抖音/b站视频解析
- [ ] TODO..

## 使用教程

<img decoding="async" align=right src="https://github.com/user-attachments/assets/f8d8a42f-6c5d-4fa1-a18e-ea2403f6dd6c" width="35%">

#### 接口配置教程

> [!TIP]
> 绘画&对话接口配置教程：[SiliconFlow](https://aigc-yunzai.dwe.me/)
> 
> 手办化ai生图配置教程：[OpenRouter.ai](./docs/openrouter_ai.md)
> 
> Gemini配置教程：已经内置[gemini](https://generativelanguage.googleapis.com)公益站，无需key直接使用
> 

#### 绘画辅助工具
- [AI画图Tags生产站](https://nai4-tag-select.pages.dev/) 🥭
- [直链服务器，一键复制huggingface空间](https://huggingface.co/spaces/xiaozhian/slink/tree/main?duplicate=true) 🍉

<details>
<summary>点击展开更多绘画教程</summary>

- [Stable Diffusion教程](https://waytoagi.feishu.cn/wiki/FUQAwxfH9iXqC9k02nYcDobonkf) 🍇
- [Midjourney基础教程](https://waytoagi.feishu.cn/wiki/VUadwndc5iRJktkzaYPcaLEynZc) 🍊
- [MJ prompt参考](https://waytoagi.feishu.cn/wiki/FUQAwxfH9iXqC9k02nYcDobonkf) 🍎
- [Midjourney V6 prompt参考](https://aituts.com/midjourney-v6/) 🍐
- [又一个prompt参考站](https://catjourney.life/all) 🍌
- [Midjourney Prompt生成器](https://promptfolder.com/midjourney-prompt-helper/) 🥝
- [MJ和SD Prompt生成器相关合集](https://waytoagi.feishu.cn/wiki/TQogw5uIziB4fykbGhSciaQfndm?table=tbl5kMFjDDdeYoAt&view=vew8AJm3cI) 🍑

</details>

## 常见问题

1.  在锅巴中点击保存时提示 `PayloadTooLargeError` 怎么办?
    - 最新版的锅巴插件[已经修复](https://github.com/guoba-yunzai/guoba-plugin/commit/50f3a847fdba22534d37b97f2ac62b8fdb5c4d41)这个问题了，如果你已经更新到最新版的锅巴插件依然出现这个问题，考虑是你的平台更改了`bodyParser`值，可以[查看这里](https://github.com/AIGC-Yunzai/Trss-Yunzai-lagrange)进行修复。
2. 如果是低版本的icqq，图生图和直链无法获取图链怎么办？
   
   - 请使用以下脚本，在 Yunzai 根目录执行即可
      ```
      curl -sL Gitee.com/eggacheb/parser/raw/master/ver | bash
      ```

## 支持与贡献

如果你喜欢这个项目，请不妨点个 Star🌟，这是对开发者最大的动力。

有意见或者建议也欢迎提交 [Issues](https://github.com/AIGC-Yunzai/siliconflow-plugin/issues) 和 [Pull requests](https://github.com/AIGC-Yunzai/siliconflow-plugin/pulls)。

## 感谢

- [Fish-Audio](https://fish.audio)：Brand new TTS solution
- [vits-plugin](https://github.com/erzaozi/vits-plugin)：一个适用于 Yunzai 系列机器人框架 的的 AI 语音合成插件，让你能够在机器人中使用 AI 语音合成功能；Fishaudio语音同传的方式绝大部分参考了该项目的实现方法，Fish-Audio.json也是直接用的该项目的，很是感谢！
- [paimonnai-plugin](https://github.com/misaka20002/paimonnai-plugin)：借鉴其 Config.js 优化超大 Prompts 时的硬盘读写、成员管理、 Bot 操作源码等。
- [midjourney-proxy](https://github.com/trueai-org/midjourney-proxy)：一个开源的MJ代理项目，同时提供了免费的公益API站点，让更多人能够体验AI绘画的乐趣！
- [Aliorpse](https://gitee.com/Aliorpse/Yunzai-AliorpsePlugins/blob/master/bilitv.js)：Aliorpse 开发的云崽上轻量，快速的b站解析插件
- [astrbot_plugin_douyin_bot](https://github.com/drdon1234/astrbot_plugin_douyin_bot)：AstrBot插件，自动识别抖音链接并转换为直链发送

## 许可证

本项目使用 [GNU AGPLv3](https://choosealicense.com/licenses/agpl-3.0/) 作为开源许可证。
