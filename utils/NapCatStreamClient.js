import crypto from 'crypto';

const DEFAULT_CHUNK_SIZE = 256 * 1024; // 256KB

export class NapCatStreamClient {
  constructor(bot) {
    this.bot = bot;
  }

  /**
   * 清理流式传输临时文件 (Normal)
   */
  async cleanStreamTempFile() {
    return this.bot.sendApi('clean_stream_temp_file', {});
  }

  /**
   * 测试下载流 (Download)
   */
  async testDownloadStream() {
    return this.bot.sendApi('test_download_stream', {});
  }

  /**
   * 文件下载流 - 从 NapCat 下载文件 (Download)
   * @param {string} file - 文件路径/URL/文件ID
   * @param {number} [chunkSize]
   */
  async downloadFileStream(file, chunkSize) {
    return this.bot.sendApi('download_file_stream', {
      file,
      chunk_size: chunkSize || DEFAULT_CHUNK_SIZE
    });
  }

  /**
   * 上传文件流 - 低层级分片上传播 (Upload)
   * @param {string} streamId
   * @param {object} payload
   */
  async uploadFileStream(streamId, payload) {
    return this.bot.sendApi('upload_file_stream', {
      stream_id: streamId,
      ...payload
    });
  }

  /**
   * 将 Buffer 通过流式上传发给 NapCat，返回 file_path
   * @param {Buffer} buffer
   * @param {string} [filename='video.mp4']
   * @param {number} [chunkSize]
   * @returns {Promise<{file_path: string, file_size: number, sha256?: string}>}
   */
  async uploadBuffer(buffer, filename = 'video.mp4', chunkSize = DEFAULT_CHUNK_SIZE) {
    const streamId = crypto.randomUUID();
    const totalChunks = Math.ceil(buffer.length / chunkSize);
    const fileSize = buffer.length;

    // 1. 创建流
    await this.uploadFileStream(streamId, {
      total_chunks: totalChunks,
      file_size: fileSize,
      filename,
      file_retention: 5 * 60 * 1000, // 5分钟保留
    });

    // 2. 发送分片
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, buffer.length);
      const chunkData = buffer.slice(start, end).toString('base64');
      await this.uploadFileStream(streamId, {
        chunk_data: chunkData,
        chunk_index: i,
        total_chunks: totalChunks,
      });
    }

    // 3. 完成合并，获取 file_path
    const result = await this.uploadFileStream(streamId, {
      is_complete: true,
    });

    return result;
  }

  /**
   * 通过 file_path 发送视频消息
   * 直接使用 send_msg 绕开 TRSS 的 base64 转换
   */
  async sendVideoByPath(e, filePath) {
    const message = [{
      type: 'video',
      data: { file: filePath }
    }];
    if (e.group_id) {
      return this.bot.sendApi('send_msg', { group_id: e.group_id, message });
    } else {
      return this.bot.sendApi('send_msg', { user_id: e.user_id, message });
    }
  }
}
