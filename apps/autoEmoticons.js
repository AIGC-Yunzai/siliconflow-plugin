import fs from 'node:fs'
import path from 'node:path'
import chokidar from 'chokidar'
import plugin from '../../../lib/plugins/plugin.js'
import Config from '../components/Config.js'
import { getBotByQQ } from '../utils/onebotUtils.js'

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

// 存储各群表情列表的缓存
const emojiListCache = new Map()

// 存储共享图片列表的缓存
const sharedPicturesCache = []

// 存储目录监视器
const watchers = new Map()

// 共享图片目录监视器
let sharedPicturesWatcher = null

/**
 * 兼容旧版配置：将旧版的字符串数组转换为对象数组
 */
function getNormalizedAllowGroups(config) {
    const groups = config.autoEmoticons?.allowGroups || [];
    return groups.map(g => {
        if (typeof g === 'string' || typeof g === 'number') {
            return { groupId: String(g), switchOn: true };
        }
        return g;
    });
}

/**
 * 检查当前时间是否在允许的活跃时间范围内
 * 支持跨夜时间段，如 22:00-06:00
 * @param {Object} timeConfig 时间限制配置对象（可以是全局或群单独配置）
 * @returns {boolean} 是否在活跃时间内
 */
function isWithinActiveTime(timeConfig) {
    // 如果时间限制未启用，直接返回 true
    if (!timeConfig?.timeRestrictionEnabled) return true;

    // 获取根据时区调整后的当前时间
    const currentDate = new Date();
    const currentTime = currentDate.getHours() * 60 + currentDate.getMinutes();

    /**
     * 解析时间字符串为分钟数
     * @param {string|number} timeVal 时间值（如 "08:00" 或纯数字小时）
     * @returns {number} 从0点开始的分钟数
     */
    const parseTime = (timeVal) => {
        if (!timeVal) return 0;
        const timeStr = String(timeVal);
        if (!timeStr.includes(':')) {
            return (Number(timeStr) || 0) * 60;
        }
        const [hours, minutes] = timeStr.split(':').map(Number);
        return (hours || 0) * 60 + (minutes || 0);
    };

    const startTime = parseTime(timeConfig.activeStartTime || "08:00");
    const endTime = parseTime(timeConfig.activeEndTime || "23:00");

    if (startTime <= endTime) {
        // 正常白天区间：如 08:00 - 23:00
        return currentTime >= startTime && currentTime <= endTime;
    } else {
        // 跨夜区间：如 22:00 - 06:00 (大于晚上10点，或小于早上6点)
        return currentTime >= startTime || currentTime <= endTime;
    }
}

/**
 * 获取群的时间限制配置
 * @param {Object} config 全局配置
 * @param {Object} groupConfItem 群单独配置项
 * @returns {Object}
 */
function getGroupTimeConfig(config, groupConfItem) {
    const global = config.autoEmoticons;
    return {
        timeRestrictionEnabled: groupConfItem?.timeRestrictionEnabled ?? global?.timeRestrictionEnabled ?? false,
        activeStartTime: groupConfItem?.activeStartTime ?? global?.activeStartTime ?? "08:00",
        activeEndTime: groupConfItem?.activeEndTime ?? global?.activeEndTime ?? "23:00",
        restrictScheduledTask: groupConfItem?.restrictScheduledTask ?? global?.restrictScheduledTask ?? false,
        restrictMessageTrigger: groupConfItem?.restrictMessageTrigger ?? global?.restrictMessageTrigger ?? false,
    };
}

/**
 * 初始化共享图片目录监视器
 */
function initSharedPicturesWatcher() {
    if (sharedPicturesWatcher) return

    const sharedPicturesDir = path.join(process.cwd(), 'data', 'autoEmoticons', 'PaimonChuoYiChouPictures')

    // 确保目录存在
    if (!fs.existsSync(sharedPicturesDir)) {
        fs.mkdirSync(sharedPicturesDir, { recursive: true })
    }

    // 递归读取所有图片文件
    function loadSharedPictures(dir) {
        const pictures = []
        try {
            const items = fs.readdirSync(dir, { withFileTypes: true })
            for (const item of items) {
                const fullPath = path.join(dir, item.name)
                if (item.isDirectory()) {
                    // 递归处理子目录
                    pictures.push(...loadSharedPictures(fullPath))
                } else if (item.isFile()) {
                    // 检查是否为图片文件
                    const ext = path.extname(item.name).toLowerCase()
                    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) {
                        pictures.push(fullPath)
                    }
                }
            }
        } catch (err) {
            logger.error(`[autoEmoticons] 读取共享图片目录失败: ${err}`)
        }
        return pictures
    }

    // 初始加载共享图片
    const initialPictures = loadSharedPictures(sharedPicturesDir)
    sharedPicturesCache.splice(0, sharedPicturesCache.length, ...initialPictures)
    logger.info(`[autoEmoticons] 已加载 ${sharedPicturesCache.length} 个共享图片`)

    // 创建监视器
    sharedPicturesWatcher = chokidar.watch(sharedPicturesDir, {
        persistent: true,
        ignoreInitial: true,
        recursive: true, // 递归监视子目录
        awaitWriteFinish: {
            stabilityThreshold: 1000,
            pollInterval: 100
        }
    })

    // 监听文件添加事件
    sharedPicturesWatcher.on('add', (filepath) => {
        const ext = path.extname(filepath).toLowerCase()
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) {
            if (!sharedPicturesCache.includes(filepath)) {
                sharedPicturesCache.push(filepath)
                logger.debug(`[autoEmoticons] 监测到新共享图片: ${path.relative(sharedPicturesDir, filepath)}`)
            }
        }
    })

    // 监听文件删除事件
    sharedPicturesWatcher.on('unlink', (filepath) => {
        const index = sharedPicturesCache.indexOf(filepath)
        if (index > -1) {
            sharedPicturesCache.splice(index, 1)
            logger.debug(`[autoEmoticons] 监测到共享图片删除: ${path.relative(sharedPicturesDir, filepath)}`)
        }
    })

    // 监听错误事件
    sharedPicturesWatcher.on('error', (error) => {
        logger.error(`[autoEmoticons] 共享图片目录监视器错误: ${error}`)
    })
}

/**
 * 获取可用的图片列表（群专属 + 共享图片）
 * @param {string} groupId 群号
 * @returns {Array} 图片路径列表
 */
export function getAvailablePictures(groupId) {
    const groupEmojis = emojiListCache.get(String(groupId)) || []
    const emojiSaveDir = path.join(process.cwd(), 'data', 'autoEmoticons', 'emoji_save', String(groupId))

    // 群专属表情的完整路径
    const groupEmojiPaths = groupEmojis.map(filename => path.join(emojiSaveDir, filename))

    // 合并群专属表情和共享图片
    return [...groupEmojiPaths, ...sharedPicturesCache]
}

