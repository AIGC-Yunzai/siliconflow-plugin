/**
 * @description: 获取指定QQ号的Bot对象，如果都不存在则返回默认的Bot对象
 * @param {Array} targetQQArr bot qq号数组
 * @return {Object} Bot实例对象
 */
export function getBotByQQ(targetQQArr) {
  for (const targetQQ of targetQQArr) {
    // 检查目标QQ的Bot是否存在
    if (targetQQ && Bot[targetQQ]) {
      return Bot[targetQQ];
    }
  }
  // 最后的兜底：返回Bot对象本身（适用于单Bot环境）
  return Bot;
}

/**
 * 构造群聊天记录的 prompt
 * @param {Array} chatHistory 聊天记录
 * @param {Object} prompt 插入到聊天记录前的 prompt
 * @param {Object} botId 插入到聊天记录中的 Bot ID
 * @returns {string} prompt文本
 */
export function buildChatHistoryPrompt(chatHistory, prompt = "", botId = "") {
  const currentTime = new Date().toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })

  // 从聊天记录中获取 Bot ID（取第一条消息的 self_id）
  botId = botId || (chatHistory && chatHistory.length > 0
    ? (chatHistory[0].self_id || 'Bot')
    : 'Bot')

  prompt += `\n1. 你的ID号: ${botId}\n`
  prompt += `2. 当前时间: ${currentTime}\n`
  // prompt += `3. 你的回复中不要使用 CQ:reply 或 CQ:image\n`

  if (chatHistory && chatHistory.length > 0) {
    prompt += `最近的聊天记录：\n`
    prompt += `==================\n`

    // 格式化聊天记录
    chatHistory.forEach((msg, index) => {
      const sender = msg.sender?.card || msg.sender?.nickname || '未知用户'
      const userId = msg.user_id || msg.sender?.user_id || '未知ID'
      const time = msg.time ? new Date(msg.time * 1000).toLocaleTimeString('zh-CN') : ''

      // 提取文本消息
      let text = ''
      if (typeof msg.raw_message === 'string') {
        text = msg.raw_message
      } else if (msg.message) {
        // 处理消息数组
        if (Array.isArray(msg.message)) {
          text = msg.message
            .filter(seg => seg.type === 'text')
            .map(seg => seg.text)
            .join('')
        } else if (typeof msg.message === 'string') {
          text = msg.message
        }
      }

      if (text && text.trim()) {
        prompt += `[${time}] ${sender}(ID:${userId}): ${text.substring(0, 100)}\n`
      }
    })

    prompt += `==================\n\n`
  } else {
    prompt += `暂无最近的聊天记录。\n\n`
  }

  return prompt
}