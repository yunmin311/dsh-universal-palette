import type { PaletteItem } from '../shared/contract.ts'

export const NS = 'universal-palette'
export const en = {
  palette: 'Universal Palette', search: 'Search commands, sessions, models, history…', results: 'Palette results',
  searching: 'Searching…', noResults: 'No results for "{query}"', tryAgain: 'Try a shorter phrase or a command name.',
  choose: 'Select a workspace to start', create: 'Create or open a Session', requires: 'Commands and models require an active Session',
  workspace: 'Select workspace', newSession: 'New session', recent: 'Recent sessions',
  newHint: 'Create or open a blank Session', chooseHint: 'Choose a workspace, then start a Session', recentHint: 'Open an existing conversation',
  noRecent: 'No recent sessions yet. Start a Session from the sidebar.', empty: 'Choose a workspace or start a Session to continue.',
  current: 'Current', commands: 'Quick actions', models: 'Models', history: 'History', actions: 'Actions',
  footer: '↑↓ Navigate · Enter Open/Run · Tab Actions · Esc Close', open: 'Open', untitled: 'Untitled Session',
  idle: 'Idle', running: 'Running', justNow: 'Just now', minutes: '{n}m ago', hours: '{n}h ago', days: '{n}d ago',
  modelChoice: 'Select this model', modelPicker: 'Open DSH model selector', high: 'High', low: 'Low', medium: 'Medium',
  'command.goal': 'Set or view the goal for a long-running task', 'command.permission': 'View or change the permission preset',
  'command.compact': 'Compact older conversation history', 'command.export': 'Download the Session log as a ZIP archive',
  'command.feedback': 'Record feedback about this Session', 'command.plan': 'Enter or leave plan mode',
  feedbackRequired: 'Feedback text is required. Use /feedback <text> in the DSH composer.',
  actionFailed: 'Action unavailable. Check the DSH Session or try again.', providerFailed: 'Some results are unavailable. Try again.',
}
export type PaletteKey = keyof typeof en
export type PaletteTranslate = (key: PaletteKey, params?: Record<string, unknown>) => string
export const zh: Record<PaletteKey, string> = {
  palette: '通用面板', search: '搜索命令、会话、模型与历史…', results: '搜索结果',
  searching: '正在搜索…', noResults: '未找到“{query}”的结果', tryAgain: '试试更短的词句或命令名称。',
  choose: '选择工作区开始', create: '创建或打开会话', requires: '命令和模型需要先打开会话',
  workspace: '选择工作区', newSession: '新建会话', recent: '最近会话',
  newHint: '创建或打开空白会话', chooseHint: '先选择工作区，再开始会话', recentHint: '打开已有对话',
  noRecent: '暂无最近会话，可从侧栏开始新会话。', empty: '选择工作区或开始会话以继续。',
  current: '当前', commands: '快捷操作', models: '模型', history: '历史', actions: '操作',
  footer: '↑↓ 移动 · Enter 打开/执行 · Tab 操作 · Esc 关闭', open: '打开', untitled: '未命名会话',
  idle: '空闲', running: '运行中', justNow: '刚刚', minutes: '{n}分钟前', hours: '{n}小时前', days: '{n}天前',
  modelChoice: '选择此模型', modelPicker: '打开模型选择器', high: '高', low: '低', medium: '中',
  'command.goal': '设置或查看长期任务目标', 'command.permission': '查看或切换权限预设',
  'command.compact': '压缩较早的对话历史', 'command.export': '将会话日志下载为 ZIP 文件',
  'command.feedback': '记录对此会话的反馈', 'command.plan': '进入或退出规划模式',
  feedbackRequired: '请在会话输入框使用 /feedback <反馈内容>。',
  actionFailed: '操作暂不可用，请检查当前会话或重试。', providerFailed: '部分结果暂不可用，请重试。',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'universal-palette': PaletteKey }
}

export function ageText(updatedAt: number | undefined, t: PaletteTranslate): string {
  if (updatedAt === undefined) return ''
  const minutes = Math.max(0, Math.floor((Date.now() - updatedAt) / 60_000))
  if (minutes < 1) return t('justNow')
  if (minutes < 60) return t('minutes', {n:minutes})
  if (minutes < 1440) return t('hours', {n:Math.floor(minutes / 60)})
  return t('days', {n:Math.floor(minutes / 1440)})
}

/** Translate owned UI copy; never translate user titles, snippets or identifiers. */
export function presentItem(item: PaletteItem, t: PaletteTranslate, chinese: boolean): PaletteItem {
  let subtitle = item.subtitle
  let badges = item.badges?.map(value => value === 'current' ? t('current') : value === 'high' || value === 'medium' || value === 'low' ? t(value) : value)
  if (item.kind === 'command') {
    const key = `command.${item.title.replace(/^\//, '')}` as PaletteKey
    if (key in en) subtitle = t(key)
    else if (item.id === 'commands:client:model') subtitle = t('modelPicker')
  } else if (item.kind === 'model' && chinese) {
    subtitle = [item.source, t('modelChoice')].filter(Boolean).join(' · ')
  } else if (item.kind === 'session') {
    subtitle = subtitle?.split(' · ').map(value => value === 'current' || value === 'idle' || value === 'running' ? t(value) : value).join(' · ')
    badges = [ageText(item.updatedAt, t)].filter(Boolean)
  }
  return {...item, title:item.title || t('untitled'), subtitle, badges}
}
