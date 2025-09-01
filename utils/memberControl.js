import moment from 'moment'

/**
 * 检查用户权限和限制
 * @param {Object} e - 事件对象
 * @param {Object} config - 配置对象
 * @param {string} config.feature - 功能名称，用于Redis key前缀
 * @param {number} config.cdTime - CD时间（秒），设置为0则关闭CD
 * @param {number} config.dailyLimit - 每日使用次数限制，设置为0则关闭次数限制，设置为-1则只有无限制用户可使用
 * @param {Array} config.unlimitedUsers - 无限制用户列表
 * @param {number} config.operationCount - 本次操作消耗的次数，默认为1
 * @param {number} config.cdMultiple - CD倍率，默认为1
 * @param {boolean} config.isMuteCD - 是否为禁言CD，默认为false
 * @returns {Object} 检查结果 { allowed: boolean, message: string, data?: Object }
 */
export async function checkUserPermission(e, config) {
    const {
        feature,
        cdTime = 0,
        dailyLimit = 0,
        unlimitedUsers = [],
        operationCount = 1,
        cdMultiple = 1,
        isMuteCD = false
    } = config

    const currentTime = moment()
    const userId = String(e.user_id)
    const groupId = String(e.group_id) || "8888"
    const isMaster = e.isMaster
    const isUnlimitedUser = unlimitedUsers.includes(String(userId))

    // 如果dailyLimit为-1，只有无限制用户可以使用
    if (dailyLimit === -1 && !isMaster && !isUnlimitedUser) {
        return {
            allowed: false,
            message: `[${feature}] Permission denied Nya`
        }
    }

    // 检查CD（主人和无限制用户跳过CD检查，除非是禁言CD）
    if (cdTime > 0 && !isMaster && !isUnlimitedUser) {
        const cdResult = await checkCD(userId, groupId, feature, currentTime, cdTime, cdMultiple, isMuteCD)
        if (!cdResult.allowed) {
            return cdResult
        }
    }

    // 检查每日次数限制（主人和无限制用户跳过次数检查）
    if (dailyLimit > 0 && !isMaster && !isUnlimitedUser) {
        const usageResult = await checkDailyUsage(userId, groupId, feature, dailyLimit, operationCount)
        if (!usageResult.allowed) {
            return usageResult
        }
    }

    return {
        allowed: true,
        message: 'Permission granted',
        data: {
            userId,
            groupId,
            isMaster,
            isUnlimitedUser,
            cdTime,
            dailyLimit,
            operationCount
        }
    }
}

/**
 * 检查CD冷却时间
 * @param {string} userId - 用户ID
 * @param {string} groupId - 群组ID
 * @param {string} feature - 功能名称
 * @param {moment.Moment} currentTime - 当前时间
 * @param {number} cdTime - CD时间（秒）
 * @param {number} cdMultiple - CD倍率
 * @param {boolean} isMuteCD - 是否为禁言CD
 * @returns {Object} 检查结果
 */
async function checkCD(userId, groupId, feature, currentTime, cdTime, cdMultiple, isMuteCD) {
    const cdKey = `Yz:SfPlugin:${feature}:CD:${groupId}:${userId}`
    const cdData = await redis.get(cdKey)

    if (cdData) {
        const {
            lastTime,
            totalCdTime,
            operationCount: lastOperationCount,
            cdMultiple: lastCdMultiple,
            isMuteCD: isFromMute
        } = JSON.parse(cdData)

        const seconds = currentTime.diff(moment(lastTime), "seconds")

        if ((totalCdTime - seconds) > 0) {
            // 如果CD数据有误，尝试修复
            if ((totalCdTime - seconds) <= -1) {
                await clearCD(userId, groupId, feature)
                return {
                    allowed: false,
                    message: `[${feature}] CD数据错误，已尝试修复，请重试`
                }
            }

            // 处理禁言CD
            if (isFromMute) {
                logger.info(`[${feature}][禁言CD]${groupId}:${userId} 因违规已被禁言${totalCdTime}秒，剩余${totalCdTime - seconds}秒`)
                return {
                    allowed: false,
                    message: `[${feature}][禁言CD] 因违规已被禁言${totalCdTime}秒，剩余${totalCdTime - seconds}秒`
                }
            }

            return {
                allowed: false,
                message: `[${feature}][CD${lastCdMultiple !== 1 ? `${lastCdMultiple.toFixed(1)}倍率` : ''}][操作${lastOperationCount}次][总计CD${totalCdTime}秒] 请等待${totalCdTime - seconds}秒后再使用`
            }
        }
    }

    return { allowed: true }
}

/**
 * 检查每日使用次数
 * @param {string} userId - 用户ID
 * @param {string} groupId - 群组ID
 * @param {string} feature - 功能名称
 * @param {number} dailyLimit - 每日限制次数
 * @param {number} operationCount - 本次操作消耗次数
 * @returns {Object} 检查结果
 */
