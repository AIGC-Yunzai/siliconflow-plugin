import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import Config from '../components/Config.js'

export class ChatGPTResponsePostHandler extends plugin {
  constructor() {
    super({
      name: 'chatgpt文本回复后处理器',
      priority: -100,
      namespace: 'chatgpt-plugin',
      handler: [{
        key: 'chatgpt.response.post', // key必须是chatgpt.response.post
        fn: 'postHandler'
      }]
    })
  }

  async postHandler(e, options, reject) {
    // 读取配置
    let config_date = Config.getConfig()

    const { content, use, prompt } = options

    const response = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config_date.fishApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: content,
        reference_id: config_date.fish_reference_id,
        format: 'mp3',
        latency: 'normal'
      })
    })

    if (!response.ok) {
      throw new Error(`[sf-Handler]无法从服务器获取音频数据：${response.statusText}`)
    }

    const audio = await response.blob()
    const buffer = await audio.arrayBuffer()
    e.reply(segment.record(Buffer.from(buffer)))
  }
}
