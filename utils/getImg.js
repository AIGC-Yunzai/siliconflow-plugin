import axios from 'axios'

/**
 * @description: 处理引用消息：获取引用的图片、视频和文本
 * 图片放入 e.img (优先级: e.source.img > e.img)
 * 视频放入 e.get_Video
 * 文本放入 e.sourceMsg
 * @param {*} e
 * @param {*} alsoGetAtAvatar 开启使用At用户头像作为图片，默认 true
 * @return {*} e.img e.sourceMsg 和 e.theImgIsGetFromSource ，当图片是从引用中获取的则 e.theImgIsGetFromSource 为 true
 */
export async function parseSourceImg(e, alsoGetAtAvatar = true) {
  let reply;
  // 1. 尝试获取头像作为图片 (如果没有 source/reply/img 且有 at)
  if (alsoGetAtAvatar && e.at && !e.source && !e.reply_id && !e.img) {
    // if (e.atBot) { // 不获取Bot的头像，无意义
    //   e.img = [];
    //   e.img[0] = e.bot.avatar || `https://q1.qlogo.cn/g?b=qq&s=0&nk=${getUin(e)}`;
    // }
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
    let senderUser_id = '' // 存储发送者昵称

    // 获取发送者昵称
    if (e.reply_id) {
      try {
        const replyObj = await e.getReply(e.reply_id)
        senderNickname = replyObj.sender?.card || replyObj.sender?.nickname
        senderUser_id = replyObj.sender?.user_id;
      } catch (error) {
        logger.error('[sf插件]获取回复消息发送者信息失败:', error)
      }
    }
    else if (e.source) {
      if (e.isGroup) {
        try {
          const sender = await e.group.pickMember(e.source.user_id)
          senderNickname = sender.card || sender.nickname
          senderUser_id = e.source.user_id
        } catch (error) {
          logger.error('[sf插件]获取群成员信息失败:', error)
        }
      } else {
        try {
          const friend = e.bot.fl.get(e.source.user_id)
          senderNickname = friend?.nickname
          senderUser_id = e.source.user_id
        } catch (error) {
          logger.error('[sf插件]获取好友信息失败:', error)
        }
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
        return e.img;
      }
    }
    if (Boolean(i.length)) {
      e.img = i;
      e.theImgIsGetFromSource = true;
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
    // 收集引用消息的 message_id
    e.source_message_id = e.reply_id || e.source.seq || e.source.time;
    // 收集引用者信息
    if (senderNickname) {
      e.senderNickname = senderNickname;
      e.senderUser_id = senderUser_id;
    }
  }
  return e.img;
}

/**
 * @description: URL下载图片(或视频)转Base64 （默认） 或 Buffer 或 Blob，支持 base64:// 协议
 * @param {string} url 可以是 http(s)://, base64://, 或者是 data:image/...;base64,
 * @param {*} isReturnBuffer 是否返回 Buffer ，默认 false
 * @param {*} isReturnBlob 是否返回 blob ，默认 false
 * @param {object} opt 可选
 * @param {number} opt.maxPixels 图片缩放选项 { maxPixels: 1048576 } 表示最大像素为 1024*1024=1048576
 * @param {number} opt.maxSizeBytes 最大下载字节
 * @param {number} opt.onlyCheck 仅检查大小不下载
 * @param {*} e e 可选，用于回复
 * @return {*}
 */
export async function url2Base64(url, isReturnBuffer = false, isReturnBlob = false, opt = {}, e = {}) {
  try {
    let buffer;
    let contentLength;
    let contentType = 'image/jpeg'; // 默认类型

    const maxSizeInBytes = opt.maxSizeBytes || 10 * 1024 * 1024; // 10MB in bytes

    // 1. 判断是否为 base64 直传 (兼容 base64:// 和标准的 data: URL)
    if (url.startsWith('base64://') || url.startsWith('data:')) {
      let base64Str = url;

      // 提取纯 Base64 字符串 和 Content-Type
      if (url.startsWith('base64://')) {
        base64Str = url.replace(/^base64:\/\//i, '');
      } else if (url.startsWith('data:')) {
        const match = url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          contentType = match[1];
          base64Str = match[2];
        }
      }

      buffer = Buffer.from(base64Str, 'base64');
      contentLength = buffer.length;

    } else {
      // 2. 常规 URL 下载
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000 // 设置超时时间为60秒
      });

      // 获取长度和类型
      contentLength = response.headers?.['content-length'] || response.headers?.get('size') || response.data.byteLength;
      // 兼容 axios 不同版本的 headers 获取方式
      contentType = response.headers?.['content-type'] || response.headers?.get('content-type') || 'image/jpeg';

      buffer = Buffer.from(response.data, 'binary');
    }

    // 3. 校验文件大小
    if (contentLength && parseInt(contentLength) > maxSizeInBytes) {
      logger.mark(logger.blue('[sf插件]'), logger.cyan(`[url2Base64 出错]`), logger.red(`文件大小超过${maxSizeInBytes / 1024 / 1024}MB，已中断执行`));
      if (e.reply) {
        if (!e.isFromHandUpRepaint) e.reply(`文件大小超过${maxSizeInBytes / 1024 / 1024}MB，已中断执行`, true);
      }
      return null;
    }

    if (opt.onlyCheck) return true;

    // 4. 图片处理逻辑 (增加对视频类型的放行过滤，防止处理 MP4 时 sharp 报错)
    const isVideo = contentType.includes('video') || url.endsWith('.mp4');

    // if (opt.maxPixels && !isVideo) {
    //   try {
    //     // 获取图片尺寸
    //     let dimensions = imageSize(buffer);
    //     dimensions = proportionalCalculationWidthHeight(dimensions.width, dimensions.height, opt.maxPixels);
    //     // 使用 sharp 缩放图片
    //     buffer = await sharp(buffer)
    //       .resize(dimensions.width, dimensions.height, { withoutEnlargement: true })
    //       .timeout({ seconds: 10 })
    //       .toBuffer();
    //   } catch (err) {
    //     // sharp 处理超时或失败
    //     if (err.message.includes('timeout')) {
    //       logger.mark(logger.blue('[sf插件]'), logger.cyan(`[url2Base64 错误]`), logger.red(`图片处理超时`));
    //       if (e.reply && !e.isFromHandUpRepaint) e.reply('引用的图片过大，sharp处理失败.', true);
    //       return null;
    //     } else {
    //       logger.mark(logger.blue('[sf插件]'), logger.cyan(`[url2Base64 错误]`), logger.red(`图片处理失败: ${err.message}`));
    //       if (e.reply && !e.isFromHandUpRepaint) e.reply('sharp图片处理失败.', true);
    //       return null;
    //     }
    //   }
    // }

    // 5. 格式化输出
    if (isReturnBuffer) {
      return buffer;
    } else if (isReturnBlob) {
      // 修复：之前这里依赖 response.headers，现在统一使用提取好的 contentType
      const imageBlob = new Blob([buffer], { type: contentType });
      // 动态判断一下文件名后缀（兼容你提到的MP4情况）
      const fileName = isVideo ? 'video.mp4' : 'image.png';
      return { imageBlob, contentLength, fileName };
    } else {
      return buffer.toString('base64');
    }

  } catch (error) {
    logger.mark(logger.blue('[sf插件]'), logger.cyan(`[url2Base64 错误] 可能是链接已失效 或 Base64解析失败`), logger.red(error.message || error));
    if (e.reply) {
      if (!e.isFromHandUpRepaint) e.reply('引用的文件地址已失效或解析失败，请重新发送.', true);
    }
    return null;
  }
}

