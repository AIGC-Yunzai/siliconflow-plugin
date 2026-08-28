import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import fs from 'node:fs'
import path from 'node:path'
import Config from '../components/Config.js'
import Render from '../components/Render.js'

/** Artificial Analysis 接口基础地址，用于拉取模型能力与任务成本数据 */
const API_BASE_URL = 'https://artificialanalysis.ai/api/v2'
/** 目录缓存有效期（毫秒）：超时后重新拉取实时数据，未配置 API Key 时始终读本地缓存 */
const CACHE_TTL = 4 * 60 * 60 * 1000
/** 目录分页拉取的最大页数，防止接口分页过多导致请求耗时过长 */
const MAX_PAGES = 20
/** 图表最多展示的模型数量，超出后按家族分组轮转抽样（优先最新、能力更高的模型） */
const MAX_DISPLAY_MODELS = 30
/** 默认斩杀锚点模型：锅巴配置的锚点模糊匹配不到时的兜底基准 */
const DEFAULT_BASELINE = 'DeepSeek V4 Flash 0731 (Reasoning, Max Effort)'
// Keep the snapshot outside the plugin directory: plugin updates/restarts may recreate config files.
const CATALOG_CACHE_FILE = path.join(process.cwd(), 'data', 'sf-plugin', 'llmKillLine', 'llmKillLineCatalog.json')

const FAMILY_RULES = [
  { key: 'anthropic', label: 'Anthropic ≥ 4.8', pattern: /\bclaude(?:\s+[a-z]+){0,2}\s+(\d+)(?:\s+(\d+))?/i, min: [4, 8], color: '#9b6dff' },
  { key: 'deepseek', label: 'DeepSeek ≥ V4', pattern: /\bdeepseek(?:\s+(?:chat|coder|r1))?\s+v?(\d+)(?:\s+(\d+))?/i, min: [4, 0], color: '#31b785' },
  { key: 'gemini', label: 'Gemini ≥ 3.0', pattern: /\bgemini\s+(\d+)(?:\s+(\d+))?/i, min: [3, 0], color: '#4d94ff' },
  { key: 'kimi', label: 'Kimi ≥ K3', pattern: /\bkimi\s+k?(\d+)(?:\s+(\d+))?/i, min: [3, 0], color: '#ea9a3d' },
  { key: 'glm', label: 'GLM ≥ 5.2', pattern: /\bglm\s+(\d+)(?:\s+(\d+))?/i, min: [5, 2], color: '#e36565' },
  { key: 'gpt', label: 'GPT ≥ 5.5', pattern: /\bgpt\s+(\d+)(?:\s+(\d+))?/i, min: [5, 5], color: '#25a6a0' },
  { key: 'grok', label: 'Grok ≥ 4.5', pattern: /\bgrok\s+(\d+)(?:\s+(\d+))?/i, min: [4, 5], color: '#cb72cf' },
]

// 左下方文案的厂家展示名（与数据中模型名的真实厂家名称一致，如 Claude、Gemini、Kimi）
const FAMILY_DISPLAY_NAMES = {
  anthropic: 'Claude',
  deepseek: 'DeepSeek',
  gemini: 'Gemini',
  kimi: 'Kimi',
  glm: 'GLM',
  gpt: 'GPT',
  grok: 'Grok',
}

// 家族筛选命令可识别的别名（与 FAMILY_RULES.key 精确匹配，避免误伤具体模型名查询）
const FAMILY_ALIASES = {
  anthropic: ['anthropic', 'claude'],
  deepseek: ['deepseek'],
  gemini: ['gemini', 'google'],
  kimi: ['kimi'],
  glm: ['glm'],
  gpt: ['gpt', 'openai'],
  grok: ['grok'],
}

// 数据中可能出现的其他厂家品牌提取规则（用于自动计算左下方的厂家映射名）
// 顺序：先特异后通用；仅用于模型名首部匹配，不参与命令参数的前缀匹配（避免误伤具体模型名）
const BRAND_PATTERNS = [
  ['qwen', /^qwen/],
  ['mistral', /^(?:ministral|magistral|mistral)/],
  ['gpt', /^gpt/],
  ['llama', /^llama/],
  ['gemma', /^gemma/],
  ['nemotron', /^nemotron/],
  ['nvidia', /^nvidia/],
  ['muse', /^muse/],
  ['mimo', /^mimo/],
  ['granite', /^granite/],
  ['solar', /^solar/],
  ['minimax', /^minimax/],
  ['inkling', /^inkling/],
  ['step', /^step/],
  ['mercury', /^mercury/],
  ['hypernova', /^hypernova/],
  ['longcat', /^longcat/],
  ['celeris', /^celeris/],
  ['trinity', /^trinity/],
  ['ling', /^ling/],
]

