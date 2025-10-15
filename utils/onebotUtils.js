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
 * @description: 获取聊天历史记录，带错误重试机制
 * @param {*} target 目标对象 group (e.group 或 e.friend) 获取方式： e.bot.pickGroup(groupId) 或  Bot.pickGroup(groupId)
 * @param {*} count 最大获取条数，若大于 20 则需要适配器的 getChatHistory 返回的数组是正序排列（即最早的信息是数组的第一个）
 * @param {*} seq 序列号或时间戳
 * @param {number} duration_hours 统计的小时数，默认为 0（不限制时间）。如果设置了此参数，则只获取指定小时数内的消息。
 * @param {Date} date_end 计算时间范围的结束时间，默认为当前时间
 * @return {Array} 聊天历史记录数组
 */
export async function getChatHistory_w(target, count, seq = null, duration_hours = 0, date_end = new Date()) {
  const maxBatchSize = 20; // 单次最大获取数量
  let allResults = []; // 存储所有获取到的消息
  let remainingCount = count; // 剩余需要获取的数量
  let total_err_count = 0; // 总错误次数

  // 计算时间范围的截止时间戳，使用传入的结束时间
  const endTime = Math.floor(date_end.getTime() / 1000); // 将 Date 对象转换为秒级时间戳
  const cutoffTime = duration_hours > 0 ? endTime - (duration_hours * 60 * 60) : 0;

  if (!seq) {
    let latestChat = await target.getChatHistory(undefined, 1)
    seq = latestChat[0].seq || latestChat[0].message_id
  }
  let currentSeq = seq; // 当前的序列号

  while (remainingCount > 0) {
    // 计算本次获取的数量
    const batchSize = Math.min(remainingCount, maxBatchSize);
    let currentCount = batchSize;

    // 重试机制
    while (currentCount >= 1) {
      try {
        const result = await target.getChatHistory(currentSeq, currentCount);

        if (!result || !Array.isArray(result) || result.length === 0) {
          // 如果没有更多消息了，返回已获取的消息
          return allResults;
        }

        // 如果设置了时间范围，过滤消息
        let filteredResult = result;
        if (duration_hours > 0) {
          filteredResult = result.filter(msg => {
            const msgTime = msg.time || 0;
            return msgTime >= cutoffTime;
          });

          // 如果过滤后没有消息在时间范围内，说明已经超出时间范围
          if (filteredResult.length === 0) {
            // 检查是否有消息时间小于截止时间，如果有则说明已经超出时间范围
            const hasOlderMsg = result.some(msg => (msg.time || 0) < cutoffTime);
            if (hasOlderMsg) {
              return allResults;
            }
          }
        }

        // 将本次获取的消息添加到总结果中
        allResults.push(...filteredResult);

        // 更新剩余需要获取的数量
        remainingCount -= filteredResult.length;

        // 如果获取的消息数量少于请求数量，说明已经没有更多消息了
        if (result.length < currentCount) {
          return allResults;
        }

        // 如果设置了时间范围且过滤后的消息数量为0但原始消息有内容，可能需要继续获取
        if (duration_hours > 0 && filteredResult.length === 0 && result.length > 0) {
          // 检查最后一条消息是否还在时间范围内
          const lastMessage = result[result.length - 1];
          const lastMsgTime = lastMessage.time || 0;
          if (lastMsgTime < cutoffTime) {
            // 已经超出时间范围，停止获取
            return allResults;
          }
        }

        // 更新下次获取的起始序列号为本次结果的第一个消息的 seq || message_id
        if (result.length > 0) {
          const firstMessage = result[0];
          currentSeq = firstMessage.seq || firstMessage.message_id;
        }

        break; // 本批次获取成功，跳出重试循环
      } catch (err) {
        // logger.info(`[派蒙nai辅助]获取聊天历史失败，count=${currentCount}，正在尝试count=${currentCount - 1}`);
        currentCount--;
        total_err_count++;
        if (currentCount < 1 || total_err_count > 200) {
          // 如果已经有部分结果，返回已获取的部分
          if (allResults.length > 0) {
            logger.info(`[派蒙nai辅助]部分获取聊天历史失败，返回已获取的${allResults.length}条消息`);
            logger.info(`[派蒙nai辅助]部分获取聊天历史失败 err: ${err}`);
            return allResults;
          }
          // throw new Error(`获取聊天历史失败，已重试到count=1仍然失败`, err);
        }
      }
    }
  }

  return allResults;
}