/**
 * 初始化表情目录监视器
 * @param {string} groupId 群号
 */
function initWatcher(groupId) {
    // 如果已有监视器，则返回
    if (watchers.has(groupId)) return

    const emojiSaveDir = path.join(process.cwd(), 'data', 'autoEmoticons', 'emoji_save', `${groupId}`)

    // 确保目录存在
    if (!fs.existsSync(emojiSaveDir)) {
        fs.mkdirSync(emojiSaveDir, { recursive: true })
    }

    // 初始化表情列表缓存
    if (!emojiListCache.has(groupId)) {
        emojiListCache.set(groupId, [])
    }

    // 读取初始表情列表
    try {
        const files = fs.readdirSync(emojiSaveDir)
        emojiListCache.set(groupId, files)
        logger.info(`[autoEmoticons] 已加载群 ${groupId} 的 ${files.length} 个表情`)
    } catch (err) {
        logger.error(`[autoEmoticons] 读取表情目录失败: ${err}`)
    }

    // 创建监视器
    const watcher = chokidar.watch(emojiSaveDir, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
            stabilityThreshold: 1000,
            pollInterval: 100
        }
    })

    // 监听文件添加事件
    watcher.on('add', (filepath) => {
        const filename = path.basename(filepath)
        const emojiList = emojiListCache.get(groupId) || []
        if (!emojiList.includes(filename)) {
            emojiList.push(filename)
            emojiListCache.set(groupId, emojiList)
            logger.debug(`[autoEmoticons] 监测到新表情: ${filename}`)
        }
    })

    // 监听文件删除事件
    watcher.on('unlink', (filepath) => {
        const filename = path.basename(filepath)
        const emojiList = emojiListCache.get(groupId) || []
        const index = emojiList.indexOf(filename)
        if (index > -1) {
            emojiList.splice(index, 1)
            emojiListCache.set(groupId, emojiList)
            logger.debug(`[autoEmoticons] 监测到表情删除: ${filename}`)
        }
    })

    // 监听错误事件
    watcher.on('error', (error) => {
        logger.error(`[autoEmoticons] 目录监视器错误: ${error}`)
    })

    // 保存监视器
    watchers.set(groupId, watcher)
}

const useEmojiSave_Switch = Config.getConfig().autoEmoticons?.useEmojiSave;

/**
 * 自动表情包插件
 */
export class autoEmoticons extends plugin {
    constructor() {
        const regStr = useEmojiSave_Switch ? "" : `sf-plugin-autoEmoticons-${Math.floor(10000 + Math.random() * 90000)}`;
        super({
            name: '自动表情包',
            dsc: '自动保存群聊中多次出现的图片作为表情包，并随机发送',
            event: 'message.group',
            priority: 5000,
            rule: [
                {
                    reg: regStr,
                    fnc: 'autoEmoticonsTrigger',
                    log: false
                },
                {
                    reg: '^#?(哒|达)咩$',
                    fnc: 'deleteEmoji',
                },
                {
                    reg: '^#?(哒|达)咩记录(第\\d+页|\\d+)?$',
                    fnc: 'showDamieRecord',
                },
                {
                    reg: '^#?(哒|达)咩恢复(\\d+)?$',
                    fnc: 'restoreDamie',
                },
                {
                    reg: '^#表情包配置$',
                    fnc: 'showConfig',
                },
                {
                    reg: '^#自动表情包(开启|关闭)$',
                    fnc: 'toggleGroupEmoticons',
                }
            ],
        })
        this.task = [
            {
                // 每5分钟执行一次
                cron: '0 */5 * * * *',
                name: '自动表情包-发送表情',
                fnc: this.sendimg.bind(this),
                log: false
            },
        ]
    }

    async autoEmoticonsTrigger(e) {
        this.saveAndSendEmoji(e);
        // 继续执行后续插件
        return false;
    }