let catalogPromise = null

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normaliseText(value) {
  return String(value || '').toLowerCase().replace(/[._-]/g, ' ').replace(/\s+/g, ' ').trim()
}

function formatMoney(value) {
  if (value < 0.01) return `$${value.toFixed(4)}`
  if (value < 1) return `$${value.toFixed(3)}`
  return `$${value.toFixed(2)}`
}

// ========== 高级模糊匹配（用于斩杀锚点/基准模型解析） ==========
// 命中阈值：高于该值视为匹配成功，低于则回退到 DeepSeek V4 Flash
const ANCHOR_MATCH_THRESHOLD = 0.45

/** 词元命中：目标文本包含该词元即算命中；支持版本号 v 前缀归一化（v4 → 4） */
function tokenInTarget(token, targetText) {
  if (targetText.includes(token)) return true
  const stripped = token.replace(/^v(?=\d)/, '')
  if (stripped !== token && stripped && targetText.includes(stripped)) return true
  return false
}

/** 词元级综合命中：包含 / v 前缀归一化 / 编辑距离(≥0.6，拼写容错) / 子序列（缩写，如 ds → deepseek） */
function tokenHit(token, targetText, targetTokens) {
  if (tokenInTarget(token, targetText)) return true
  if (targetTokens.some(tok => levenshteinSimilarity(token, tok) >= 0.6)) return true
  if (targetTokens.some(tok => isCharSubsequence(token, tok))) return true
  return false
}

/** 字符子序列匹配：query 的字符按顺序出现在 target 中（如 ds → deepseek） */
function isCharSubsequence(query, target) {
  let index = 0
  for (const char of target) {
    if (char === query[index]) index++
    if (index === query.length) return true
  }
  return index === query.length
}

/** 编辑距离相似度（处理少量拼写差异，长度差异过大时直接视为不相似） */
function levenshteinSimilarity(a, b) {
  if (a === b) return 1
  if (!a.length || !b.length) return 0
  const maxLen = Math.max(a.length, b.length)
  if (Math.abs(a.length - b.length) / maxLen > 0.5) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  let curr = new Array(b.length + 1)
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    ;[prev, curr] = [curr, prev]
  }
  return Math.max(0, 1 - prev[b.length] / maxLen)
}

/**
 * 计算查询串与目标串的相似度（0~1，取多策略最高分）
 * 策略优先级：完全一致 > 连续包含 > 词元命中 > 字符子序列 > 编辑距离
 */
function fuzzySimilarity(query, target) {
  const q = normaliseText(query)
  const t = normaliseText(target)
  if (!q || !t) return 0
  if (q === t) return 1

  const scores = []
  const qTokens = q.split(' ').filter(Boolean)
  const tTokens = t.split(' ').filter(Boolean)

  // 连续包含：按覆盖比例打分
  if (t.includes(q)) scores.push(Math.min(1, 0.6 + 0.4 * (q.length / t.length)))

  // 词元命中
  if (qTokens.length === 1) {
    if (tokenInTarget(qTokens[0], t)) scores.push(0.5)
    else if (tTokens.some(tok => levenshteinSimilarity(qTokens[0], tok) >= 0.6 || isCharSubsequence(qTokens[0], tok))) scores.push(0.45)
  } else {
    const hits = qTokens.filter(token => tokenHit(token, t, tTokens)).length
    const coverage = hits / qTokens.length
    // 长度覆盖因子（对称度量 ≤1，避免 query 比 target 长时反向加分）
    const lengthFactor = Math.min(q.length, t.length) / Math.max(q.length, t.length)
    // 全词元命中：强匹配；部分命中：弱匹配（需依赖其他策略加成，避免 "v4" 一类歧义词元误伤）
    if (coverage === 1) scores.push(Math.min(1, 0.55 + 0.25 * lengthFactor))
    else if (coverage >= 0.5) scores.push(0.2 + 0.35 * coverage + 0.05 * lengthFactor)
  }

  // 字符子序列（支持缩写，如 ds v4 → deepseek v4）；分数低于命中阈值，仅作为辅助加分，
  // 避免纯子序列匹配把无关模型（如 qwen…coder…instruct 中恰好含 "ds"）顶上高位
  if (isCharSubsequence(q, t)) scores.push(0.42)

  // 编辑距离（兜底，处理整体拼写差异）
  const lev = levenshteinSimilarity(q, t)
  if (lev > 0) scores.push(lev * 0.8)

  return scores.length ? Math.max(...scores) : 0
}

