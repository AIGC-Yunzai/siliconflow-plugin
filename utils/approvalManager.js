/**
 * WebUI 审批管理模块
 * 处理用户申请、批准、黑名单等权限管理
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'

// 数据文件路径
const DATA_DIR = path.join(process.cwd(), 'data', 'sf-plugin')
const APPROVAL_FILE = path.join(DATA_DIR, 'webui-approval.json')

// 申请状态
const STATUS = {
  PENDING: 'pending',    // 待审批
  APPROVED: 'approved',  // 已批准
  REJECTED: 'rejected',  // 已拒绝
  BLOCKED: 'blocked'     // 已拉黑
}

/**
 * 确保数据目录存在
 */
function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

/**
 * 读取审批数据
 * @returns {Object}
 */
function loadData() {
  ensureDataDir()
  if (!existsSync(APPROVAL_FILE)) {
    return { requests: [], whitelist: [], blacklist: [] }
  }
  try {
    return JSON.parse(readFileSync(APPROVAL_FILE, 'utf8'))
  } catch (error) {
    console.error('[sf插件] 读取审批数据失败:', error)
    return { requests: [], whitelist: [], blacklist: [] }
  }
}

/**
 * 保存审批数据
 * @param {Object} data 
 */
function saveData(data) {
  ensureDataDir()
  try {
    writeFileSync(APPROVAL_FILE, JSON.stringify(data, null, 2))
  } catch (error) {
    console.error('[sf插件] 保存审批数据失败:', error)
  }
}

/**
 * 提交申请
 * @param {string} qq 申请人QQ
 * @param {string} groupId 群号
 * @param {string} nickname 昵称
 * @returns {Object} {success, message, request}
 */
export function submitRequest(qq, groupId, nickname = '') {
  const data = loadData()
  
  // 检查是否在黑名单
  if (data.blacklist.some(item => item.qq === qq)) {
    return { success: false, message: '你已被拉黑，无法申请' }
  }
  
  // 检查是否已在白名单
  if (data.whitelist.some(item => item.qq === qq)) {
    return { success: false, message: '你已被授权，无需重复申请' }
  }
  
  // 检查是否有待审批的申请
  const existingRequest = data.requests.find(r => r.qq === qq && r.status === STATUS.PENDING)
  if (existingRequest) {
    return { success: false, message: '你已提交申请，请等待审批' }
  }
  
  // 创建新申请
  const request = {
    id: Date.now().toString(),
    qq,
    groupId,
    nickname,
    status: STATUS.PENDING,
    requestTime: Date.now(),
    approvedBy: null,
    approvedTime: null
  }
  
  data.requests.push(request)
  saveData(data)
  
  return { 
    success: true, 
    message: '申请已提交，请等待主人审批',
    request
  }
}

/**
 * 批准申请
 * @param {string} qq 申请人QQ
 * @param {string} approvedBy 审批人QQ
 * @returns {Object}
 */
export function approveRequest(qq, approvedBy) {
  const data = loadData()
  
  // 查找申请
  const requestIndex = data.requests.findIndex(r => r.qq === qq && r.status === STATUS.PENDING)
  if (requestIndex === -1) {
    return { success: false, message: '未找到该用户的待审批申请' }
  }
  
  const request = data.requests[requestIndex]
  request.status = STATUS.APPROVED
  request.approvedBy = approvedBy
  request.approvedTime = Date.now()
  
  // 添加到白名单
  data.whitelist.push({
    qq: request.qq,
    groupId: request.groupId,
    nickname: request.nickname,
    approvedBy,
    approvedTime: Date.now()
  })
  
  saveData(data)
  
  return { 
    success: true, 
    message: `已批准 ${request.qq} 的申请`,
    request
  }
}

/**
 * 拒绝申请
 * @param {string} qq 申请人QQ
 * @param {string} rejectedBy 审批人QQ
 * @param {string} reason 原因
 * @returns {Object}
 */
export function rejectRequest(qq, rejectedBy, reason = '') {
  const data = loadData()
  
  const requestIndex = data.requests.findIndex(r => r.qq === qq && r.status === STATUS.PENDING)
  if (requestIndex === -1) {
    return { success: false, message: '未找到该用户的待审批申请' }
  }
  
  const request = data.requests[requestIndex]
  request.status = STATUS.REJECTED
  request.rejectedBy = rejectedBy
  request.rejectedTime = Date.now()
  request.rejectReason = reason
  
  saveData(data)
  
  return { 
    success: true, 
    message: `已拒绝 ${request.qq} 的申请`,
    request
  }
}