    async saveAndSendEmoji(e) {
        if (!useEmojiSave_Switch) return false
        const config = Config.getConfig()
        if (!e.isGroup) return false

        const groupId = String(e.group_id)
        const allowGroups = getNormalizedAllowGroups(config)

        // 检查群号是否在允许列表中
        const groupConfItem = allowGroups.find(g => String(g.groupId) === groupId)

        if (allowGroups.length > 0 && !groupConfItem) {
            return false // 不在白名单
        }
        if (groupConfItem && groupConfItem.switchOn === false) {
            return false // 主动关闭
        }

        // 合并群独立配置与全局配置
        const groupConf = {
            confirmCount: groupConfItem?.confirmCount ?? 3,
            maxEmojiCount: groupConfItem?.maxEmojiCount ?? 100,
            sendCD: groupConfItem?.sendCD ?? 299,
            replyRate: groupConfItem?.replyRate ?? 0.05
        }

        // 初始化该群的监视器和共享图片监视器
        initWatcher(groupId)
        initSharedPicturesWatcher()

        // 获取表情保存目录路径
        const emojiSaveDir = path.join(process.cwd(), 'data', 'autoEmoticons', 'emoji_save', `${groupId}`)

        // 从缓存获取表情列表
        const emojiList = emojiListCache.get(groupId) || []

        // 处理消息中的图片
        for (const item of e.message) {
            if (item.type === 'image') {
                // 检查图片大小，如果没有file_size字段则直接处理
                if (item.file_size && item.file_size >= (config.autoEmoticons.maxEmojiSize * 1024 * 1024)) continue

                // 获取图片唯一ID - 优先使用filename字段
                const fileUnique = item.filename
                    ? item.filename.split('.')[0]
                    : item.file.split('/').pop().split('.')[0] || item.url.split('/').pop().split('.')[0]

                try {
                    // 检查是否在黑名单中（过大的图片/已#哒咩 过的不再下载）
                    const blockKey = `Yz:autoEmoticons:blocked:${fileUnique}`
                    const isBlocked = await redis.get(blockKey)
                    if (isBlocked) {
                        logger.debug(`[autoEmoticons] 不下载已知过大的表情/图片: ${fileUnique}`)
                        continue
                    }

                    // 从filename获取图片类型，如果没有则从URL获取或默认使用jpg
                    const imgType = item.filename
                        ? item.filename.split('.').pop()
                        : (item.file.split('.').pop() || 'jpg')
                    const filename = `${fileUnique}.${imgType}`

                    // 检查是否已经保存过此表情
                    if (!emojiList.includes(`${fileUnique}.jpg`) && !emojiList.includes(`${filename}`)) {
                        let canBeStored = false
                        // 检查Redis中是否已有记录
                        const redisKey = `Yz:autoEmoticons:${groupId}:${fileUnique}`
                        const currentCount = await redis.get(redisKey)

                        if (!currentCount) {
                            // 首次发现，设置为1并设置过期时间
                            await redis.set(redisKey, '1', {
                                EX: config.autoEmoticons.expireTimeInSeconds
                            })
                            logger.debug(`[autoEmoticons] 表情首次出现: ${fileUnique} (1/${groupConf.confirmCount})`)
                        } else {
                            // 增加计数
                            const newCount = parseInt(currentCount) + 1
                            await redis.set(redisKey, String(newCount), {
                                EX: config.autoEmoticons.expireTimeInSeconds
                            })

                            // 检查是否达到保存阈值
                            if (newCount >= groupConf.confirmCount) {
                                // 达到指定次数，可以保存
                                await redis.del(redisKey)
                                canBeStored = true
                                logger.debug(`[autoEmoticons] 已达到确认次数: ${fileUnique} (${groupConf.confirmCount}/${groupConf.confirmCount})`)
                            } else {
                                logger.debug(`[autoEmoticons] 表情再次出现: ${fileUnique} (${newCount}/${groupConf.confirmCount})`)
                            }
                        }

                        if (!canBeStored) continue

                        // 使用URL下载图片
                        const downloadResult = await downloadImageFile(
                            item.url,
                            `emoji_save/${groupId}/${fileUnique}`,
                            config.autoEmoticons.maxEmojiSize
                        )

                        if (!downloadResult.success) {
                            logger.error(`[autoEmoticons] 下载表情失败: ${downloadResult.error}`)

                            // 如果是因为文件过大而失败，添加到黑名单
                            if (downloadResult.error && downloadResult.error.includes('文件过大')) {
                                const ONE_MONTH_IN_SECONDS = 30 * 24 * 60 * 60 // 30天的秒数
                                await redis.set(blockKey, '1', {
                                    EX: ONE_MONTH_IN_SECONDS
                                })
                                logger.mark(`[autoEmoticons] 表情文件过大，已加入黑名单: ${fileUnique}，大小: ${downloadResult.size}，30天内不再下载`)
                            }
                            continue
                        }

                        const actualFilename = `${fileUnique}.${downloadResult.actualExt}`
                        logger.mark(`[autoEmoticons] 保存表情成功: ${actualFilename}，大小: ${downloadResult.size} 字节`)

                        // 控制表情数量
                        if (emojiList.length > groupConf.maxEmojiCount) {
                            const randomIndex = Math.floor(Math.random() * emojiList.length)
                            const fileToDelete = emojiList[randomIndex]
                            try {
                                fs.unlinkSync(path.join(emojiSaveDir, fileToDelete))
                                logger.debug(`[autoEmoticons] 表情数量过多，删除: ${fileToDelete}`)
                            } catch (err) {
                                logger.error(`[autoEmoticons] 删除表情失败: ${err}`)
                            }
                        }
                    }
                } catch (error) {
                    logger.error(`[autoEmoticons] 处理表情出错: ${error}`)
                }
            }
        }

        // 检查群发送冷却时间
        const cooldownKey = `Yz:autoEmoticons:cooldown:${groupId}`
        const lastSendTime = await redis.get(cooldownKey)
        const now = Date.now()

        if (lastSendTime && (now - parseInt(lastSendTime)) < (groupConf.sendCD * 1000)) {
            const remainingTime = Math.ceil(((parseInt(lastSendTime) + (groupConf.sendCD * 1000)) - now) / 1000)
            logger.debug(`[autoEmoticons] 群 ${groupId} 还在冷却中，剩余 ${remainingTime} 秒`)
            return false
        }

        // 如果消息触发被限制且不在活跃时间内，直接终止发送逻辑
        const timeConfig = getGroupTimeConfig(config, groupConfItem);
        if (timeConfig.restrictMessageTrigger !== false && !isWithinActiveTime(timeConfig)) {
            logger.debug(`[autoEmoticons] 群 ${groupId} 消息触发：当前不在活跃时间范围内，跳过发送`);
            return false;
        }

        // 随机发送表情包（包含共享图片）
        const availablePictures = getAvailablePictures(groupId)
        if (Math.random() < groupConf.replyRate && availablePictures.length > 0) {
            let msgRet, msgRet_id
            try {
                // 设置冷却时间
                await redis.set(cooldownKey, String(now), { EX: groupConf.sendCD })

                // 随机选择一个图片
                const randomIndex = Math.floor(Math.random() * availablePictures.length)
                const picturePath = availablePictures[randomIndex]

                // 添加随机延迟
                const delay = randomInt(config.autoEmoticons.replyDelay.min, config.autoEmoticons.replyDelay.max)
                logger.mark(`[autoEmoticons] 群${e.group_id} 将在${delay}毫秒后发送表情包`)
                await sleep(delay)

                // 发送图片
                msgRet = await e.reply(segment.image(picturePath))
                msgRet_id = msgRet.seq || msgRet.data?.message_id || msgRet.time

                // 存储文件信息（用于删除功能）
                const isSharedPicture = sharedPicturesCache.includes(picturePath)
                const fileInfo = isSharedPicture
                    ? `shared:${path.relative(path.join(process.cwd(), 'data', 'autoEmoticons', 'PaimonChuoYiChouPictures'), picturePath)}`
                    : path.basename(picturePath)

                redis.set(`Yz:autoEmoticons.sent:pic_filePath:${groupId}:${msgRet_id}`, fileInfo, { EX: 60 * 60 * 24 * 1 })
                logger.debug(`[autoEmoticons] 概率发送图片成功: ${picturePath}`)
            } catch (error) {
                logger.error(`[autoEmoticons] 发送图片失败: ${error}`)
            }
        }

        return false
    }