/** 高级模糊匹配：在模型列表中查找与查询串最相似的模型，低于命中阈值返回 null */
function fuzzyFindModel(models, query) {
  const normalizedQuery = normaliseText(query)
  if (!normalizedQuery) return null
  let best = null
  let bestScore = 0
  for (const model of models) {
    const score = Math.max(
      fuzzySimilarity(normalizedQuery, model.name),
      fuzzySimilarity(normalizedQuery, model.slug),
    )
    if (score > bestScore) {
      bestScore = score
      best = model
    }
  }
  return bestScore >= ANCHOR_MATCH_THRESHOLD ? best : null
}

/** 仅判断模型所属家族，不校验版本斩杀线（用于家族全量展示） */
function familyRuleOf(model) {
  const text = normaliseText(`${model.name} ${model.slug}`)
  return FAMILY_RULES.find(rule => rule.pattern.test(text)) || null
}

function getModelFamily(model) {
  const rule = familyRuleOf(model)
  if (!rule) return null
  const match = normaliseText(`${model.name} ${model.slug}`).match(rule.pattern)
  const major = Number(match[1])
  const minor = Number(match[2] || 0)
  if (major > rule.min[0] || (major === rule.min[0] && minor >= rule.min[1])) {
    return rule
  }
  return null
}

/** 解析逗号分隔的家族筛选参数，如 "kimi,glm,gemini"；支持已知家族别名与动态品牌名；无法识别时返回空数组 */
function parseFamilyKeys(query) {
  const tokens = String(query || '')
    .split(/[,，]+/)
    .map(token => token.trim().toLowerCase())
    .filter(Boolean)
  const keys = []
  for (const token of tokens) {
    const rule = FAMILY_RULES.find(item => (FAMILY_ALIASES[item.key] || [item.key]).includes(token))
    if (rule) {
      if (!keys.includes(rule.key)) keys.push(rule.key)
      continue
    }
    // 动态品牌：仅精确匹配（如 qwen、mistral），避免把具体模型名（如 qwen3.5）误判为家族
    const brand = BRAND_PATTERNS.find(([name]) => name === token)
    if (brand && !keys.includes(brand[0])) keys.push(brand[0])
  }
  return keys
}

/** 从模型名提取厂家品牌词（用于未覆盖已知家族的其他厂家） */
function extractBrand(model) {
  const text = normaliseText(model.name)
  const matched = BRAND_PATTERNS.find(([, pattern]) => pattern.test(text))
  if (matched) return matched[0]
  const first = text.split(' ')[0]
  const brand = first.replace(/[^a-z0-9]+/g, '')
  return brand || null
}

/** 家族筛选：已知家族按斩杀线校验，动态品牌按品牌归属（全量） */
function matchFamilyKey(model, key) {
  const rule = FAMILY_RULES.find(item => item.key === key)
  if (rule) return getModelFamily(model)?.key === key
  return extractBrand(model) === key
}

/** 家族筛选（放宽版）：已知家族仅判断归属不校验斩杀线，动态品牌按品牌归属 */
function matchFamilyKeyLoose(model, key) {
  const rule = FAMILY_RULES.find(item => item.key === key)
  if (rule) return familyRuleOf(model)?.key === key
  return extractBrand(model) === key
}

// 厂家热度排序（2026-08 综合 llm-stats 实时榜与主流人气榜整理）：热门靠前，冷门殿后
// 未列入的厂家（未来数据中出现的新品牌）自动排到最后
const HEAT_RANK = [
  'gpt', 'anthropic', 'gemini', 'deepseek', 'qwen', 'kimi', 'glm', 'grok',
  'llama', 'mistral', 'minimax', 'step', 'gemma', 'nemotron', 'nvidia', 'muse',
  'granite', 'mimo', 'solar', 'inkling', 'mercury', 'hypernova', 'longcat',
  'celeris', 'hy3', 'trinity', 'ling', 'ring',
]