/**
 * @description: 请在120秒内发送图片或视频
 * @param {*} e
 * @param {*} context
 * @param {*} needLength 需要的图片或视频总数量
 * @param {*} featureName 显示的名称
 * @param {boolean} countVideo 是否将视频计入总数 (默认为 false)
 * @return {boolean} 成功获取到指定数量返回 true，否则返回 false
 */
export async function getMediaFrom_awaitContext(e, context = null, needLength = 1, featureName = "", countVideo = false) {
  // 初始化图片数组
  if (!e.img) {
    e.img = [];
  }
  // 初始化视频数组
  if (!e.get_Video) {
    e.get_Video = [];
  }

  featureName = featureName.replace(/_default$/, '') || e.msg.replace(/^[#\/]/, '').substring(0, 2);

  // 动态生成提示语中的媒体名称
  const mediaTypeName = countVideo ? "图片或视频" : "图片";

  // 检查当前图片和视频总数量是否满足要求
  while ((e.img.length + (countVideo ? e.get_Video.length : 0)) < needLength) {
    const currentCount = e.img.length + (countVideo ? e.get_Video.length : 0);
    const stillNeed = needLength - currentCount;

    await e.reply(`[${featureName}]当前已有${currentCount}份${mediaTypeName}，还需要${stillNeed}份，请在120秒内发送${mediaTypeName}喵~`, true, { recallMsg: 119 });

    const e_new = await context.awaitContext();
    let hasMedia = false;

    // 1. 处理图片
    if (e_new.img && e_new.img.length > 0) {
      e.img.push(...e_new.img);
      hasMedia = true;
    }

    // 2. 处理视频（仅当允许视频计数时，才提取视频并标记为有效输入）
    if (countVideo && e_new.message) {
      for (const val of e_new.message) {
        if (val.type === "video") {
          e.get_Video.push({
            url: val.url,
            file_size: val.file_size,
            file_name: val.file
          });
          hasMedia = true;
        }
      }
    }

    // 如果当前消息既没有图片也没有（被允许的）视频，判定为取消操作
    if (!hasMedia) {
      e.reply(`[${featureName}]未获取到${mediaTypeName}，操作已取消`, true);
      return false;
    }
  }

  // 循环结束说明已获取到指定数量的媒体文件
  return true;
}

/**
 * 从传入的对象中提取目标URL和类型，优先返回单个视频URL，无视频时返回单个图片URL
 * @param {Object} e - 包含视频/图片URL的源对象
 * @returns {Object} 包含目标URL和类型的对象 { targetUrl: string|null, isVideo: boolean }
 */
export function getMediaTargetUrl(e) {
  let targetUrl = null
  let isVideo = false

  const videoUrl = e.get_Video && Array.isArray(e.get_Video) && e.get_Video.length > 0
    ? e.get_Video[0].url
    : null;

  if (videoUrl) {
    targetUrl = videoUrl
    isVideo = true
  } else {
    if (e.img && Array.isArray(e.img) && e.img.length > 0) {
      targetUrl = e.img[0]
      isVideo = false
    }
  }

  return { targetUrl, isVideo }
}