    /** 用于戳一戳等 主动发送表情包 */
    async sendimg_Active(e) {
        const groupId = String(e.group_id)
        // 初始化共享图片监视器
        initSharedPicturesWatcher()
        // 初始化该群的监视器
        initWatcher(groupId);
        try {
            // 获取可用图片列表（群专属 + 共享）
            const availablePictures = getAvailablePictures(groupId)
            // 如果没有可用图片，跳过此群
            if (availablePictures.length === 0) {
                logger.debug(`[autoEmoticons] 主动发送图片到群 ${groupId} 没有可用图片，跳过`);
                return false;
            }
            // 随机选择一个图片
            const randomIndex = Math.floor(Math.random() * availablePictures.length);
            const picturePath = availablePictures[randomIndex];
            // 发送图片
            try {
                const msgRet = await e.reply(segment.image(picturePath));
                const msgId = msgRet.seq || msgRet.data?.message_id || msgRet.time

                // 存储文件信息
                const isSharedPicture = sharedPicturesCache.includes(picturePath)
                const fileInfo = isSharedPicture
                    ? `shared:${path.relative(path.join(process.cwd(), 'data', 'autoEmoticons', 'PaimonChuoYiChouPictures'), picturePath)}`
                    : path.basename(picturePath)

                await redis.set(`Yz:autoEmoticons.sent:pic_filePath:${groupId}:${msgId}`, fileInfo, {
                    EX: 60 * 60 * 24 * 1
                });
                logger.info(`[autoEmoticons] 主动发送图片到群 ${groupId}: ${picturePath}`);
            } catch (error) {
                logger.error(`[autoEmoticons] 主动发送图片到群 ${groupId} 失败: ${error}`);
            }
        } catch (error) {
            logger.error(`[autoEmoticons] 主动发送 ${groupId} 表情包出错: ${error}`);
        }
        return true;
    }

    async sendimg() {
        if (!useEmojiSave_Switch) return false;
        const config = Config.getConfig()

        // 初始化共享图片监视器
        initSharedPicturesWatcher()

        const allowGroups = getNormalizedAllowGroups(config);

        // 遍历配置的群列表
        for (const g of allowGroups) {
            try {
                if (g.switchOn === false) continue;

                const groupId = String(g.groupId);
                
                // 【时间限制检查】获取该群的时间配置，检查是否允许定时任务
                const timeConfig = getGroupTimeConfig(config, g);
                if (timeConfig.restrictScheduledTask !== false && !isWithinActiveTime(timeConfig)) {
                    logger.debug(`[autoEmoticons] 群 ${groupId} 定时任务：当前不在活跃时间范围内，跳过`);
                    continue;
                }
                
                const groupConf = {
                    sendCD: g.sendCD ?? 299,
                    replyRate: g.replyRate ?? 0.05
                }

                // 检查群发送冷却时间
                const cooldownKey = `Yz:autoEmoticons:cooldown:${groupId}`
                const lastSendTime = await redis.get(cooldownKey)
                const now = Date.now()

                if (lastSendTime && (now - parseInt(lastSendTime)) < (groupConf.sendCD * 1000)) {
                    const remainingTime = Math.ceil(((parseInt(lastSendTime) + (groupConf.sendCD * 1000)) - now) / 1000)
                    logger.debug(`[autoEmoticons] 群 ${groupId} 还在冷却中，剩余 ${remainingTime} 秒`)
                    continue
                }

                // 使用与手动触发相同的概率判断
                if (Math.random() >= groupConf.replyRate) {
                    logger.debug(`[autoEmoticons] 群 ${groupId} 随机概率未触发发送`);
                    continue;
                }

                // 初始化该群的监视器
                initWatcher(groupId);

                // 获取可用图片列表（群专属 + 共享）
                const availablePictures = getAvailablePictures(groupId)

                // 如果没有可用图片，跳过此群
                if (availablePictures.length === 0) {
                    logger.debug(`[autoEmoticons] 群 ${groupId} 没有可用图片，跳过`);
                    continue;
                }

                // 随机选择一个图片
                const randomIndex = Math.floor(Math.random() * availablePictures.length);
                const picturePath = availablePictures[randomIndex];

                // 发送图片
                try {
                    // 设置冷却时间
                    await redis.set(cooldownKey, String(now), { EX: groupConf.sendCD })

                    const group = getBotByQQ(config.autoEmoticons.getBotByQQ_targetQQArr).pickGroup(parseInt(groupId));
                    if (!group) {
                        logger.error(`[autoEmoticons] 无法获取群 ${groupId} 的实例`);
                        continue;
                    }

                    // 添加随机延迟
                    const delay = randomInt(config.autoEmoticons.replyDelay.min, config.autoEmoticons.replyDelay.max)
                    logger.mark(`[autoEmoticons] 群${groupId} 将在${(delay / 1000).toFixed(0)}秒后发送表情包 ${picturePath}`)
                    await sleep(delay)

                    const msgRet = await group.sendMsg(segment.image(picturePath));
                    const msgId = msgRet.seq || msgRet.data?.message_id || msgRet.time

                    // 存储文件信息
                    const isSharedPicture = sharedPicturesCache.includes(picturePath)
                    const fileInfo = isSharedPicture
                        ? `shared:${path.relative(path.join(process.cwd(), 'data', 'autoEmoticons', 'PaimonChuoYiChouPictures'), picturePath)}`
                        : path.basename(picturePath)

                    await redis.set(`Yz:autoEmoticons.sent:pic_filePath:${groupId}:${msgId}`, fileInfo, {
                        EX: 60 * 60 * 24 * 1
                    });

                    // logger.info(`[autoEmoticons] 定时任务发送图片到群 ${groupId}: ${picturePath}`);
                } catch (error) {
                    logger.error(`[autoEmoticons] 定时任务发送图片到群 ${groupId} 失败: ${error}`);
                }
            } catch (error) {
                logger.error(`[autoEmoticons] 处理群 定时发送任务出错: ${error}`);
            }
        }

        return false;
    }