/** 厂家展示名：已知家族用 FAMILY_DISPLAY_NAMES，动态品牌首字母大写 */
function familyDisplayName(key) {
  if (FAMILY_DISPLAY_NAMES[key]) return FAMILY_DISPLAY_NAMES[key]
  return key.charAt(0).toUpperCase() + key.slice(1)
}

/** 从数据自动计算实际存在的厂家映射名（按热度排序，热门靠前、冷门殿后） */
function discoverFamilyMappings(models) {
  const counts = new Map()
  for (const model of models) {
    const known = familyRuleOf(model)
    const brand = known ? known.key : extractBrand(model)
    if (brand) counts.set(brand, (counts.get(brand) || 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => {
      const rankA = HEAT_RANK.indexOf(a[0])
      const rankB = HEAT_RANK.indexOf(b[0])
      if (rankA !== -1 || rankB !== -1) {
        if (rankA === -1) return 1
        if (rankB === -1) return -1
        return rankA - rankB
      }
      return b[1] - a[1]
    })
    .map(([brand, count]) => ({
      brand,
      label: familyDisplayName(brand),
      aliases: FAMILY_ALIASES[brand] || [brand],
      count,
    }))
}

/** 生成左下方的筛选说明文案：如 "可选指令: #LLM模型斩杀线 GPT, Qwen, Claude, ..." */
function buildFilterText(models) {
  const names = discoverFamilyMappings(models).map(item => item.label)
  return `可选指令: #LLM模型斩杀线 ${names.join(', ')}`
}

function normaliseModel(model) {
  return {
    id: String(model.id || model.slug || model.name),
    name: String(model.name || model.slug || '未命名模型'),
    slug: String(model.slug || ''),
    releaseDate: typeof model.release_date === 'string' ? model.release_date : null,
    intelligence: finiteNumber(model.evaluations?.artificial_analysis_intelligence_index),
    costPerTask: finiteNumber(model.artificial_analysis_intelligence_index_cost?.cost_per_task?.total_cost),
  }
}

function readCatalogCache(endpoint) {
  try {
    const cache = JSON.parse(fs.readFileSync(CATALOG_CACHE_FILE, 'utf8'))
    const catalog = cache.catalogs?.[endpoint]
    if (!catalog || !Array.isArray(catalog.models) || !catalog.syncedAt) return null
    const savedAt = Date.parse(catalog.syncedAt)
    if (!Number.isFinite(savedAt)) return null
    return { ...catalog, endpoint, savedAt }
  } catch {
    return null
  }
}

function writeCatalogCache(catalog) {
  try {
    let cache = { version: 1, catalogs: {} }
    if (fs.existsSync(CATALOG_CACHE_FILE)) {
      cache = JSON.parse(fs.readFileSync(CATALOG_CACHE_FILE, 'utf8'))
      if (!cache || typeof cache !== 'object') cache = { version: 1, catalogs: {} }
    }
    if (!cache.catalogs || typeof cache.catalogs !== 'object') cache.catalogs = {}
    cache.version = 1
    cache.catalogs[catalog.endpoint] = catalog
    fs.mkdirSync(path.dirname(CATALOG_CACHE_FILE), { recursive: true })
    fs.writeFileSync(CATALOG_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8')
  } catch (error) {
    logger.warn?.('[SF插件] LLM模型斩杀线缓存写入失败', error)
  }
}

async function fetchPage(apiKey, endpoint, page) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}?page=${page}`, {
      headers: { Accept: 'application/json', 'x-api-key': apiKey },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Artificial Analysis 返回 ${response.status}`)
    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

async function getCatalog(apiKey, tier) {
  const endpoint = ['pro', 'commercial'].includes(String(tier).toLowerCase())
    ? '/language/models'
    : '/language/models/free'
  const cachedCatalog = readCatalogCache(endpoint)
  const now = Date.now()
  if (cachedCatalog && now - cachedCatalog.savedAt < CACHE_TTL) {
    return { catalog: cachedCatalog, warning: null }
  }
  if (!apiKey) {
    if (cachedCatalog) {
      return { catalog: cachedCatalog, warning: '未配置 Artificial Analysis API Key，当前使用本地缓存数据。' }
    }
    throw new Error('请先在锅巴配置中填写 Artificial Analysis API Key')
  }
  if (catalogPromise) return catalogPromise

  catalogPromise = (async () => {
    try {
      const first = await fetchPage(apiKey, endpoint, 1)
      const totalPages = Math.min(Number(first.pagination?.total_pages || 1), MAX_PAGES)
      const pages = await Promise.all(
        Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => fetchPage(apiKey, endpoint, index + 2)),
      )
      const rows = [first, ...pages].flatMap(page => Array.isArray(page.data) ? page.data : [])
      const models = Array.from(new Map(rows.map(model => [model.id || model.slug || model.name, normaliseModel(model)])).values())
      const catalog = { models, syncedAt: new Date().toISOString(), tier: first.tier || tier || 'free', endpoint }
      writeCatalogCache(catalog)
      return { catalog, warning: null }
    } catch (error) {
      if (cachedCatalog) {
        return { catalog: cachedCatalog, warning: `实时数据拉取失败（${error.message || '未知错误'}），当前使用本地缓存数据。` }
      }
      throw error
    }
  })().finally(() => {
    catalogPromise = null
  })

  return catalogPromise
}

