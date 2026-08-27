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

function getModelFamily(model) {
  const text = normaliseText(`${model.name} ${model.slug}`)
  for (const rule of FAMILY_RULES) {
    const match = text.match(rule.pattern)
    if (!match) continue
    const major = Number(match[1])
    const minor = Number(match[2] || 0)
    if (major > rule.min[0] || (major === rule.min[0] && minor >= rule.min[1])) {
      return rule
    }
  }
  return null
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
    const queue = familyQueues.get(family.key) || []
    queue.push(model)
    familyQueues.set(family.key, queue)
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
      color: family.color,
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
      rule: [{ reg: '^#LLM模型斩杀线(?:\\s+(.+))?$', fnc: 'renderKillLine' }],
    })
  }

  async renderKillLine(e) {
    const config = Config.getConfig().llmKillLine || {}
    const apiKey = String(config.artificialAnalysisApiKey || '').trim()

    try {
      const result = await getCatalog(apiKey, config.artificialAnalysisApiTier)
      const catalog = result.catalog
      const models = catalog.models
        .filter(model => model.intelligence !== null && model.costPerTask !== null && model.costPerTask > 0 && getModelFamily(model))
      const requestedBaseline = e.msg.match(/^#LLM模型斩杀线(?:\s+(.+))?$/)?.[1] || ''
      const baseline = findBaseline(models, requestedBaseline)
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

      if (result.warning) await e.reply(result.warning)
      const displayModels = chooseDisplayModels(models, baseline)
      const chart = createChart(displayModels, baseline, catalog, models.length)
      return await Render.render('llmKillLine/index', {
        ...chart,
        sourceTier: String(catalog.tier).toUpperCase(),
        filterText: FAMILY_RULES.map(rule => rule.label).join(' · '),
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