    /**
     * 删除表情包（支持回收站功能）
     */
    async deleteEmoji(e) {
        const groupId = String(e.group_id)
        if (!e.isGroup || !e.isMaster) return false;

        const replyMsgId = e.source?.seq || e.reply_id;
        if (!replyMsgId) {
            return false;
        }

        const fileInfo = await redis.get(`Yz:autoEmoticons.sent:pic_filePath:${groupId}:${replyMsgId}`);
        if (!fileInfo) {
            logger.mark(`[autoEmoticons] 该图片也许不是本插件发送的`)
            return false;
        }

        try {
            let filePath;
            let fileUnique = null;

            if (fileInfo.startsWith('shared:')) {
                // 共享图片
                const relPath = fileInfo.substring(7);
                filePath = path.join(process.cwd(), 'data', 'autoEmoticons', 'PaimonChuoYiChouPictures', relPath);
                fileUnique = path.basename(fileInfo, path.extname(fileInfo));
            } else {
                // 群专属表情
                filePath = path.join(process.cwd(), 'data', 'autoEmoticons', 'emoji_save', groupId, fileInfo);
                // 获取文件唯一标识，去除扩展名
                fileUnique = path.basename(fileInfo, path.extname(fileInfo));
            }

            if (filePath && fs.existsSync(filePath)) {
                const filename = path.basename(filePath);
                const config = Config.getConfig();
                const allowGroups = getNormalizedAllowGroups(config);
                const groupConfItem = allowGroups.find(g => String(g.groupId) === groupId);
                
                // 获取群的回收站配置
                const recycleBinConf = this.getGroupRecycleBinConfig(config, groupConfItem);
                const recycleBinEnabled = recycleBinConf.enable;

                if (recycleBinEnabled) {
                    // 启用了回收站，移入回收站
                    const recycleBinDir = path.join(process.cwd(), 'data', 'autoEmoticons', 'recycle_bin');
                    if (!fs.existsSync(recycleBinDir)) {
                        fs.mkdirSync(recycleBinDir, { recursive: true });
                    }

                    // 检查并清理超出上限的文件（使用群配置的上限）
                    await this.cleanRecycleBin(recycleBinConf);

                    // 移入回收站（添加时间戳前缀）
                    const timestamp = Date.now();
                    const targetPath = path.join(recycleBinDir, `${timestamp}_${filename}`);
                    fs.renameSync(filePath, targetPath);

                    // 记录原位置信息，用于恢复
                    const recycleInfoPath = path.join(recycleBinDir, `${timestamp}_${fileUnique}.json`);
                    fs.writeFileSync(recycleInfoPath, JSON.stringify({
                        originalPath: filePath,
                        groupId: groupId,
                        filename: filename,
                        recycleTime: timestamp
                    }));

                    logger.mark(`[autoEmoticons] 表情已移入回收站: ${filename}`);
                } else {
                    // 未启用回收站，直接删除
                    fs.unlinkSync(filePath);
                    logger.mark(`[autoEmoticons] 表情已直接删除: ${filename}`);
                }

                // 从缓存中移除
                const emojiList = emojiListCache.get(groupId) || [];
                const index = emojiList.indexOf(filename);
                if (index > -1) {
                    emojiList.splice(index, 1);
                    emojiListCache.set(groupId, emojiList);
                }

                // 将删除的表情添加到黑名单，30天内不再下载
                if (fileUnique) {
                    const blockKey = `Yz:autoEmoticons:blocked:${fileUnique}`
                    const ONE_MONTH_IN_SECONDS = 30 * 24 * 60 * 60 // 30天的秒数
                    await redis.set(blockKey, '1', {
                        EX: ONE_MONTH_IN_SECONDS
                    })
                    logger.mark(`[autoEmoticons] 表情已加入黑名单: ${fileUnique}，30天内不再下载`)
                }

                let res = await e.group.recallMsg(replyMsgId)
                if (!res) {
                    this.reply("人家不是管理员，不能撤回超过2分钟的消息呢~")
                }

                if (recycleBinEnabled) {
                    await e.reply(`呜呜呜~表情已移入回收站，可以使用"#哒咩记录"查看或"#哒咩恢复 [编号]"恢复~`);
                } else {
                    await e.reply(`呜呜呜~人家错了，以后不发了~呜`);
                }
            }

            await redis.del(`Yz:autoEmoticons.sent:pic_filePath:${groupId}:${replyMsgId}`);
        } catch (error) {
            logger.error(`[autoEmoticons] 删除表情失败: ${error}`);
        }

        return true;
    }

    /**
     * 获取群的回收站配置（优先使用群单独配置）
     * @param {Object} config 全局配置
     * @param {Object} groupConfItem 群单独配置项
     * @returns {Object} 回收站配置
     */
    getGroupRecycleBinConfig(config, groupConfItem) {
        const global = config.autoEmoticons?.recycleBin;
        
        // 如果群配置指定使用全局配置
        if (groupConfItem?.useGlobalRecycleBin !== false) {
            return {
                enable: global?.enable ?? false,
                maxItems: global?.maxItems ?? 100
            };
        }
        
        // 使用群单独配置
        return {
            enable: groupConfItem?.recycleBinEnable ?? global?.enable ?? false,
            maxItems: groupConfItem?.recycleBinMaxItems ?? global?.maxItems ?? 100
        };
    }

    /**
     * 清理回收站，保持不超过上限
     * @param {Object} recycleBinConf 回收站配置对象
     */
    async cleanRecycleBin(recycleBinConf) {
        const maxItems = recycleBinConf?.maxItems ?? 100;
        const recycleBinDir = path.join(process.cwd(), 'data', 'autoEmoticons', 'recycle_bin');
        
        if (!fs.existsSync(recycleBinDir)) return;

        // 获取所有文件（图片和json信息文件）
        const files = fs.readdirSync(recycleBinDir);
        const items = files
            .filter(f => !f.endsWith('.json')) // 只统计非json文件（图片）
            .map(f => {
                const parts = f.split('_');
                const ts = parseInt(parts[0]) || 0;
                return { name: f, time: ts };
            })
            .sort((a, b) => b.time - a.time); // 按时间倒序，最新的在前

        // 如果超出上限，删除最早的记录
        if (items.length > maxItems) {
            const itemsToDelete = items.slice(maxItems);
            for (const item of itemsToDelete) {
                const filePath = path.join(recycleBinDir, item.name);
                const jsonPath = path.join(recycleBinDir, item.name.replace(/\.[^.]+$/, '.json'));
                
                try {
                    fs.unlinkSync(filePath);
                    if (fs.existsSync(jsonPath)) {
                        fs.unlinkSync(jsonPath);
                    }
                    logger.mark(`[autoEmoticons] 回收站超出上限，删除最早记录: ${item.name}`);
                } catch (err) {
                    logger.error(`[autoEmoticons] 清理回收站失败: ${err}`);
                }
            }
        }
    }