function releaseTime(model) {
  const timestamp = model.releaseDate ? Date.parse(model.releaseDate) : Number.NaN
  return Number.isFinite(timestamp) ? timestamp : 0
}

function chooseDisplayModels(models, baseline) {
  if (models.length <= MAX_DISPLAY_MODELS) return models
  const familyQueues = new Map()
  for (const model of models) {
    const family = getModelFamily(model)
    const key = family?.key || '__other__'
    const queue = familyQueues.get(key) || []
    queue.push(model)
    familyQueues.set(key, queue)
  }
  for (const queue of familyQueues.values()) {
    queue.sort((a, b) => releaseTime(b) - releaseTime(a) || b.intelligence - a.intelligence || a.costPerTask - b.costPerTask)
  }

  const selected = [baseline]
  const selectedIds = new Set([baseline.id])
  const add = model => {
    if (!model || selectedIds.has(model.id) || selected.length >= MAX_DISPLAY_MODELS) return false
    selected.push(model)
    selectedIds.add(model.id)
    return true
  }
  const queues = Array.from(familyQueues.values())
  for (const queue of queues) add(queue.find(model => !selectedIds.has(model.id)))
  while (selected.length < MAX_DISPLAY_MODELS) {
    const candidates = queues
      .map(queue => queue.find(model => !selectedIds.has(model.id)))
      .filter(Boolean)
      .sort((a, b) => releaseTime(b) - releaseTime(a) || b.intelligence - a.intelligence)
    if (!candidates.length) break
    add(candidates[0])
  }
  return selected
}

function findBaseline(models, query, anchorQuery = '') {
  // 1. 命令参数优先：高级模糊匹配，找不到则返回 null（由调用方提示未找到）
  if (normaliseText(query)) {
    return fuzzyFindModel(models, query)
  }

  // 2. 锅巴配置的默认斩杀锚点模型：高级模糊匹配
  if (normaliseText(anchorQuery)) {
    const matched = fuzzyFindModel(models, anchorQuery)
    if (matched) return matched
    logger.warn?.(`[SF插件] 默认斩杀锚点模型「${anchorQuery}」未匹配到数据中的模型，已回退使用 ${DEFAULT_BASELINE}`)
  }

  // 3. 全部匹配不到 → 回退到默认锚点 DeepSeek V4 Flash
  const defaultBaseline = normaliseText(DEFAULT_BASELINE)
  const exactDefault = models.find(model => normaliseText(model.name) === defaultBaseline)
  if (exactDefault) return exactDefault

  return models
    .filter(model => /\bdeepseek\s+v?4\s+flash\b/i.test(normaliseText(`${model.name} ${model.slug}`)))
    .sort((a, b) => a.costPerTask - b.costPerTask || b.intelligence - a.intelligence)[0]
}

