import plugin from '../../../lib/plugins/plugin.js'
import { createRequire } from 'module'
import _ from 'lodash'
import { Restart } from '../../other/restart.js'
import {
  readYaml,
  writeYaml,
  getGeminiModelsByFetch,
} from '../utils/common.js'
import { pluginRoot } from '../model/path.js'
import Config from '../components/Config.js'

const require = createRequire(import.meta.url)
const { exec, execSync } = require('child_process')

// 是否在更新中
let uping = false

/**
 * 处理插件更新
 */
export class update extends plugin {
  constructor() {
    super({
      name: 'siliconflow-更新插件',
      event: 'message',
      priority: 1009,
      rule: [
        {
          reg: '^#sf((插件)?(强制)?更新| update)(\s*(dev|DEV|main|MAIN))?$',
          fnc: 'update'
        },
        {
          reg: '^#sf插件立即执行每日自动任务$',
          fnc: 'sf_Auto_tasker',
          permission: 'master'
        },
      ]
    })
    this.task = [
      {
        // 每日 0:11 am
        cron: '0 11 0 * * ?',
        name: 'sf插件自动任务',
        fnc: this.sf_Auto_tasker.bind(this)
      },
    ]
  }

  /**
   * rule - 更新sf
   * @returns
   */
  async update() {
    if (!this.e.isMaster) return false

    /** 检查是否正在更新中 */
    if (uping) {
      await this.reply('已有命令更新中..请勿重复操作')
      return
    }

    /** 检查git安装 */
    if (!(await this.checkGit())) return

    const isForce = this.e.msg.includes('强制')
    // 检查是否为dev分支更新
    const isDevUpdate = this.e.msg.includes('dev') || this.e.msg.includes('DEV')
    // 检查是否为dev分支更新
    const isMainUpdate = this.e.msg.includes('main') || this.e.msg.includes('MAIN')

    /** 执行更新 */
    await this.runUpdate(isForce, isDevUpdate, isMainUpdate)

    /** 是否需要重启 */
    if (this.isUp) {
      // await this.reply("更新完毕，请重启云崽后生效")
      setTimeout(() => this.restart(), 2000)
    }
  }

  restart() {
    new Restart(this.e).restart()
  }

  /**
   * 更新
   * @param {boolean} isForce 是否为强制更新
   * @param {boolean} isDevUpdate 是否为更新 dev
   * @param {boolean} isMainUpdate 是否为更新 main
   * @returns
   */
  async runUpdate(isForce, isDevUpdate, isMainUpdate) {
    let command = 'git -C ./plugins/siliconflow-plugin/ pull --no-rebase'

    if (isForce && isDevUpdate) {
      // dev分支强制更新
      command = 'git -C ./plugins/siliconflow-plugin/ reset --hard HEAD && git -C ./plugins/siliconflow-plugin/ clean -fd && git -C ./plugins/siliconflow-plugin/ checkout dev && git -C ./plugins/siliconflow-plugin/ fetch --all && git -C ./plugins/siliconflow-plugin/ reset --hard origin/dev'
      this.e.reply('正在执行dev分支强制更新操作，请稍等')
    } else if (isForce && isMainUpdate) {
      // main分支强制更新
      command = 'git -C ./plugins/siliconflow-plugin/ reset --hard HEAD && git -C ./plugins/siliconflow-plugin/ clean -fd && git -C ./plugins/siliconflow-plugin/ checkout main && git -C ./plugins/siliconflow-plugin/ fetch --all && git -C ./plugins/siliconflow-plugin/ reset --hard origin/main'
      this.e.reply('正在执行main分支强制更新操作，请稍等')
    } else if (isForce) {
      command = `git -C ./plugins/siliconflow-plugin/ reset --hard HEAD && git -C ./plugins/siliconflow-plugin/ clean -fd && git -C ./plugins/siliconflow-plugin/ checkout . && ${command}`
      this.e.reply('正在执行强制更新操作，请稍等')
    } else {
      this.e.reply('正在执行更新操作，请稍等')
    }
    /** 获取上次提交的commitId，用于获取日志时判断新增的更新日志 */
    this.oldCommitId = await this.getcommitId('siliconflow-plugin')
    uping = true
    let ret = await this.execSync(command)
    uping = false

    if (ret.error) {
      logger.mark(`${this.e.logFnc} 更新失败：siliconflow-plugin`)
      this.gitErr(ret.error, ret.stdout)
      return false
    }

    /** 获取插件提交的最新时间 */
    let time = await this.getTime('siliconflow-plugin')

    if (/(Already up[ -]to[ -]date|已经是最新的)/.test(ret.stdout)) {
      await this.reply(`siliconflow-plugin${isDevUpdate ? '(dev分支)' : ''}${isMainUpdate ? '(main分支)' : ''}已经是最新版本\n最后更新时间：${time}`)
    } else {
      await this.reply(`siliconflow-plugin${isDevUpdate ? '(dev分支)' : ''}${isMainUpdate ? '(main分支)' : ''}\n最后更新时间：${time}`)
      this.isUp = true
      /** 获取siliconflow-plugin的更新日志 */
      let log = await this.getLog('siliconflow-plugin')
      await this.reply(log)
    }

    logger.mark(`${this.e.logFnc} 最后更新时间：${time}`)

    return true
  }

