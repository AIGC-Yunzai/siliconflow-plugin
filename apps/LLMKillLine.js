import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import Config from '../components/Config.js'
import Render from '../components/Render.js'

const API_BASE_URL = 'https://artificialanalysis.ai/api/v2'
const CACHE_TTL = 8 * 60 * 60 * 1000
const MAX_PAGES = 20
const DEFAULT_BASELINE = 'DeepSeek V4 Flash 0731 (Reasoning, Max Effort)'

const FAMILY_RULES = [
  { key: 'anthropic', label: 'Anthropic ≥ 4.8', pattern: /\bclaude(?:\s+[a-z]+){0,2}\s+(\d+)(?:\s+(\d+))?/i, min: [4, 8], color: '#9b6dff' },
  { key: 'deepseek', label: 'DeepSeek ≥ V4', pattern: /\bdeepseek(?:\s+(?:chat|coder|r1))?\s+v?(\d+)(?:\s+(\d+))?/i, min: [4, 0], color: '#31b785' },
  { key: 'gemini', label: 'Gemini ≥ 3.0', pattern: /\bgemini\s+(\d+)(?:\s+(\d+))?/i, min: [3, 0], color: '#4d94ff' },
  { key: 'kimi', label: 'Kimi ≥ K3', pattern: /\bkimi\s+k?(\d+)(?:\s+(\d+))?/i, min: [3, 0], color: '#ea9a3d' },
  { key: 'glm', label: 'GLM ≥ 5.2', pattern: /\bglm\s+(\d+)(?:\s+(\d+))?/i, min: [5, 2], color: '#e36565' },
  { key: 'gpt', label: 'GPT ≥ 5.5', pattern: /\bgpt\s+(\d+)(?:\s+(\d+))?/i, min: [5, 5], color: '#25a6a0' },
  { key: 'grok', label: 'Grok ≥ 4.5', pattern: /\bgrok\s+(\d+)(?:\s+(\d+))?/i, min: [4, 5], color: '#cb72cf' },
]

let catalogCache = null
let catalogExpiresAt = 0
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
    intelligence: finiteNumber(model.evaluations?.artificial_analysis_intelligence_index),
    costPerTask: finiteNumber(model.artificial_analysis_intelligence_index_cost?.cost_per_task?.total_cost),
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
  const now = Date.now()
  if (catalogCache?.endpoint === endpoint && now < catalogExpiresAt) return catalogCache
  if (catalogPromise) return catalogPromise

  catalogPromise = (async () => {
    const first = await fetchPage(apiKey, endpoint, 1)
    const totalPages = Math.min(Number(first.pagination?.total_pages || 1), MAX_PAGES)
    const pages = await Promise.all(
      Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => fetchPage(apiKey, endpoint, index + 2)),
    )
    const rows = [first, ...pages].flatMap(page => Array.isArray(page.data) ? page.data : [])
    const models = Array.from(new Map(rows.map(model => [model.id || model.slug || model.name, normaliseModel(model)])).values())
    catalogCache = { models, syncedAt: new Date().toISOString(), tier: first.tier || tier || 'free', endpoint }
    catalogExpiresAt = Date.now() + CACHE_TTL
    return catalogCache
  })().finally(() => {
    catalogPromise = null
  })

  return catalogPromise
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

function createChart(models, baseline, source) {
  const plotWidth = 1110
  const plotHeight = 760
  const costs = models.map(model => model.costPerTask)
  const scores = models.map(model => model.intelligence)
  const minLogCost = Math.floor(Math.min(...costs.map(Math.log10)) * 2) / 2 - 0.15
  const maxLogCost = Math.ceil(Math.max(...costs.map(Math.log10)) * 2) / 2 + 0.15
  const minScore = Math.max(0, Math.floor((Math.min(...scores) - 2) / 5) * 5)
  const maxScore = Math.ceil((Math.max(...scores) + 2) / 5) * 5
  const xOf = cost => ((Math.log10(cost) - minLogCost) / (maxLogCost - minLogCost)) * plotWidth
  const yOf = score => plotHeight - ((score - minScore) / (maxScore - minScore)) * plotHeight
  const baselineX = xOf(baseline.costPerTask)
  const baselineY = yOf(baseline.intelligence)
  const step = maxLogCost - minLogCost > 3.5 ? 1 : 0.5
  const xTicks = []
  for (let value = Math.ceil(minLogCost / step) * step; value <= maxLogCost; value += step) {
    xTicks.push({ position: xOf(10 ** value), label: formatMoney(10 ** value) })
  }
  const yTicks = []
  for (let value = minScore; value <= maxScore; value += 5) {
    yTicks.push({ position: yOf(value), label: value })
  }

  const pendingPoints = models.map(model => {
    const family = getModelFamily(model)
    const isBaseline = model.id === baseline.id
    const isKiller = !isBaseline && model.intelligence >= baseline.intelligence && model.costPerTask <= baseline.costPerTask && (model.intelligence > baseline.intelligence || model.costPerTask < baseline.costPerTask)
    const x = xOf(model.costPerTask)
    const y = yOf(model.intelligence)
    return {
      ...model,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      color: family.color,
      isBaseline,
      isKiller,
      detail: `能力 ${model.intelligence.toFixed(1)} · 任务成本 ${formatMoney(model.costPerTask)}`,
    }
  })

  // The live catalog can contain over forty variants.  Place labels greedily
  // around their point so every model name remains legible in the rendered image.
  const occupiedLabels = []
  const intersects = (first, second) =>
    first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top
  const points = pendingPoints
    .sort((a, b) => Number(b.isBaseline) - Number(a.isBaseline) || Number(b.isKiller) - Number(a.isKiller) || a.y - b.y)
    .map(point => {
      const labelWidth = Math.min(250, Math.max(155, point.name.length * 7.6))
      const preferredSide = point.x > plotWidth * 0.67 ? 'left' : 'right'
      const sides = [preferredSide, preferredSide === 'left' ? 'right' : 'left']
      const offsets = point.y < 42 ? [18, 52, 86, 120, -16, -50, -84] : [-16, 18, -50, 52, -84, 86, -118, 120]
      const candidates = offsets.flatMap(top => sides.map(side => {
        const left = side === 'left' ? point.x - 12 - labelWidth : point.x + 12
        return { side, offsetY: top, top: point.y + top, left, right: left + labelWidth, bottom: point.y + top + 31 }
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
        labelX: placement.side === 'left' ? -12 : 12,
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
    killerCount: points.filter(point => point.isKiller).length,
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
    if (!apiKey) {
      await e.reply('请先在锅巴配置「LLM 模型斩杀线」中填写 Artificial Analysis API Key，再使用 #LLM模型斩杀线。')
      return true
    }

    try {
      const catalog = await getCatalog(apiKey, config.artificialAnalysisApiTier)
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

      const chart = createChart(models, baseline, catalog)
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