function createChart(models, baseline, source, totalModelCount) {
  const plotWidth = 3290
  const plotHeight = 1880
  const costs = models.map(model => model.costPerTask)
  const scores = models.map(model => model.intelligence)
  const logCosts = costs.map(Math.log10)
  const minLogCost = Math.min(...logCosts) - 0.05
  const maxLogCost = Math.max(...logCosts) + 0.05
  const minScore = Math.max(0, Math.floor(Math.min(...scores) - 1))
  const maxScore = Math.ceil(Math.max(...scores) + 1)
  const xOf = cost => ((Math.log10(cost) - minLogCost) / (maxLogCost - minLogCost)) * plotWidth
  const yOf = score => plotHeight - ((score - minScore) / (maxScore - minScore)) * plotHeight
  const baselineX = xOf(baseline.costPerTask)
  const baselineY = yOf(baseline.intelligence)
  const step = maxLogCost - minLogCost > 2.2 ? 0.5 : 0.25
  const xTicks = []
  for (let value = Math.ceil(minLogCost / step) * step; value <= maxLogCost; value += step) {
    xTicks.push({ position: xOf(10 ** value), label: formatMoney(10 ** value) })
  }
  const yTicks = []
  const yTickStep = maxScore - minScore > 24 ? 5 : 2
  for (let value = Math.ceil(minScore / yTickStep) * yTickStep; value <= maxScore; value += yTickStep) {
    yTicks.push({ position: yOf(value), label: value })
  }

  const pendingPoints = models.map(model => {
    const family = getModelFamily(model)
    const isBaseline = model.id === baseline.id
    const isPreferred = !isBaseline && model.intelligence >= baseline.intelligence && model.costPerTask <= baseline.costPerTask && (model.intelligence > baseline.intelligence || model.costPerTask < baseline.costPerTask)
    const isKilled = !isBaseline && model.intelligence <= baseline.intelligence && model.costPerTask >= baseline.costPerTask && (model.intelligence < baseline.intelligence || model.costPerTask > baseline.costPerTask)
    const x = xOf(model.costPerTask)
    const y = yOf(model.intelligence)
    return {
      ...model,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      color: family?.color || '#8a8f98',
      isBaseline,
      isPreferred,
      isKilled,
      detail: `能力 ${model.intelligence.toFixed(1)} · 任务成本 ${formatMoney(model.costPerTask)}`,
    }
  })

  // The live catalog can contain over forty variants.  Place labels greedily
  // around their point so every model name remains legible in the rendered image.
  const occupiedLabels = []
  const intersects = (first, second) =>
    first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top
  const points = pendingPoints
    .sort((a, b) => Number(b.isBaseline) - Number(a.isBaseline) || Number(b.isPreferred) - Number(a.isPreferred) || a.y - b.y)
    .map(point => {
      const labelWidth = Math.min(420, Math.max(230, point.name.length * 12.5))
      const labelHeight = Math.ceil((point.name.length * 12.5) / labelWidth) * 26 + 20
      const preferredSide = point.x > plotWidth * 0.67 ? 'left' : 'right'
      const sides = [preferredSide, preferredSide === 'left' ? 'right' : 'left']
      const offsets = point.y < 78
        ? [42, 112, 182, 252, -24, -94, -164, -234, 322]
        : [-24, 42, -94, 112, -164, 182, -234, 252, -304, 322]
      const candidates = offsets.flatMap(top => sides.map(side => {
        const left = side === 'left' ? point.x - 20 - labelWidth : point.x + 20
        return { side, offsetY: top, top: point.y + top, left, right: left + labelWidth, bottom: point.y + top + labelHeight }
      }))
      const inBounds = candidate => candidate.left >= -5 && candidate.right <= plotWidth + 5 && candidate.top >= -3 && candidate.bottom <= plotHeight + 3
      const score = candidate => occupiedLabels.reduce((total, label) => total + (intersects(candidate, label) ? 1 : 0), 0)
      const placement = candidates.find(candidate => inBounds(candidate) && score(candidate) === 0)
        || candidates.filter(inBounds).sort((a, b) => score(a) - score(b))[0]
        || candidates[0]
      occupiedLabels.push(placement)
      return {
        ...point,
        labelWidth: Math.round(labelWidth),
        labelX: placement.side === 'left' ? -20 : 20,
        labelY: placement.offsetY,
        labelSide: placement.side,
      }
    })

  return {
    plotWidth,
    plotHeight,
    points,
    xTicks,
    yTicks,
    baselineX: Math.round(baselineX * 10) / 10,
    baselineY: Math.round(baselineY * 10) / 10,
    baseline,
    preferredCount: points.filter(point => point.isPreferred).length,
    killedCount: points.filter(point => point.isKilled).length,
    displayedCount: points.length,
    totalModelCount,
    syncedAt: new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(new Date(source.syncedAt)),
  }
}