/**
 * 拉黑用户
 * @param {string} qq 用户QQ
 * @param {string} blockedBy 操作人QQ
 * @param {string} reason 原因
 * @returns {Object}
 */
export function blockUser(qq, blockedBy, reason = '') {
  const data = loadData()
  
  // 检查是否已拉黑
  if (data.blacklist.some(item => item.qq === qq)) {
    return { success: false, message: '该用户已被拉黑' }
  }
  
  // 从白名单中移除（如果在）
  data.whitelist = data.whitelist.filter(item => item.qq !== qq)
  
  // 添加到黑名单
  data.blacklist.push({
    qq,
    blockedBy,
    blockedTime: Date.now(),
    reason
  })
  
  // 更新申请状态
  const request = data.requests.find(r => r.qq === qq && r.status === STATUS.PENDING)
  if (request) {
    request.status = STATUS.BLOCKED
  }
  
  saveData(data)
  
  return { success: true, message: `已拉黑 ${qq}` }
}

/**
 * 解封用户
 * @param {string} qq 用户QQ
 * @returns {Object}
 */
export function unblockUser(qq) {
  const data = loadData()
  
  const index = data.blacklist.findIndex(item => item.qq === qq)
  if (index === -1) {
    return { success: false, message: '该用户不在黑名单中' }
  }
  
  data.blacklist.splice(index, 1)
  saveData(data)
  
  return { success: true, message: `已解封 ${qq}` }
}

/**
 * 检查用户是否有权限
 * @param {string} qq 用户QQ
 * @param {string} approvalMode 审批模式
 * @returns {Object} {allowed, reason}
 */
export function checkPermission(qq, approvalMode = 'auto') {
  const data = loadData()
  
  // 检查是否在黑名单
  if (data.blacklist.some(item => item.qq === qq)) {
    return { allowed: false, reason: '你已被拉黑，无法使用WebUI' }
  }
  
  // 自动模式：所有人可用
  if (approvalMode === 'auto') {
    return { allowed: true }
  }
  
  // 仅主人模式
  if (approvalMode === 'master_only') {
    return { allowed: false, reason: '当前仅允许主人使用WebUI' }
  }
  
  // 审批模式：检查白名单
  if (approvalMode === 'approval') {
    if (data.whitelist.some(item => item.qq === qq)) {
      return { allowed: true }
    }
    return { allowed: false, reason: '你未获得WebUI使用权限，请先申请' }
  }
  
  return { allowed: true }
}

/**
 * 获取待审批列表
 * @returns {Array}
 */
export function getPendingRequests() {
  const data = loadData()
  return data.requests.filter(r => r.status === STATUS.PENDING)
}

/**
 * 获取所有申请记录
 * @returns {Array}
 */
export function getAllRequests() {
  const data = loadData()
  return data.requests
}

/**
 * 获取白名单
 * @returns {Array}
 */
export function getWhitelist() {
  const data = loadData()
  return data.whitelist
}

/**
 * 获取黑名单
 * @returns {Array}
 */
export function getBlacklist() {
  const data = loadData()
  return data.blacklist
}

/**
 * 批量批准申请
 * @param {Array} qqList QQ号列表
 * @param {string} approvedBy 审批人QQ
 * @returns {Object}
 */
export function batchApprove(qqList, approvedBy) {
  const results = []
  for (const qq of qqList) {
    results.push(approveRequest(qq, approvedBy))
  }
  return {
    success: true,
    message: `批量处理完成，成功批准 ${results.filter(r => r.success).length} 人`,
    results
  }
}

/**
 * 清空已处理的申请（保留最近100条）
 */
export function cleanupOldRequests() {
  const data = loadData()
  // 只保留 pending 状态和最近100条记录
  const pending = data.requests.filter(r => r.status === STATUS.PENDING)
  const processed = data.requests
    .filter(r => r.status !== STATUS.PENDING)
    .sort((a, b) => b.approvedTime || b.rejectedTime - a.approvedTime || a.rejectedTime)
    .slice(0, 100)
  
  data.requests = [...pending, ...processed]
  saveData(data)
}

/**
 * 检查用户是否在白名单中
 * @param {string} qq - 用户QQ号
 * @returns {boolean}
 */
export function isUserApproved(qq) {
  const data = loadData()
  return data.whitelist.some(item => item.qq === qq)
}

/**
 * 检查用户是否在黑名单中
 * @param {string} qq - 用户QQ号
 * @returns {boolean}
 */
export function isBlocked(qq) {
  const data = loadData()
  return data.blacklist.some(item => item.qq === qq)
}

export { STATUS }
