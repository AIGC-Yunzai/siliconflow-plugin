import axios from 'axios'

/**
 * @description: 处理消息中的图片：当消息引用了图片，则将对应图片放入e.img ，优先级==> e.source.img > e.img
 * @param {*} e
 * @param {*} alsoGetAtAvatar 开启使用At用户头像作为图片，默认 false
 * @param {*} useOrigin 是否使用原图，默认 false
 * @return {*}处理过后的e
 */
export async function parseSourceImg(e, alsoGetAtAvatar = true, useOrigin = false) {
  let reply;
  if (alsoGetAtAvatar && e.at && !e.source && !e.reply_id && !e.img) {
    if (e.atBot) {
      e.img = [];
      e.img[0] =
        e.bot.avatar || `https://q1.qlogo.cn/g?b=qq&s=0&nk=${e.self_id}`;
    }
    if (e.at) {
      try {
        e.img = [await e.group.pickMember(e.at).getAvatarUrl()];
      } catch (error) {
        e.img = [`https://q1.qlogo.cn/g?b=qq&s=0&nk=${e.at}`];
      }
    }
  }
  // ICQQ原生
  if (e.source) {
    if (e.isGroup) {
      reply = (await e.group.getChatHistory(e.source.seq, 1)).pop()?.message;
    } else {
      reply = (await e.friend.getChatHistory(e.source.time, 1)).pop()?.message;
    }
  }
  // 添加OneBotv11适配器
  else if (e.reply_id) {
    reply = (await e.getReply(e.reply_id)).message;
  }
  if (reply) {
    let i = []
    for (const val of reply) {
      if (val.type == 'image') {
        i.push(val.url)
      }
      if (val.type == "file") {
        e.reply("不支持消息中的文件，请将该文件以图片发送...", true);
        return;
      }
    }
    if (Boolean(i.length))
      e.img = i
  }
  return e.img;
}


export async function url2Base64(url, isReturnBuffer = false) {
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
    // 返回 Buffer
    if (isReturnBuffer)
      return Buffer.from(response.data, 'binary');

    return Buffer.from(response.data, 'binary').toString('base64');
  } catch (error) {
    logger.error(`[sf插件]下载引用图片错误，可能是图片链接已失效，使用的图片链接：\n` + url);
    return null;
  }
}