export class LLMKillLine extends plugin {
  constructor() {
    super({
      name: 'LLM模型斩杀线',
      dsc: `展示指定新模型的能力与对数任务成本，以锅巴配置的默认斩杀锚点模型（默认 ${DEFAULT_BASELINE}）为斩杀线基准`,
      event: 'message',
      priority: 1000,
      rule: [{ reg: new RegExp('^#LLM模型斩杀线\\s*(.+)?$', 'i'), fnc: 'renderKillLine' }],
    })
  }

  async renderKillLine(e) {
    const config = Config.getConfig().llmKillLine || {}
    const apiKey = String(config.artificialAnalysisApiKey || '').trim()
    // 锅巴配置的默认斩杀锚点模型（input 字符串，高级模糊匹配，匹配不到回退 DeepSeek V4 Flash）
    const defaultAnchor = String(config.defaultAnchorModel || '').trim()

    try {
      const result = await getCatalog(apiKey, config.artificialAnalysisApiTier)
      const catalog = result.catalog
      const allPlottable = catalog.models
        .filter(model => model.intelligence !== null && model.costPerTask !== null && model.costPerTask > 0)
      const requestedBaseline = e.msg.match(/^#LLM模型斩杀线\s*(.+)?$/i)?.[1] || ''
      const familyKeys = parseFamilyKeys(requestedBaseline)

      let models
      let baseline
      let filterText
      if (familyKeys.length) {
        // 家族筛选模式：如 #llm模型斩杀线 gpt / #llm模型斩杀线 kimi,glm,gemini / #llm模型斩杀线 qwen
        baseline = findBaseline(allPlottable, '', defaultAnchor)
        if (!baseline) {
          await e.reply(`当前数据中未找到 ${DEFAULT_BASELINE}，无法绘制默认斩杀线。`)
          return true
        }
        // 先按版本斩杀线筛选（动态品牌无斩杀线概念，视为全部）
        const aboveLineModels = allPlottable.filter(model => familyKeys.some(key => matchFamilyKey(model, key)))
        if (aboveLineModels.length < MAX_DISPLAY_MODELS) {
          // 满足斩杀线的模型不足 30 个时，取消版本斩杀线限制，展示该家族全部模型
          models = allPlottable.filter(model => familyKeys.some(key => matchFamilyKeyLoose(model, key)))
        } else {
          models = aboveLineModels
        }
        filterText = familyKeys.map(key => familyDisplayName(key)).join(' · ')
        if (models.length < 2) {
          await e.reply(`「${requestedBaseline}」家族当前可绘制的模型数据不足。`)
          return true
        }
      } else {
        // 默认模式：参数作为基准模型名，展示全量满足斩杀线的模型
        models = allPlottable.filter(model => getModelFamily(model))
        baseline = findBaseline(models, requestedBaseline, defaultAnchor)
        if (!baseline) {
          await e.reply(requestedBaseline
            ? `在当前筛选的模型中未找到「${requestedBaseline}」。`
            : `当前数据中未找到 ${DEFAULT_BASELINE}，无法绘制默认斩杀线。`)
          return true
        }
        if (models.length < 2) {
          await e.reply('当前可用于绘图的模型数据不足。')
          return true
        }
        // 左下方筛选说明：根据数据自动计算实际存在的厂家映射名
        filterText = buildFilterText(allPlottable)
      }

      if (result.warning) await e.reply(result.warning)
      const displayModels = chooseDisplayModels(models, baseline)
      const chart = createChart(displayModels, baseline, catalog, models.length)
      return await Render.render('llmKillLine/index', {
        ...chart,
        sourceTier: String(catalog.tier).toUpperCase(),
        filterText,
        baselineName: baseline.name,
        baselineCost: formatMoney(baseline.costPerTask),
        baselineScore: baseline.intelligence.toFixed(1),
      }, { e, scale: 1 })
    } catch (error) {
      logger.error('[SF插件] LLM模型斩杀线数据拉取失败', error)
      await e.reply(`LLM 模型数据拉取失败：${error.message || '请稍后重试'}。请检查 Artificial Analysis API Key 与层级设置。`)
      return true
    }
  }
}
