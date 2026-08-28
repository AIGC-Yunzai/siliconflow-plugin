import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import fs from 'node:fs'
import path from 'node:path'
import Config from '../components/Config.js'
import Render from '../components/Render.js'

const API_BASE_URL = 'https://artificialanalysis.ai/api/v2'
const CACHE_TTL = 8 * 60 * 60 * 1000
const MAX_PAGES = 20
const MAX_DISPLAY_MODELS = 30
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

function findBaseline(models, query) {
  const normalizedQuery = normaliseText(query)
  if (normalizedQuery) {
    return models.find(model => normaliseText(model.name).includes(normalizedQuery) || normaliseText(model.slug).includes(normalizedQuery))
  }

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
      dsc: `展示指定新模型的能力与对数任务成本，并以 ${DEFAULT_BASELINE} 为默认基准`,
      event: 'message',
      priority: 1000,
      rule: [{ reg: new RegExp('^#LLM模型斩杀线\\s*(.+)?$', 'i'), fnc: 'renderKillLine' }],
    })
  }

  async renderKillLine(e) {
    const config = Config.getConfig().llmKillLine || {}
    const apiKey = String(config.artificialAnalysisApiKey || '').trim()

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
        baseline = findBaseline(allPlottable, '')
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
        baseline = findBaseline(models, requestedBaseline)
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