  /**
   * 获取siliconflow-plugin的更新日志
   * @param {string} plugin 插件名称
   * @returns
   */
  async getLog(plugin = '') {
    let cm = `cd ./plugins/${plugin}/ && git log  -20 --oneline --pretty=format:"%h||[%cd]  %s" --date=format:"%m-%d %H:%M"`

    let logAll
    try {
      logAll = await execSync(cm, { encoding: 'utf-8' })
    } catch (error) {
      logger.error(error.toString())
      this.reply(error.toString())
    }

    if (!logAll) return false

    logAll = logAll.split('\n')

    let log = []
    for (let str of logAll) {
      str = str.split('||')
      if (str[0] == this.oldCommitId) break
      if (str[1].includes('Merge branch')) continue
      log.push(str[1])
    }
    let line = log.length
    log = log.join('\n\n')

    if (log.length <= 0) return ''

    let end = ''
    end =
      '更多详细信息，请前往github查看\nhttps://github.com/AIGC-Yunzai/siliconflow-plugin/commits/main'

    log = await this.makeForwardMsg(`siliconflow-plugin更新日志，共${line}条`, log, end)

    return log
  }

  /**
   * 获取上次提交的commitId
   * @param {string} plugin 插件名称
   * @returns
   */
  async getcommitId(plugin = '') {
    let cm = `git -C ./plugins/${plugin}/ rev-parse --short HEAD`

    let commitId = await execSync(cm, { encoding: 'utf-8' })
    commitId = _.trim(commitId)

    return commitId
  }

  /**
   * 获取本次更新插件的最后一次提交时间
   * @param {string} plugin 插件名称
   * @returns
   */
  async getTime(plugin = '') {
    let cm = `cd ./plugins/${plugin}/ && git log -1 --oneline --pretty=format:"%cd" --date=format:"%m-%d %H:%M"`

    let time = ''
    try {
      time = await execSync(cm, { encoding: 'utf-8' })
      time = _.trim(time)
    } catch (error) {
      logger.error(error.toString())
      time = '获取时间失败'
    }
    return time
  }