    /**
     * 显示哒咩记录（支持分页查看）
     */
    async showDamieRecord(e) {
        const config = Config.getConfig();
        const groupId = String(e.group_id);
        const allowGroups = getNormalizedAllowGroups(config);
        const groupConfItem = allowGroups.find(g => String(g.groupId) === groupId);
        
        // 获取群的回收站配置
        const recycleBinConf = this.getGroupRecycleBinConfig(config, groupConfItem);
        const recycleBinEnabled = recycleBinConf.enable;
        
        if (!recycleBinEnabled) {
            await e.reply('回收站功能未开启，无法查看哒咩记录~\n如需开启请在锅巴配置中设置"哒咩回收站"');
            return true;
        }

        const recycleBinDir = path.join(process.cwd(), 'data', 'autoEmoticons', 'recycle_bin');
        if (!fs.existsSync(recycleBinDir)) {
            await e.reply('📭 回收站空空如也，还没有被哒咩的表情~');
            return true;
        }

        // 解析页码
        const msg = e.msg;
        const pageMatch = msg.match(/第(\d+)页/);
        let page = pageMatch ? parseInt(pageMatch[1]) : 1;
        const pageSize = 10;

        // 获取所有图片文件
        const files = fs.readdirSync(recycleBinDir);
        const images = files
            .filter(f => ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(path.extname(f).toLowerCase()))
            .map(f => {
                const parts = f.split('_');
                const ts = parseInt(parts[0]) || 0;
                return { name: f, time: ts, fullPath: path.join(recycleBinDir, f) };
            })
            .sort((a, b) => b.time - a.time); // 按时间倒序，最新的在前

        const totalItems = images.length;
        const maxPage = Math.ceil(totalItems / pageSize) || 1;
        
        // 校验页码
        page = Math.max(1, Math.min(page, maxPage));
        
        if (totalItems === 0) {
            await e.reply('📭 回收站空空如也，还没有被哒咩的表情~');
            return true;
        }

        // 计算当前页的数据
        const start = (page - 1) * pageSize;
        const end = Math.min(start + pageSize, totalItems);
        const pageItems = images.slice(start, end);

        // 构建消息
        let forwardMsg = [];
        
        // 标题
        forwardMsg.push(`📊 哒咩回收站\n━━━━━━━━━━━━━━\n🖼️ 总计: ${totalItems} 张 | 第 ${page}/${maxPage} 页\n💡 提示: #哒咩记录第X页 翻页 | #哒咩恢复编号 恢复`);

        // 图片列表
        for (let i = 0; i < pageItems.length; i++) {
            const item = pageItems[i];
            const globalIndex = start + i + 1;
            const date = new Date(item.time).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            forwardMsg.push([`编号 ${globalIndex} | ${date}\n`, segment.image(item.fullPath)]);
        }

        // 构建合并转发消息
        let forwardNode = [];
        for (let msgItem of forwardMsg) {
            forwardNode.push({
                user_id: Bot.uin,
                nickname: Bot.nickname,
                message: msgItem
            });
        }

        try {
            let replyMsg;
            if (e.isGroup) {
                replyMsg = await e.group.makeForwardMsg(forwardNode);
            } else {
                replyMsg = await e.friend.makeForwardMsg(forwardNode);
            }
            await e.reply(replyMsg);
        } catch (err) {
            logger.error(`[哒咩记录] 生成合并转发失败: ${err}`);
            await e.reply("生成记录失败，可能是当前框架或协议端暂不支持合并转发消息。");
        }
        
        return true;
    }

    /**
     * 恢复哒咩的图片
     */
    async restoreDamie(e) {
        const config = Config.getConfig();
        const groupId = String(e.group_id);
        const allowGroups = getNormalizedAllowGroups(config);
        const groupConfItem = allowGroups.find(g => String(g.groupId) === groupId);
        
        // 获取群的回收站配置
        const recycleBinConf = this.getGroupRecycleBinConfig(config, groupConfItem);
        const recycleBinEnabled = recycleBinConf.enable;
        
        if (!recycleBinEnabled) {
            await e.reply('回收站功能未开启，无法恢复表情~');
            return true;
        }

        // 解析恢复编号
        const msg = e.msg;
        const numMatch = msg.match(/(\d+)/);
        if (!numMatch) {
            await e.reply('请指定要恢复的编号，例如：#哒咩恢复 5');
            return true;
        }
        
        const restoreIndex = parseInt(numMatch[1]);
        if (restoreIndex < 1) {
            await e.reply('编号必须大于0哦~');
            return true;
        }

        const recycleBinDir = path.join(process.cwd(), 'data', 'autoEmoticons', 'recycle_bin');
        if (!fs.existsSync(recycleBinDir)) {
            await e.reply('回收站为空，没有可恢复的表情~');
            return true;
        }

        // 获取所有图片文件（按时间倒序）
        const files = fs.readdirSync(recycleBinDir);
        const images = files
            .filter(f => ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(path.extname(f).toLowerCase()))
            .map(f => {
                const parts = f.split('_');
                const ts = parseInt(parts[0]) || 0;
                return { name: f, time: ts, fullPath: path.join(recycleBinDir, f) };
            })
            .sort((a, b) => b.time - a.time);

        if (restoreIndex > images.length) {
            await e.reply(`编号 ${restoreIndex} 不存在，当前回收站只有 ${images.length} 个表情~\n使用 #哒咩记录 查看列表`);
            return true;
        }

        // 获取要恢复的文件
        const targetItem = images[restoreIndex - 1];
        const jsonPath = path.join(recycleBinDir, targetItem.name.replace(/\.[^.]+$/, '.json'));
        
        try {
            // 读取原位置信息
            let originalInfo = null;
            if (fs.existsSync(jsonPath)) {
                originalInfo = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            }

            // 确定恢复目标路径
            let targetPath;
            if (originalInfo && originalInfo.originalPath) {
                targetPath = originalInfo.originalPath;
            } else {
                // 如果没有记录原位置，恢复到默认群目录
                const groupId = String(e.group_id);
                targetPath = path.join(process.cwd(), 'data', 'autoEmoticons', 'emoji_save', groupId, targetItem.name.replace(/^\d+_/, ''));
            }

            // 确保目标目录存在
            const targetDir = path.dirname(targetPath);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            // 移动文件
            fs.renameSync(targetItem.fullPath, targetPath);
            
            // 删除json信息文件
            if (fs.existsSync(jsonPath)) {
                fs.unlinkSync(jsonPath);
            }

            // 从黑名单中移除（解除30天限制）
            const fileUnique = path.basename(targetItem.name.replace(/^\d+_/, ''), path.extname(targetItem.name));
            const blockKey = `Yz:autoEmoticons:blocked:${fileUnique}`;
            await redis.del(blockKey);

            // 刷新缓存
            const groupId = String(e.group_id);
            initWatcher(groupId);

            await e.reply(`✅ 成功恢复表情 [编号 ${restoreIndex}]！\n已移出黑名单，可以正常使用啦~`);
            logger.mark(`[autoEmoticons] 表情已从回收站恢复: ${targetItem.name} -> ${targetPath}`);

        } catch (err) {
            logger.error(`[autoEmoticons] 恢复表情失败: ${err}`);
            await e.reply(`恢复失败: ${err.message}`);
        }
        
        return true;
    }

