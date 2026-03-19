# SF-Plugin (SiliconFlow Plugin) - AI Coding Agent Guide

## 项目概述

SF-Plugin (硅基流动插件，又名 Synaptic Fusion 插件) 是一个适用于 [Yunzai 系列机器人框架](https://github.com/yhArcadia/Yunzai-Bot-plugins-index) 的多功能 AI 集成插件。本插件支持多种 AI 服务和模型，提供 AI 绘图、智能对话、实时搜索、语音合成等功能。

**项目定位**: Yunzai-Bot 插件生态系统的 AI 功能扩展模块  
**主要语言**: JavaScript (ES Module)  
**开源协议**: GNU AGPLv3  
**版本**: 1.0.6

## 技术栈

- **运行时环境**: Node.js (支持 ES Module)
- **核心框架**: Yunzai-Bot 插件体系
- **网络通信**: 
  - `axios` (^1.6.2) - HTTP 请求
  - `ws` (^8.18.0) - WebSocket 服务
  - `node-fetch` - 内置 fetch API  polyfill
- **配置管理**: YAML 格式配置文件
- **渲染引擎**: Puppeteer (通过 Yunzai Runtime) 用于生成图片帮助菜单
- **可选依赖**: Python 3 + aiohttp/requests (用于抖音/快手视频解析)

## 项目结构

```
siliconflow-plugin/
├── apps/                    # 功能模块目录 (插件核心功能)
│   ├── SF_Painting.js      # SF 绘图与对话主模块
│   ├── MJ_Painting.js      # Midjourney 绘画接口
│   ├── DD_Painting.js      # 自定义 OpenAI 格式绘画接口
│   ├── Doubao.js           # 豆包 AI 接口
│   ├── Jimeng.js           # 即梦 API 接口
│   ├── fish.js             # FishAudio TTS 语音合成
│   ├── Help.js             # 帮助菜单渲染
│   ├── Presets.js          # 绘画预设管理
│   ├── link.js             # 图片直链功能
│   ├── bilitv.js           # B站视频解析
│   ├── douyin.js           # 抖音视频解析
│   ├── kuaishou.js         # 快手视频解析
│   ├── groupSayHello.js    # 群自动打招呼
│   ├── autoEmoticons.js    # 群自动表情包
│   ├── autoRepeat.js       # 复读功能
│   └── Update.js           # 插件更新功能
├── components/             # 核心组件
│   ├── Config.js           # 配置管理类 (YAML 读写、缓存、监听)
│   ├── Render.js           # 图片渲染组件
│   └── Version.js          # 版本信息检测
├── config/                 # 配置文件目录
│   ├── config_default.yaml # 主配置文件模板
│   ├── fishAudio_default.yaml # FishAudio 音色列表
│   ├── presets_default.yaml   # 绘画预设模板
│   └── config/             # 运行时配置 (用户配置存储)
├── model/                  # 数据模型
│   └── path.js             # 路径常量定义
├── utils/                  # 工具函数库
│   ├── common.js           # 通用工具 (YAML读写、隐私信息隐藏)
│   ├── context.js          # 对话上下文管理 (Gemini格式)
│   ├── doubaoContext.js    # 豆包对话上下文
│   ├── getImg.js           # 图片获取与处理
│   ├── parse.js            # 参数解析
│   ├── markdownPic.js      # Markdown转图片
│   ├── extractUrl.js       # URL提取处理
│   ├── memberControl.js    # 成员权限控制
│   ├── onebotUtils.js      # OneBot 协议工具
│   ├── applyPresets.js     # 预设应用
│   ├── uploadImage.js      # 图片上传
│   ├── chatCooldown.js     # 对话冷却控制
│   └── Video_parser_nodejs.js # 视频解析
├── resources/              # 静态资源
│   ├── common/             # 通用样式和布局
│   ├── help/               # 帮助页面模板
│   ├── markdownPic/        # Markdown渲染模板
│   └── readme/             # 文档图片
├── docs/                   # 文档
│   ├── moscope.md          # 魔塔 API 配置教程
│   └── openrouter_ai.md    # OpenRouter 配置教程
├── guoba.support.js        # Guoba 插件配置支持
├── index.js                # 插件入口文件
└── package.json            # NPM 配置
```

## 架构说明

### 1. 插件加载机制

插件通过 `index.js` 入口文件动态加载 `apps/` 目录下的所有 `.js` 文件：

```javascript
// 自动扫描 apps/ 目录加载功能模块
const files = fs.readdirSync('./plugins/siliconflow-plugin/apps')
  .filter((file) => file.endsWith('.js'));
```

每个功能模块都继承自 Yunzai 的 `plugin` 基类，通过 `export class XXX extends plugin` 导出。

### 2. 配置管理架构

配置系统采用分层设计：
- **默认配置**: `config/*_default.yaml` - 作为模板和默认值
- **用户配置**: `config/config/*.yaml` - 运行时实际使用的配置
- **配置类**: `components/Config.js` - 提供缓存、监听、验证功能

配置特性：
- 支持配置文件热更新 (文件监听)
- Prompt 内容分离存储 (避免超大 Prompt 频繁读写 YAML)
- 配置项变更自动同步默认配置的新字段

### 3. Guoba 插件集成

`guoba.support.js` 提供与 [Guoba-Plugin](https://github.com/guoba-yunzai/guoba-plugin) 的集成，支持通过 Web UI 可视化配置插件参数。配置使用 Schema 定义，支持多种表单组件。

### 4. WebSocket 服务

SF_Painting.js 中内嵌 WebSocket 服务器，支持前端实时通信：
- 端口可配置 (默认 8081)
- 支持密码验证
- 实现实时对话与绘图功能

## 开发规范

### 代码风格

1. **模块化**: 使用 ES Module (`import/export`)
2. **类命名**: PascalCase (如 `SF_Painting`, `MJ_Painting`)
3. **函数命名**: camelCase
4. **配置文件**: 使用 YAML 格式，缩进 2 空格
5. **日志输出**: 使用统一的 logger 格式 `[sf插件] 消息内容`

### 插件类结构模板

```javascript
import plugin from '../../../lib/plugins/plugin.js'

export class PluginName extends plugin {
  constructor() {
    super({
      name: '插件名称',
      dsc: '插件描述',
      event: 'message',
      priority: 1000,  // 优先级，数字越小越优先
      rule: [
        {
          reg: '^#命令正则',
          fnc: 'methodName',
          permission: 'master'  // 可选: master/admin/member
        }
      ]
    })
  }
  
  async methodName(e) {
    // e 为消息事件对象
    // 处理逻辑
    return true  // 返回 true 表示拦截，不再传递给其他插件
  }
}
```

### 配置文件规范

- 所有配置项必须有默认值
- 敏感信息 (API Key) 使用数组支持多 key 轮询
- 注释使用中文，清晰说明配置项用途

## 依赖安装

```bash
# 安装 Node.js 依赖
pnpm install --filter=siliconflow-plugin

# 可选：安装 Python 依赖 (用于视频解析)
pip install aiohttp requests
```

## 测试说明

本项目**无自动化测试套件**。测试依赖手动验证：

1. 部署到 Yunzai-Bot 环境
2. 使用 `#sf帮助` 命令验证基础功能
3. 测试各 AI 接口调用 (需要配置对应 API Key)

## 部署流程

### 安装方法

```bash
# 克隆仓库到 Yunzai 插件目录
git clone https://github.com/AIGC-Yunzai/siliconflow-plugin.git ./plugins/siliconflow-plugin

# 安装依赖
pnpm install --filter=siliconflow-plugin
```

### 配置方法

**强烈推荐**使用 [Guoba-Plugin](https://github.com/guoba-yunzai/guoba-plugin) 进行可视化配置，避免手动修改 YAML。

如需手动配置，编辑 `config/config/config.yaml` 文件。

### 发布流程

项目使用 GitHub Actions 自动发布：
- 推送 `v*` 标签触发自动 Release
- Stale bot 自动管理长期未处理的 Issue 和 PR

## 安全注意事项

1. **API Key 保护**: 
   - 配置文件中的 API Key 会被自动隐藏部分字符 (日志脱敏)
   - 避免将包含 Key 的配置文件提交到 Git

2. **隐私信息处理**: 
   - 工具函数 `hidePrivacyInfo()` 用于隐藏错误信息中的 URL、IP 等敏感信息
   - 日志中不打印完整的请求响应内容

3. **文件操作安全**: 
   - Prompt 文件保存时对文件名进行清理 (替换特殊字符)
   - 避免路径遍历攻击

4. **WebSocket 安全**: 
   - 支持密码验证
   - 建议在生产环境修改默认密码

## 常用命令

| 命令 | 说明 | 权限 |
|------|------|------|
| `#sf帮助` | 显示帮助菜单 | 所有人 |
| `#sf绘图 [描述]` | 使用 SiliconFlow 绘图 | 所有人 |
| `#mjp [描述]` | 使用 Midjourney 绘图 | 所有人 |
| `#gg [内容]` | Gemini 对话/搜索 | 所有人 |
| `#ss [内容]` | OpenAI 格式对话 | 所有人 |
| `#sf设置xxx` | 配置插件参数 | 主人 |

## 参考资料

- [Yunzai-Bot 插件开发文档](https://github.com/yhArcadia/Yunzai-Bot-plugins-index)
- [Guoba-Plugin 配置支持](https://github.com/guoba-yunzai/guoba-plugin)
- [SiliconFlow API 文档](https://docs.siliconflow.cn/)
- [Gemini API 文档](https://ai.google.dev/docs)

## 联系方式

- QQ 交流群1: https://qm.qq.com/q/unjAw930RO
- QQ 交流群2: https://qm.qq.com/q/tEqFnH0kTe
- GitHub Issues: https://github.com/AIGC-Yunzai/siliconflow-plugin/issues