  /**
   * 制作转发消息
   * @param {string} title 标题 - 首条消息
   * @param {string} msg 日志信息
   * @param {string} end 最后一条信息
   * @returns
   */
  async makeForwardMsg(title, msg, end) {
    let nickname = (this.e.bot ?? Bot).nickname
    if (this.e.isGroup) {
      let info = await (this.e.bot ?? Bot).getGroupMemberInfo?.(this.e.group_id, (this.e.bot ?? Bot).uin) || await (this.e.bot ?? Bot).pickMember?.(this.e.group_id, (this.e.bot ?? Bot).uin);
      nickname = info.card || info.nickname
    }
    let userInfo = {
      user_id: (this.e.bot ?? Bot).uin,
      nickname
    }

    let forwardMsg = [
      {
        ...userInfo,
        message: title
      },
      {
        ...userInfo,
        message: msg
      }
    ]

    if (end) {
      forwardMsg.push({
        ...userInfo,
        message: end
      })
    }

    /** 制作转发内容 */
    if (this.e.group?.makeForwardMsg) {
      forwardMsg = await this.e.group.makeForwardMsg(forwardMsg)
    } else if (this.e?.friend?.makeForwardMsg) {
      forwardMsg = await this.e.friend.makeForwardMsg(forwardMsg)
    } else {
      return msg.join('\n')
    }

    let dec = 'siliconflow-plugin 更新日志'
    /** 处理描述 */
    if (typeof (forwardMsg.data) === 'object') {
      let detail = forwardMsg.data?.meta?.detail
      if (detail) {
        detail.news = [{ text: dec }]
      }
    } else {
      forwardMsg.data = forwardMsg.data
        .replace(/\n/g, '')
        .replace(/<title color="#777777" size="26">(.+?)<\/title>/g, '___')
        .replace(/___+/, `<title color="#777777" size="26">${dec}</title>`)
    }

    return forwardMsg
  }

  /**
   * 处理更新失败的相关函数
   * @param {string} err
   * @param {string} stdout
   * @returns
   */
  async gitErr(err, stdout) {
    let msg = '更新失败！'
    let errMsg = err.toString()
    stdout = stdout.toString()

    if (errMsg.includes('Timed out')) {
      let remote = errMsg.match(/'(.+?)'/g)[0].replace(/'/g, '')
      await this.reply(msg + `\n连接超时：${remote}`)
      return
    }

    if (/Failed to connect|unable to access/g.test(errMsg)) {
      let remote = errMsg.match(/'(.+?)'/g)[0].replace(/'/g, '')
      await this.reply(msg + `\n连接失败：${remote}`)
      return
    }

    if (errMsg.includes('be overwritten by merge')) {
      await this.reply(
        msg +
        `存在冲突：\n${errMsg}\n` +
        '请解决冲突后再更新，或者执行#强制更新，放弃本地修改'
      )
      return
    }

    if (stdout.includes('CONFLICT')) {
      await this.reply([
        msg + '存在冲突\n',
        errMsg,
        stdout,
        '\n请解决冲突后再更新，或者执行#强制更新，放弃本地修改'
      ])
      return
    }

    await this.reply([errMsg, stdout])
  }

  /**
   * 异步执行git相关命令
   * @param {string} cmd git命令
   * @returns
   */
  async execSync(cmd) {
    return new Promise((resolve, reject) => {
      exec(cmd, { windowsHide: true }, (error, stdout, stderr) => {
        resolve({ error, stdout, stderr })
      })
    })
  }

  /**
   * 检查git是否安装
   * @returns
   */
  async checkGit() {
    let ret = await execSync('git --version', { encoding: 'utf-8' })
    if (!ret || !ret.includes('git version')) {
      await this.reply('请先安装git')
      return false
    }
    return true
  }

  /** task任务 */
  async sf_Auto_tasker(e = null) {
    // 更新 gemini model
    try {
      const config_date = Config.getConfig()
      const m = await import('./SF_Painting.js');
      const sf = new m.SF_Painting();
      const geminiModelsByFetch = await getGeminiModelsByFetch(sf.get_random_key(config_date.ggKey) || sf.get_random_key(sf.ggKeyFreeDecode(config_date.ggKey_free_250822)), config_date.ggBaseUrl || "https://gemini.maliy.top");
      if (geminiModelsByFetch && Array.isArray(geminiModelsByFetch)) {
        writeYaml(`${pluginRoot}/config/config/geminiModelsByFetch.yaml`, geminiModelsByFetch);
        logger.info('[sf插件自动任务] 成功更新 Gemini 模型列表');
      } else {
        logger.warn('[sf插件自动任务] 获取到的 Gemini 模型列表为空或格式不正确');
      }
      if (e?.reply) e.reply('[sf插件自动任务] 成功更新 Gemini 模型列表，请刷新锅巴');
    } catch (err) {
      logger.error(`[sf插件自动任务] 每日获取Gemini模型错误:\n` + err)
      if (e?.reply) e.reply('[sf插件自动任务] 每日获取Gemini模型错误')
    }

    return true
  }
}
