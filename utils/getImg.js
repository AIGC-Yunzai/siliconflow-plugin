import axios from 'axios'

/**
 * @description: 处理引用消息：获取引用的图片、视频和文本
 * 图片放入 e.img (优先级: e.source.img > e.img)
 * 视频放入 e.get_Video
 * 文本放入 e.sourceMsg
 * @param {*} e
 * @param {*} alsoGetAtAvatar 开启使用At用户头像作为图片，默认 true
 * @return {*}处理过后的e
 */
export async function parseSourceImg(e, alsoGetAtAvatar = true) {
  let reply;
  // 1. 尝试获取头像作为图片 (如果没有 source/reply/img 且有 at)
  if (alsoGetAtAvatar && e.at && !e.source && !e.reply_id && !e.img) {
    if (e.atBot) {
      e.img = [];
      e.img[0] = e.bot.avatar || `https://q1.qlogo.cn/g?b=qq&s=0&nk=${e.self_id}`;
    }
    if (e.at) {
      try {
        e.img = [await e.group.pickMember(e.at).getAvatarUrl()];
      } catch (error) {
        e.img = [`https://q1.qlogo.cn/g?b=qq&s=0&nk=${e.at}`];
      }
    }
  }

  // 2. 获取回复的消息对象 (reply)
  // ICQQ原生
  if (e.reply_id) {
    reply = (await e.getReply(e.reply_id)).message;
  }
  else if (e.source) {
    if (e.isGroup) {
      reply = (await e.group.getChatHistory(e.source.seq, 1)).pop()?.message;
    } else {
      reply = (await e.friend.getChatHistory(e.source.time, 1)).pop()?.message;
    }
  }

  // 3. 解析回复内容
  if (reply) {
    let i = []
    let text = [] // 用于存储文本消息
    let get_Video = [] // [新增] 用于存储视频消息
    let senderNickname = '' // 存储发送者昵称

    // 获取发送者昵称
    if (e.source) {
      if (e.isGroup) {
        try {
          const sender = await e.group.pickMember(e.source.user_id)
          senderNickname = sender.card || sender.nickname
        } catch (error) {
          logger.error('[sf插件]获取群成员信息失败:', error)
        }
      } else {
        try {
          const friend = e.bot.fl.get(e.source.user_id)
          senderNickname = friend?.nickname
        } catch (error) {
          logger.error('[sf插件]获取好友信息失败:', error)
        }
      }
    }
    // 添加OneBotv11适配器的处理
    else if (e.reply_id) {
      try {
        const replyObj = await e.getReply(e.reply_id)
        senderNickname = replyObj.sender?.card || replyObj.sender?.nickname
      } catch (error) {
        logger.error('[sf插件]获取回复消息发送者信息失败:', error)
      }
    }

    for (const val of reply) {
      if (val.type == 'image') {
        i.push(val.url)
      }
      if (val.type == 'text') {
        text.push(val.text)
      }
      if (val.type == "video") {
        get_Video.push({
          url: val.url,
          file_size: val.file_size,
          file_name: val.file
        })
      }
      if (val.type == "file") {
        e.reply("不支持消息中的文件，请将该文件以图片发送...", true);
        return;
      }
    }
    if (Boolean(i.length)) {
      e.img = i
    }
    if (Boolean(get_Video.length)) {
      e.get_Video = get_Video
    }
    if (text.length > 0) {
      // 如果有发送者昵称,添加到引用文本前,使用markdown引用格式
      const lines = text.join('\n').split('\n');
      const quotedLines = lines.map(line => `> ${line}`).join('\n');
      e.sourceMsg = senderNickname ?
        `> ##### ${senderNickname}：\n> ---\n${quotedLines}` :
        quotedLines;
    }
  }
  return e;
}

export async function url2Base64(url, isReturnBuffer = false, onlyCheck = false) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000 // 设置超时时间为60秒
    });

    const contentLength = response.headers?.['content-length'] || response.headers?.get('size')
    const maxSizeInBytes = 10 * 1024 * 1024; // 10MB in bytes

    if (contentLength && parseInt(contentLength) > maxSizeInBytes) {
      logger.error('[sf插件]图片大小超过10MB，请使用大小合适的图片');
      return null;
    }

    // 用于 Jimeng-api 的图片链接则不用下载图片
    if (onlyCheck) return true;

    // 返回 Buffer
    if (isReturnBuffer)
      return Buffer.from(response.data, 'binary');

    return Buffer.from(response.data, 'binary').toString('base64');
  } catch (error) {
    logger.error(`[sf插件]下载引用图片错误，可能是图片链接已失效，使用的图片链接：\n` + url);
    return null;
  }
}

/**
 * @description: 请在120秒内发送图片
 * @param {*} e
 * @param {*} needImgLength 需要的图片数量
 * @param {*} featureName 显示的名称
 * @param {*} context
 * @return {*}
 */
export async function getImgFrom_awaitContext(e, needImgLength, featureName = "", context = null) {
  // 初始化图片数组
  if (!e.img) {
    e.img = [];
  }
  featureName = featureName.replace(/_default$/, '') || e.msg.replace(/^[#\/]/, '').substring(0, 2)
  // 检查当前图片数量是否满足要求
  while (e.img.length < needImgLength) {
    const currentCount = e.img.length;
    const stillNeed = needImgLength - currentCount;
    await e.reply(`[${featureName}]当前已有${currentCount}张图片，还需要${stillNeed}张图片，请在120秒内发送图片喵~`, true, { recallMsg: 119 });
    const e_new = await context.awaitContext();
    if (e_new.img && e_new.img.length > 0) {
      // 将新获取的图片添加到现有图片数组中
      e.img.push(...e_new.img);
    } else {
      e.reply(`[${featureName}]未获取到图片，操作已取消`, true);
      return e;
    }
  }
  return e;
}