async function checkDailyUsage(userId, groupId, feature, dailyLimit, operationCount) {
    const today = moment().format('YYYYMMDD')
    const usageKey = `Yz:SfPlugin:${feature}:Usage:${today}:${groupId}`

    const currentUsage = await redis.hGet(usageKey, userId.toString()) || 0
    const totalUsage = parseInt(currentUsage) + operationCount

    if (totalUsage > dailyLimit) {
        return {
            allowed: false,
            message: `[${feature}] 今日使用次数已达上限（${dailyLimit}次），请明天再试`
        }
    }

    return { allowed: true }
}

/**
 * 记录使用CD
 * @param {Object} e - 事件对象
 * @param {Object} config - 配置对象
 * @returns {boolean} 是否成功
 */
export async function recordUsageCD(e, config) {
    const {
        feature,
        cdTime = 0,
        operationCount = 1,
        cdMultiple = 1,
        isMuteCD = false
    } = config

    const currentTime = moment().format("YYYY-MM-DD HH:mm:ss")
    const userId = e.user_id
    const groupId = e.group_id || "8888"

    // 记录CD
    if (cdTime > 0) {
        const totalCdTime = isMuteCD ? cdTime : (cdTime * operationCount * cdMultiple)
        const cdKey = `Yz:SfPlugin:${feature}:CD:${groupId}:${userId}`

        const cdData = {
            lastTime: currentTime,
            cdTime: cdTime,
            totalCdTime: totalCdTime,
            operationCount: operationCount,
            cdMultiple: cdMultiple,
            isMuteCD: isMuteCD
        }

        await redis.set(cdKey, JSON.stringify(cdData), { EX: totalCdTime })
    }

    return true
}

/**
 * 记录每日使用次数
 * @param {string} userId - 用户ID
 * @param {string} groupId - 群组ID  
 * @param {string} feature - 功能名称
 * @param {number} operationCount - 操作次数
 * @returns {boolean} 是否成功
 */
export async function recordDailyUsage(userId, groupId, feature, operationCount = 1) {
    const today = moment().format('YYYYMMDD')
    const usageKey = `Yz:SfPlugin:${feature}:Usage:${today}:${groupId}`

    // 原子操作：递增使用次数
    await redis.hIncrBy(usageKey, userId.toString(), operationCount)

    // 设置过期时间（31天）
    await redis.expire(usageKey, 31 * 24 * 60 * 60)

    return true
}

/**
 * 清除用户CD
 * @param {string} userId - 用户ID
 * @param {string} groupId - 群组ID
 * @param {string} feature - 功能名称
 * @returns {boolean} 是否成功
 */
export async function clearCD(userId, groupId, feature) {
    const cdKey = `Yz:SfPlugin:${feature}:CD:${groupId}:${userId}`
    await redis.del(cdKey)
    return true
}

/**
 * 获取用户今日使用次数
 * @param {string} userId - 用户ID
 * @param {string} groupId - 群组ID
 * @param {string} feature - 功能名称
 * @returns {number} 使用次数
 */
export async function getTodayUsage(userId, groupId, feature) {
    const today = moment().format('YYYYMMDD')
    const usageKey = `Yz:SfPlugin:${feature}:Usage:${today}:${groupId}`

    const usage = await redis.hGet(usageKey, userId.toString())
    return parseInt(usage) || 0
}

/**
 * 获取用户剩余CD时间
 * @param {string} userId - 用户ID
 * @param {string} groupId - 群组ID
 * @param {string} feature - 功能名称
 * @returns {number} 剩余秒数，0表示无CD
 */
export async function getRemainingCD(userId, groupId, feature) {
    const cdKey = `Yz:SfPlugin:${feature}:CD:${groupId}:${userId}`
    const cdData = await redis.get(cdKey)

    if (!cdData) return 0

    const { lastTime, totalCdTime } = JSON.parse(cdData)
    const currentTime = moment()
    const seconds = currentTime.diff(moment(lastTime), "seconds")
    const remaining = totalCdTime - seconds

    return remaining > 0 ? remaining : 0
}

/**
 * 完整的权限检查和记录流程
 * @param {Object} e - 事件对象
 * @param {Object} config - 配置对象
 * @returns {Object} 检查结果和记录函数
 */
export async function memberControlProcess(e, config) {
    // 检查权限
    const checkResult = await checkUserPermission(e, config)

    if (!checkResult.allowed) {
        return {
            allowed: false,
            message: checkResult.message,
            record: null
        }
    }

    // 返回记录函数，在操作成功后调用
    const recordFunc = async () => {
        const { userId, groupId } = checkResult.data

        // 记录CD
        await recordUsageCD(e, config)

        // 记录每日使用次数（如果有限制）
        if (config.dailyLimit > 0 && !e.isMaster && !config.unlimitedUsers.includes(userId)) {
            await recordDailyUsage(userId, groupId, config.feature, config.operationCount || 1)
        }

        return true
    }

    return {
        allowed: true,
        message: checkResult.message,
        data: checkResult.data,
        record: recordFunc
    }
}