    /**
     * 显示表情包配置信息
     */
    async showConfig(e) {
        if (!e.isGroup || !e.isMaster) {
            await e.reply('只有主人可以查看配置哦~')
            return true
        }

        const config = Config.getConfig()
        const groupId = String(e.group_id)

        // 获取当前群的表情数量
        const emojiList = emojiListCache.get(groupId) || []
        const groupEmojiCount = emojiList.length

        // 获取共享图片数量
        const sharedPictureCount = sharedPicturesCache.length

        // 格式化时间
        const formatTime = (seconds) => {
            const days = Math.floor(seconds / 86400)
            const hours = Math.floor((seconds % 86400) / 3600)
            const minutes = Math.floor((seconds % 3600) / 60)

            if (days > 0) return `${days}天${hours}小时${minutes}分钟`
            if (hours > 0) return `${hours}小时${minutes}分钟`
            return `${minutes}分钟`
        }

        // 格式化延迟时间
        const formatDelay = (ms) => {
            if (ms >= 60000) {
                return `${Math.floor(ms / 60000)}分${Math.floor((ms % 60000) / 1000)}秒`
            }
            return `${Math.floor(ms / 1000)}秒`
        }

        const allowGroups = getNormalizedAllowGroups(config)
        const groupConfItem = allowGroups.find(g => String(g.groupId) === groupId)

        // 获取回收站信息
        let recycleBinCount = 0;
        const recycleBinConf = this.getGroupRecycleBinConfig(config, groupConfItem);
        const recycleBinEnabled = recycleBinConf.enable;
        const isUsingGlobalRecycleBin = groupConfItem?.useGlobalRecycleBin !== false;
        
        if (recycleBinEnabled) {
            const recycleBinDir = path.join(process.cwd(), 'data', 'autoEmoticons', 'recycle_bin');
            if (fs.existsSync(recycleBinDir)) {
                const files = fs.readdirSync(recycleBinDir);
                recycleBinCount = files.filter(f => !f.endsWith('.json')).length;
            }
        }

        // 检查当前群是否在允许列表中
        const isGroupAllowed = allowGroups.length === 0 || (groupConfItem && groupConfItem.switchOn !== false)

        // 合并群独立配置和全局配置
        const groupConf = {
            confirmCount: groupConfItem?.confirmCount ?? 3,
            maxEmojiCount: groupConfItem?.maxEmojiCount ?? 100,
            sendCD: groupConfItem?.sendCD ?? 299,
            replyRate: groupConfItem?.replyRate ?? 0.05
        }

        // 检查冷却状态
        const cooldownKey = `Yz:autoEmoticons:cooldown:${groupId}`
        const lastSendTime = await redis.get(cooldownKey)
        const now = Date.now()
        let cooldownStatus = '无冷却'

        if (lastSendTime && (now - parseInt(lastSendTime)) < (groupConf.sendCD * 1000)) {
            const remainingTime = Math.ceil(((parseInt(lastSendTime) + (groupConf.sendCD * 1000)) - now) / 1000)
            cooldownStatus = `冷却中 (${formatTime(remainingTime)})`
        }

        // 获取该群的时间限制配置
        const timeConfig = getGroupTimeConfig(config, groupConfItem);
        
        const configMsg = [
            '📊 表情包插件配置状态',
            '━━━━━━━━━━━━━━━━━━',
            `🔧 功能状态: ${useEmojiSave_Switch ? '✅ 已启用' : '❌ 已禁用'}`,
            `🎯 当前群状态: ${isGroupAllowed ? '✅ 允许' : '❌ 未启用'}`,
            '',
            '📈 统计信息:',
            `　🖼️ 当前群表情: ${groupEmojiCount} 个`,
            `　🌐 共享图片: ${sharedPictureCount} 个`,
            recycleBinEnabled ? `　🗑️ 回收站: ${recycleBinCount} 张 (上限 ${recycleBinConf.maxItems})${isUsingGlobalRecycleBin ? '[全局]' : '[自定义]'}` : '',
            `　⏰ 发送冷却: ${cooldownStatus}`,
            '',
            '⚙️ 当前群生效参数:',
            `　🕐 活跃时间: ${timeConfig.timeRestrictionEnabled ? `${timeConfig.activeStartTime} ~ ${timeConfig.activeEndTime}` : '全天24小时'}`,
            timeConfig.timeRestrictionEnabled ? `　🔒 限制定时任务: ${timeConfig.restrictScheduledTask !== false ? '✅ 是' : '❌ 否'}` : '',
            timeConfig.timeRestrictionEnabled ? `　💬 限制消息触发: ${timeConfig.restrictMessageTrigger !== false ? '✅ 是' : '❌ 否'}` : '',
            `　⏱️ 记录时长: ${formatTime(config.autoEmoticons.expireTimeInSeconds)}`,
            `　🔢 确认次数: ${groupConf.confirmCount} 次`,
            `　🎲 发送概率: ${(groupConf.replyRate * 100).toFixed(1)}%`,
            `　📦 最大数量: ${groupConf.maxEmojiCount} 个`,
            `　📏 大小限制: ${config.autoEmoticons.maxEmojiSize} MB`,
            `　❄️ 冷却时间: ${formatTime(groupConf.sendCD)}`,
            `　⏳ 发送延迟: ${formatDelay(config.autoEmoticons.replyDelay.min)} ~ ${formatDelay(config.autoEmoticons.replyDelay.max)}`,
            '',
            '🎯 允许群组:',
            allowGroups.length === 0
                ? '　📢 所有群组 (未配置白名单)'
                : allowGroups.map(g => {
                    const status = g.switchOn !== false ? '✅' : '❌';
                    const customFlag = (g.replyRate || g.sendCD || g.confirmCount || g.maxEmojiCount) ? '(含独立配置)' : '';
                    return `　🏷️ ${g.groupId} ${status} ${customFlag}`;
                }).join('\n'),
            '━━━━━━━━━━━━━━━━━━'
        ].join('\n')

        await e.reply(configMsg)
        return true
    }

