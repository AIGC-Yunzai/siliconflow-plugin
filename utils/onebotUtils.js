/**
 * 从消息段中提取所有被 At 的用户 ID。
 * TRSS-Yunzai 的 e.at 在多人 At 时只保留最后一位，因此多人场景必须读取 e.message。
 *
 * @param {*} e 消息事件
 * @returns {string[]} 去重后、保持 At 顺序的用户 ID
 */
export function getAtUserIds(e) {
  const userIds = []
  const seen = new Set()
  const selfId = e?.self_id == null ? '' : String(e.self_id)

  if (Array.isArray(e?.message)) {
    for (const item of e.message) {
      if (item?.type !== 'at') continue

      const rawUserId = item.qq ?? item.id ?? item.user_id
      if (rawUserId == null) continue

      const userId = String(rawUserId).trim()
      if (!userId || userId.toLowerCase() === 'all' || userId === selfId || seen.has(userId)) continue

      seen.add(userId)
      userIds.push(userId)
    }
  }

  // 兼容没有完整 message 数组的适配器
  if (userIds.length === 0 && e?.at != null) {
    const userId = String(e.at).trim()
    if (userId && userId.toLowerCase() !== 'all' && userId !== selfId) {
      userIds.push(userId)
    }
  }

  return userIds
}

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
 * 在多 Bot 环境中尝试调用指定方法。
 * @param {string} methodName 方法名
 * @param  {...any} args 方法参数
 * @returns {Promise<any>}
 */
async function executeBotMethod(methodName, ...args) {
  if (typeof Bot === 'undefined') return null;

  const candidates = [Bot];
  for (const value of Object.values(Bot)) {
    if (value && typeof value === 'object' && !candidates.includes(value)) {
      candidates.push(value);
    }
  }

  for (const bot of candidates) {
    if (typeof bot?.[methodName] !== 'function') continue;
    try {
      const result = await bot[methodName](...args);
      if (result != null) return result;
    } catch { }
  }

  return null;
}

/** 递归提取对象中的属性，兼容不同适配器的数据包装结构 */
function extractProperty(target, propertyName, visited = new Set()) {
  if (!target || typeof target !== 'object' || visited.has(target)) return { value: undefined };
  visited.add(target);

  if (target[propertyName] != null) return { value: target[propertyName] };

  for (const value of Object.values(target)) {
    const result = extractProperty(value, propertyName, visited);
    if (result.value != null) return result;
  }

  return { value: undefined };
}

/**
 * @description: 获取指定用户的详细信息对象
 * @param {*} e 如果要获取指定群的群聊信息，传递：{ isGroup: true, group_id: group_id }
 * @param {*} qq 指定的QQ号
 * @return {Promise<Object>} 获取到的用户信息对象，包含 card, name, gender, age, role, level, join_time, last_sent_time, title
 */
export async function getUserDetailedInfo(e, qq = null) {
  qq = qq || e?.user_id;

  // 辅助函数：格式化提取需要的数据
  const formatResult = (info, sourceName) => {
    const source = info && typeof info === 'object' ? info : {};
    // 兼容某些适配器把信息包裹在 sender 属性里的情况
    const data = source.sender ? { ...source, ...source.sender } : source;

    // 优先取群名片，其次取昵称，都没有则取QQ号
    const nickname = data.nickname || String(qq);
    const card = data.card || nickname;

    // OICQ/ICQQ 等常见框架的性别字段通常是 sex 或 gender
    const gender = data.sex || data.gender || 'unknown';

    return {
      card,
      name: nickname,
      gender,
      age: data.age ?? 'unknown',
      role: data.role || 'unknown',
      source: sourceName,
      level: data.level,
      join_time: data.join_time,
      last_sent_time: data.last_sent_time,
      title: data.title,
    };
  };

  // 如果e是群聊消息，则尝试获取群名片等信息
  if (e && (e.isGroup || e.group_id)) {
    // 1. 优先使用 gml（群成员列表）获取
    try {
      const gml = await e.bot?.gml;
      const groupMembers = gml?.get(e.group_id) || gml?.get(String(e.group_id)) || gml?.get(Number(e.group_id));
      if (groupMembers) {
        const member = groupMembers.get(qq) || groupMembers.get(String(qq)) || groupMembers.get(Number(qq));
        if (member && (member.card || member.nickname)) {
          return formatResult(member, 'gml');
        }
      }
    } catch { }

    // 2. 喵崽版
    try {
      const usrinfo = await e.bot?.getGroupMemberInfo?.(e.group_id, qq)
        || await e.bot?.pickMember?.(e.group_id, qq);
      if (usrinfo && (usrinfo.card || usrinfo.nickname)) {
        return formatResult(usrinfo, 'e.bot.getGroupMemberInfo / pickMember');
      }
    } catch { }

    // 3. 其他适配器版 - 单开qq
    try {
      const member = await Bot.getGroupMemberInfo?.(e.group_id, qq)
        || await Bot.pickMember?.(e.group_id, qq);
      if (member != null) {
        const userName = member.card || member.sender?.card || member.nickname || member.sender?.nickname;
        if (userName) {
          return formatResult(member, 'Bot.getGroupMemberInfo (单开)');
        }
      }
    } catch { }

    // 4. 其他适配器版 - 多开qq
    try {
      const memberInfo = await executeBotMethod('pickMember', e.group_id, qq);
      const userName = extractProperty(memberInfo, 'card').value
        || extractProperty(memberInfo, 'nickname').value;
      if (userName) {
        return formatResult(memberInfo, 'executeBotMethod (多开)');
      }
    } catch { }

    // 5. 其他适配器版 - 未知适配器1
    try {
      const info = await e.group?.pickMember?.(Number(qq) || qq)?.getInfo?.();
      if (info && (info.card || info.nickname)) {
        return formatResult(info, 'e.group.pickMember');
      }
    } catch { }

    // 6. 其他适配器版 - 未知适配器2
    try {
      const info = await Bot.pickGroup?.(e.group_id)?.pickMember?.(qq)?.getInfo?.();
      if (info && (info.card || info.nickname)) {
        return formatResult(info, 'Bot.pickGroup');
      }
    } catch { }
  }

  // 7. 私聊通用版
  try {
    const info = await Bot.pickUser?.(qq)?.getSimpleInfo?.();
    if (info && info.nickname) {
      return formatResult(info, 'Bot.pickUser');
    }
  } catch {
    try {
      const info = await e?.bot?.pickUser?.(qq)?.getInfo?.();
      if (info && info.nickname) {
        return formatResult(info, 'e.bot.pickUser');
      }
    } catch { }
  }

  // 都失败了就返回保底对象
  return {
    card: String(qq),
    name: String(qq),
    gender: 'unknown',
    age: 'unknown',
    role: 'unknown',
    source: 'fallback (全部失败)',
  };
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
