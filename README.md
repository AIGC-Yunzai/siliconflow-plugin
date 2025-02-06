![](https://socialify.git.ci/AIGC-Yunzai/siliconflow-plugin/image?font=KoHo&forks=1&issues=1&language=1&name=1&owner=1&pattern=Circuit%20Board&pulls=1&stargazers=1&theme=Auto)

# SiliconFlow-PLUGIN(SF-PLUGIN) 🍓

<img decoding="async" align=right src="resources/readme/girl.png" width="35%">

- 一个适用于 [Yunzai 系列机器人框架](https://github.com/yhArcadia/Yunzai-Bot-plugins-index) 多功能AI集成插件，支持多种AI服务和模型：
  - 🎨 AI绘图：支持SiliconFlow、Midjourney等多个绘图模型，支持文生图和图生图
  - 🤖 智能对话：集成多种对话模型，支持历史记录、用户昵称获取、预设列表快速切换，预设拥有独立上下文，结合Markdown图片输出以获得沉浸式角色扮演体验
  - 🔍 实时搜索：通过#gg命令实现智能搜索和信息聚合
  - 🗣️ 语音合成：集成Fishaudio的高质量TTS服务
  - 📊 资源管理：支持多key负载均衡，提供图片直链获取等功能
  - 🔗 链接处理：自动提取和处理消息中的URL

> [!TIP]
> 插件官网（施工中）：[SiliconFlow-插件](https://aigc-yunzai.dwe.me/)
> 
> 将逐步接入更多AI服务和功能，Synaptic Fusion插件——对接万物！

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

## 使用教程

- 如果是低版本的icqq，图生图和直链无法获取图链，请使用以下脚本，在 Yunzai 根目录执行即可
```
curl -sL Gitee.com/eggacheb/parser/raw/master/ver | bash
```
#### 教程
- [SF-PULGIN配置教程](https://aigc-yunzai.dwe.me/siliconflow/%E5%A6%82%E4%BD%95%E9%85%8D%E7%BD%AE) 🍈

#### 绘画辅助工具
- [AI画图Tags生产站](https://nai4-tag-select.pages.dev/) 🥭
- [直链服务器，一键复制huggingface空间](https://huggingface.co/spaces/xiaozhian/slink/tree/main?duplicate=true) 🍉
- [Stable Diffusion教程](https://waytoagi.feishu.cn/wiki/FUQAwxfH9iXqC9k02nYcDobonkf) 🍇
- [Midjourney基础教程](https://waytoagi.feishu.cn/wiki/VUadwndc5iRJktkzaYPcaLEynZc) 🍊
- [MJ prompt参考](https://waytoagi.feishu.cn/wiki/FUQAwxfH9iXqC9k02nYcDobonkf) 🍎
- [Midjourney V6 prompt参考](https://aituts.com/midjourney-v6/) 🍐
- [又一个prompt参考站](https://catjourney.life/all) 🍌
- [Midjourney Prompt生成器](https://promptfolder.com/midjourney-prompt-helper/) 🥝
- [MJ和SD Prompt生成器相关合集](https://waytoagi.feishu.cn/wiki/TQogw5uIziB4fykbGhSciaQfndm?table=tbl5kMFjDDdeYoAt&view=vew8AJm3cI) 🍑

## 插件配置

> [!WARNING]
> 非常不建议手动修改配置文件，本插件已兼容 [Guoba-plugin](https://github.com/guoba-yunzai/guoba-plugin) ，请使用锅巴插件对配置项进行修改

## 功能列表

<img decoding="async" align=right src="https://github.com/user-attachments/assets/9698e837-49e7-4c19-8dab-6aa17d1faed4" width="35%">

<img decoding="async" align=right src="https://github.com/user-attachments/assets/f8d8a42f-6c5d-4fa1-a18e-ea2403f6dd6c" width="28%">

请使用 `#sf帮助` 获取完整帮助

- [x] 接入多项免费画图/语言模型
- [x] 支持图生图
- [x] 多keys同时并发
- [x] 接入MJ绘图
- [x] 接入Fishaudio语音合成
- [x] 支持图片直链获取
- [X] #ss 对话 MD 图片输出
- [X] #gg 对话实现实时搜索功能
- [X] 对话支持历史记录、获取用户昵称，结合 MD 输出以获取沉浸式角色扮演体验
- [X] 支持接口列表，方便快速切换预设，预设具有独立的上下文
- [X] 支持 WebSocket 与前端通信实现实时对话与绘图，详情看[部署教程](https://抱歉还没有开始写，诶嘿)
- [ ] TODO..

## 支持与贡献

如果你喜欢这个项目，请不妨点个 Star🌟，这是对开发者最大的动力。

有意见或者建议也欢迎提交 [Issues](https://github.com/AIGC-Yunzai/siliconflow-plugin/issues) 和 [Pull requests](https://github.com/AIGC-Yunzai/siliconflow-plugin/pulls)。

## 感谢

- [Fish-Audio](https://fish.audio)：Brand new TTS solution
- [vits-plugin](https://github.com/erzaozi/vits-plugin)：一个适用于 Yunzai 系列机器人框架 的的 AI 语音合成插件，让你能够在机器人中使用 AI 语音合成功能；Fishaudio语音同传的方式绝大部分参考了该项目的实现方法，Fish-Audio.json也是直接用的该项目的，很是感谢！
- [midjourney-proxy](https://github.com/trueai-org/midjourney-proxy)：一个开源的MJ代理项目，同时提供了免费的公益API站点，让更多人能够体验AI绘画的乐趣！

## 许可证

本项目使用 [GNU AGPLv3](https://choosealicense.com/licenses/agpl-3.0/) 作为开源许可证。