    /**
     * 切换当前群的自动表情包功能
     */
    async toggleGroupEmoticons(e) {
        if (!e.isGroup || !e.isMaster) {
            await e.reply('只有主人可以设置群表情包功能哦~')
            return true
        }

        const groupId = String(e.group_id)
        const action = e.msg.includes('开启') ? 'enable' : 'disable'

        // 格式化时间
        const formatTime = (seconds) => {
            const days = Math.floor(seconds / 86400)
            const hours = Math.floor((seconds % 86400) / 3600)
            const minutes = Math.floor((seconds % 3600) / 60)
            const secs = Math.floor(seconds % 60)

            if (days > 0) return `${days}天${hours}小时${minutes}分钟`
            if (hours > 0) return `${hours}小时${minutes}分钟`
            return `${minutes}分钟${secs}秒`
        }

        try {
            let config = Config.getConfig()
            // 获取当前规范化后的配置
            const currentAllowGroups = getNormalizedAllowGroups(config)
            const groupIndex = currentAllowGroups.findIndex(g => String(g.groupId) === groupId)

            if (action === 'enable') {
                // 开启功能
                if (groupIndex === -1) {
                    currentAllowGroups.push({ groupId: groupId, switchOn: true })
                } else {
                    currentAllowGroups[groupIndex].switchOn = true
                }

                // 更新配置
                config.autoEmoticons.allowGroups = currentAllowGroups

                // 初始化该群的监视器
                initWatcher(groupId)
                initSharedPicturesWatcher()

                // 获取生效的变量用于提示
                const gConf = currentAllowGroups.find(g => String(g.groupId) === groupId) || {};
                const replyRate = gConf.replyRate ?? 0.05;
                const confirmCount = gConf.confirmCount ?? 3;
                const sendCD = gConf.sendCD ?? 299;

                await e.reply([
                    '✅ 当前群自动表情包功能已开启！',
                    '',
                    '功能说明：',
                    `• 图片在 ${formatTime(config.autoEmoticons.expireTimeInSeconds)} 内出现 ${confirmCount} 次将被保存`,
                    `• 有 ${(replyRate * 100).toFixed(1)}% 概率自动发送表情`,
                    `• 发送间隔：${formatTime(sendCD)}`,
                    `• 回复"#(哒|达)咩"可删除刚发送的表情`
                ].join('\n'))
            } else {
                // 关闭功能
                if (groupIndex > -1) {
                    // 保留参数配置，只关闭开关
                    currentAllowGroups[groupIndex].switchOn = false

                    // 更新配置
                    config.autoEmoticons.allowGroups = currentAllowGroups

                    // 清除该群的冷却状态
                    const cooldownKey = `Yz:autoEmoticons:cooldown:${groupId}`
                    await redis.del(cooldownKey)

                    await e.reply([
                        '❌ 当前群自动表情包功能已关闭！',
                        '',
                        '说明：',
                        '• 不再保存新的表情包',
                        '• 不再自动发送表情',
                        '• 已保存的表情包不会被删除',
                        '• 可随时使用"#自动表情包开启"重新启用'
                    ].join('\n'))
                } else {
                    await e.reply('❗ 当前群的自动表情包功能已经是关闭状态了~')
                }
            }

            Config.setConfig(config);
        } catch (error) {
            logger.error(`[autoEmoticons] 切换群功能失败: ${error}`)
            await e.reply('❌ 操作失败，请查看日志获取详细信息')
        }

        return true
    }
}

/**
 * 根据文件头信息判断图片格式
 * @param {Buffer} buffer 文件缓冲区
 * @returns {string} 图片扩展名
 */
function getImageTypeFromBuffer(buffer) {
    if (!buffer || buffer.length < 8) return 'jpg'

    // JPEG
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return 'jpg'
    }

    // PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return 'png'
    }

    // GIF
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        return 'gif'
    }

    // WebP
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return 'webp'
    }

    // BMP
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
        return 'bmp'
    }

    // 默认返回 jpg
    return 'jpg'
}

/**
 * 下载文件并自动识别图片格式
 * @param {string} url 下载链接
 * @param {string} relativePath 相对路径（不包含扩展名）
 * @param {number} maxSizeMB 最大文件大小（MB），可选
 * @returns {Promise<{success: boolean, filePath: string, actualExt: string, size: number, error?: string}>}
 */
export async function downloadImageFile(url, relativePath, maxSizeMB = null) {
    try {
        // 将 MB 转换为字节
        const maxSize = maxSizeMB ? maxSizeMB * 1024 * 1024 : null

        // 首先发送 HEAD 请求检查文件大小
        let contentLength = null
        try {
            const headResponse = await fetch(url, {
                method: 'HEAD',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                timeout: 10000, // 10秒超时
                follow: 5, // 最多跟随5次重定向
                compress: false // 禁用压缩
            })

            if (headResponse.ok && headResponse.headers.has('content-length')) {
                contentLength = parseInt(headResponse.headers.get('content-length'))

                // 如果指定了最大大小且文件超过限制，直接返回错误
                if (maxSize && contentLength > maxSize) {
                    const fileSizeMB = (contentLength / 1024 / 1024).toFixed(2)
                    return {
                        success: false,
                        filePath: null,
                        actualExt: null,
                        size: contentLength,
                        error: `文件过大: ${fileSizeMB}MB，超过限制 ${maxSizeMB}MB`
                    }
                }

                const fileSizeMB = (contentLength / 1024 / 1024).toFixed(2)
                logger.debug(`[downloadImageFile] 文件大小检查通过: ${fileSizeMB}MB`)
            } else {
                logger.debug(`[downloadImageFile] 无法获取文件大小，继续下载`)
            }
        } catch (headError) {
            logger.debug(`[downloadImageFile] HEAD 请求失败，继续下载: ${headError.message}`)
        }

        // 下载文件，添加更多错误处理和重试机制
        let response
        let retryCount = 0
        const maxRetries = 3

        while (retryCount < maxRetries) {
            try {
                response = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    },
                    timeout: 30000, // 30秒超时
                    follow: 5, // 最多跟随5次重定向
                    compress: false, // 禁用压缩
                    agent: false // 禁用 agent 重用
                })

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`)
                }

                break // 请求成功，跳出重试循环
            } catch (fetchError) {
                retryCount++
                logger.warn(`[downloadImageFile] 下载尝试 ${retryCount}/${maxRetries} 失败: ${fetchError.message}`)

                if (retryCount >= maxRetries) {
                    throw fetchError
                }

                // 等待一段时间后重试
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
            }
        }

        // 使用 arrayBuffer 方法获取数据（兼容现代 fetch API）
        const arrayBuffer = await response.arrayBuffer()
        const bufferData = Buffer.from(arrayBuffer)

        // 检查文件大小
        if (maxSize && bufferData.length > maxSize) {
            const downloadedSizeMB = (bufferData.length / 1024 / 1024).toFixed(2)
            return {
                success: false,
                filePath: null,
                actualExt: null,
                size: bufferData.length,
                error: `下载文件过大: ${downloadedSizeMB}MB，超过限制 ${maxSizeMB}MB`
            }
        }

        // 根据文件头判断真实格式
        const actualExt = getImageTypeFromBuffer(bufferData)

        // 构建完整文件路径
        const baseDir = path.join(process.cwd(), 'data', 'autoEmoticons')
        const fullPath = path.join(baseDir, `${relativePath}.${actualExt}`)

        // 确保目录存在
        const dir = path.dirname(fullPath)
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }

        // 写入文件
        fs.writeFileSync(fullPath, bufferData)

        return {
            success: true,
            filePath: fullPath,
            actualExt: actualExt,
            size: bufferData.length
        }

    } catch (error) {
        logger.error(`[downloadImageFile] 下载失败: ${error.message}`)
        return {
            success: false,
            filePath: null,
            actualExt: null,
            size: 0,
            error: error.message
        }
    }
}