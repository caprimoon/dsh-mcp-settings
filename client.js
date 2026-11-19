/**
 * @caprimoon/dsh-mcp-settings — the MCP servers page in Settings.
 *
 * This is a Client-only capability. The page reads and writes the official
 * `mcp-manager` settings namespace through the shared configuration form
 * (`ctx.configForms`), which owns the describe mirror, the revision fence and
 * the write/recovery queue, so every save lands in the active profile's
 * `cordis.patch.yml` under `mcp-manager → config.servers` and the manager
 * reconciles its live fleet. Live per-server status comes from the manager's
 * own `mcpManager/watch` Remote stream; `restart` and `probe` are the manager's
 * own operations, so this plugin never touches the loader or a child process.
 */
window.__ModuleLoader__.load({
  id: '@caprimoon/dsh-mcp-settings',
  factory(require) {
    'use strict'

    const React = require('react')
    const h = React.createElement
    const useState = React.useState
    const useEffect = React.useEffect
    const Fragment = React.Fragment

    /** The Client locale namespace this page registers. */
    const LOCALE_NS = 'settings.mcp'
    /** The Loader entry id owning the `servers` config — the settings namespace. */
    const SETTINGS_NS = 'mcp-manager'
    /** A server key is also its tool namespace (`mcp__<name>__*`). */
    const NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
    /** `${credential:REF}` per the mcp-client template grammar. */
    const TEMPLATE_EXACT = /^\$\{credential:[A-Za-z_][A-Za-z0-9_]*\}$/
    const templateSuspect = () => /\$\{[^}]*\}/g
    const TRANSPORTS = ['stdio', 'streamable-http']

    /* ------------------------------------------------------------------ *
     * locale
     * ------------------------------------------------------------------ */

    const EN = {
      nav: 'MCP servers',
      title: 'MCP servers',
      intro: 'The MCP servers of this deployment. Changes are saved to the active profile patch and applied live: a new server connects at once, an edited one is rebuilt, and turning “Enabled” off unmounts the instance while keeping the entry.',
      add: 'Add server',
      addTitle: 'New MCP server',
      editTitle: 'Edit {name}',
      empty: 'No MCP server is configured.',
      emptyHint: 'Add one to give this deployment tools from an MCP server.',
      loading: 'Loading the settings document…',
      unavailable: 'This deployment does not expose the mcp-manager settings namespace, so its servers cannot be managed here.',
      readOnly: 'The settings document is read-only for this browser, so changes are disabled.',
      noWriteAccess: 'This browser is not allowed to change settings.',
      noControlAccess: 'This browser is not allowed to control MCP servers.',
      inheritedBadge: 'inherited',
      overriddenBadge: 'overridden',
      registeredBadge: 'plugin',
      removedBadge: 'removed',
      actionEdit: 'Edit',
      actionProbe: 'Test connection',
      actionRestart: 'Restart',
      actionEnable: 'Enable',
      actionDisable: 'Disable',
      actionDelete: 'Delete',
      actionRevert: 'Reset',
      actionCancel: 'Cancel',
      actionSave: 'Save',
      actionSaving: 'Saving…',
      actionConfirm: 'Confirm',
      confirmDelete: 'Delete “{name}”? Its tools leave this session.',
      confirmRevert: 'Reset “{name}” to the inherited entry’s values? The user layer keeps the entry, holding the inherited values.',
      statusConnected: 'Connected · {count} tools',
      statusConnecting: 'Connecting…',
      statusConnectingAttempt: 'Connecting… (attempt {attempt})',
      statusReconnecting: 'Reconnecting ({attempt}/{max})',
      statusWaitingCredentials: 'Waiting for credentials',
      statusDisabled: 'Disabled',
      statusClosed: 'Closed',
      statusUnknown: 'No live status',
      failGaveUp: 'Reconnect budget exhausted',
      failReconnectDisabled: 'Disconnected, reconnect off',
      failUnclosed: 'Cleanup incomplete — restart DSH',
      failLoad: 'Startup failed',
      failCleanup: 'Cleanup failed',
      fieldName: 'Name',
      fieldNameHint: 'Also the tool namespace: mcp__{name}__*',
      fieldTransport: 'Transport',
      fieldCommand: 'Command',
      fieldArgs: 'Arguments',
      fieldArgsHint: 'One argument per line; surrounding spaces are trimmed.',
      fieldEnv: 'Environment',
      fieldEnvHint: 'KEY=VALUE per line.',
      fieldCwd: 'Working directory',
      fieldUrl: 'Endpoint URL',
      fieldHeaders: 'Request headers',
      fieldHeadersHint: 'KEY: VALUE per line.',
      fieldEnabled: 'Enabled',
      fieldStartupTimeout: 'Startup timeout (ms)',
      fieldToolCallTimeout: 'Tool-call timeout (ms)',
      fieldTimeoutHint: 'Blank keeps the mcp-client default. Raise the startup timeout for a first `npx` run (60000 is a good start).',
      placeholderDefault: 'default',
      templateHint: 'Any value here may reference a stored credential as ${credential:NAME}; only the reference is saved.',
      errNameRequired: 'A name is required.',
      errNamePattern: 'Use 1–32 characters from A–Z, a–z, 0–9, _ and -.',
      errNameTaken: 'Another server already uses this name.',
      errNameLocked: 'This name belongs to a lower configuration layer and cannot be renamed; add a new server instead.',
      errCommandRequired: 'A stdio server needs a command.',
      errUrlRequired: 'A streamable-http server needs an endpoint URL.',
      errTimeout: '{field} must be a whole number of milliseconds above 0.',
      errTemplate: 'Not a credential template: “{value}”. Write ${credential:NAME}.',
      errConflict: 'Another surface changed the settings document meanwhile. The editor now shows its current values — review them and save again.',
      errRejected: 'The host refused the change. The usual causes are a field that does not belong to the chosen transport, a malformed credential template, or a name a plugin already registers.',
      errNetwork: 'The change did not reach the host: {message}',
      errNoRevision: 'The settings document is not loaded yet.',
      errUnknown: 'The host returned no detail.',
      savedNote: 'Saved',
      enabledNote: 'Enabled',
      disabledNote: 'Disabled',
      probeRunning: 'Testing…',
      probeOk: '{name} · {count} tools · {ms} ms',
      probeOkAnonymous: '{count} tools · {ms} ms',
      probeTruncated: ' (list truncated)',
      probeConnectFailed: 'Probe could not connect: {message}',
      probeListFailed: 'Probe connected but could not list tools: {message}',
      probeBudgetHint: 'A probe has its own fixed 10 s budget and does not use the startup timeout, so a cold npx first run can time out here while the server itself still connects. Retry once the package is cached.',
      probeCleanup: 'Cleanup issue: {message}',
      probeFailed: 'Probe failed: {message}',
      restartFailed: 'Restart failed: {message}',
      restartDone: 'Restarted',
      restartRunning: 'Restarting…',
      statusStreamError: 'Live status unavailable: {message}',
    }

    const ZH = {
      nav: 'MCP 服务器',
      title: 'MCP 服务器',
      intro: '本部署的 MCP 服务器集群。改动会写入当前 profile 的补丁层并即时生效：新建的服务器立刻连接，修改过的会重建实例，关掉“启用”只卸载实例、保留条目。',
      add: '新增服务器',
      addTitle: '新增 MCP 服务器',
      editTitle: '编辑 {name}',
      empty: '还没有配置 MCP 服务器。',
      emptyHint: '新增一台，就能把它的工具带进这个部署。',
      loading: '正在读取设置文档…',
      unavailable: '本部署没有暴露 mcp-manager 的设置命名空间，因此无法在这里管理服务器。',
      readOnly: '当前浏览器只能读取设置文档，修改已禁用。',
      noWriteAccess: '当前浏览器无权修改设置。',
      noControlAccess: '当前浏览器无权控制 MCP 服务器。',
      inheritedBadge: '继承',
      overriddenBadge: '已覆盖',
      registeredBadge: '插件注册',
      removedBadge: '已移除',
      actionEdit: '编辑',
      actionProbe: '测试连接',
      actionRestart: '重启',
      actionEnable: '启用',
      actionDisable: '停用',
      actionDelete: '删除',
      actionRevert: '重置',
      actionCancel: '取消',
      actionSave: '保存',
      actionSaving: '保存中…',
      actionConfirm: '确认',
      confirmDelete: '删除“{name}”？它的工具会从当前会话中消失。',
      confirmRevert: '把“{name}”重置为继承条目的取值？用户层仍保留这条条目，内容与继承值相同。',
      statusConnected: '已连接 · {count} 个工具',
      statusConnecting: '连接中…',
      statusConnectingAttempt: '连接中…（第 {attempt} 次）',
      statusReconnecting: '重连中（{attempt}/{max}）',
      statusWaitingCredentials: '等待凭据',
      statusDisabled: '已停用',
      statusClosed: '已关闭',
      statusUnknown: '暂无实时状态',
      failGaveUp: '重连次数已用尽',
      failReconnectDisabled: '连接断开且未启用重连',
      failUnclosed: '清理未完成，需重启 DSH',
      failLoad: '实例启动失败',
      failCleanup: '清理失败',
      fieldName: '名称',
      fieldNameHint: '同时也是工具命名空间：mcp__{name}__*',
      fieldTransport: '传输方式',
      fieldCommand: '命令',
      fieldArgs: '参数',
      fieldArgsHint: '每行一个参数，行首尾空格会被忽略。',
      fieldEnv: '环境变量',
      fieldEnvHint: '每行 KEY=VALUE。',
      fieldCwd: '工作目录',
      fieldUrl: '端点 URL',
      fieldHeaders: '请求头',
      fieldHeadersHint: '每行 KEY: VALUE。',
      fieldEnabled: '启用',
      fieldStartupTimeout: '启动超时（毫秒）',
      fieldToolCallTimeout: '工具调用超时（毫秒）',
      fieldTimeoutHint: '留空则沿用 mcp-client 默认值。首次用 npx 拉包时建议把启动超时调到 60000。',
      placeholderDefault: '默认',
      templateHint: '这里的取值都可以写成 ${credential:名字} 引用已保存的凭据；表单只保存引用本身。',
      errNameRequired: '需要填一个名字。',
      errNamePattern: '名字只能是 A–Z、a–z、0–9、_ 和 -，长度 1–32。',
      errNameTaken: '这个名称已被另一台服务器占用。',
      errNameLocked: '这个名字属于更底层的配置，不能在这里改名；请新增一台服务器。',
      errCommandRequired: 'stdio 服务器必须填命令。',
      errUrlRequired: 'streamable-http 服务器必须填端点 URL。',
      errTimeout: '{field}必须是大于 0 的整数毫秒值。',
      errTemplate: '不是合法的凭据模板：“{value}”，应写成 ${credential:名字}。',
      errConflict: '刚刚有其他界面改过设置文档。编辑器已经换成它现在的取值，请核对后再保存。',
      errRejected: '宿主拒绝了这次修改。常见原因是某个字段不属于当前传输方式、凭据模板写坏了，或名称已被某个插件注册占用。',
      errNetwork: '改动没能送达宿主：{message}',
      errNoRevision: '设置文档还没有读到。',
      errUnknown: '宿主没有给出具体原因。',
      savedNote: '已保存',
      enabledNote: '已启用',
      disabledNote: '已停用',
      probeRunning: '测试中…',
      probeOk: '{name} · {count} 个工具 · {ms} 毫秒',
      probeOkAnonymous: '{count} 个工具 · {ms} 毫秒',
      probeTruncated: '（清单已截断）',
      probeConnectFailed: '测试连接未能连上：{message}',
      probeListFailed: '测试连接连上了，但工具清单没拉下来：{message}',
      probeBudgetHint: '探测有自己的固定 10 秒预算，不读启动超时；所以冷启动的 npx 首次拉包常常在这里超时，而服务器本身仍会按启动超时照常连上。包缓存好之后再测一次即可。',
      probeCleanup: '清理异常：{message}',
      probeFailed: '探测失败：{message}',
      restartFailed: '重启失败：{message}',
      restartDone: '已重启',
      restartRunning: '重启中…',
      statusStreamError: '实时状态不可用：{message}',
    }

    /* ------------------------------------------------------------------ *
     * helpers
     * ------------------------------------------------------------------ */

    const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

    /** Read one dict-valued field of a config layer. */
    const dictOf = (container, key) => (isRecord(container) && isRecord(container[key]) ? container[key] : {})

    const messageOf = (error) => (error instanceof Error ? error.message : String(error))

    /**
     * Fill `{name}` placeholders; unknown placeholders stay verbatim.
     * @param template - localized text.
     * @param params - values by placeholder name.
     * @returns the filled text.
     */
    function format(template, params) {
      if (params === undefined || params === null) return template
      return String(template).replace(/\{([A-Za-z_]\w*)\}/g, (whole, key) => (
        Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : whole
      ))
    }

    /** Split a textarea into trimmed, non-empty lines. */
    function lines(text) {
      return String(text ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
    }

    /** Parse `KEY=VALUE` / `KEY: VALUE` lines into an object (first separator wins). */
    function parsePairs(text, separator) {
      const out = {}
      for (const line of lines(text)) {
        if (line.startsWith('#')) continue
        const at = line.indexOf(separator)
        const key = (at < 0 ? line : line.slice(0, at)).trim()
        const value = at < 0 ? '' : line.slice(at + 1).trim()
        if (key !== '') out[key] = value
      }
      return out
    }

    /** Render an object as separator-joined lines. */
    function formatPairs(record, separator) {
      return Object.entries(isRecord(record) ? record : {})
        .map(([key, value]) => `${key}${separator}${String(value ?? '')}`)
        .join('\n')
    }

    /* ------------------------------------------------------------------ *
     * draft <-> entry
     * ------------------------------------------------------------------ */

    /** A blank draft for the add form. */
    function emptyDraft() {
      return {
        name: '',
        transport: 'stdio',
        command: '',
        args: '',
        env: '',
        cwd: '',
        url: '',
        headers: '',
        enabled: true,
        startupTimeoutMs: '',
        toolCallTimeoutMs: '',
      }
    }

    /**
     * Build an editable draft from one resolved entry.
     *
     * The timeouts come from the raw user layer, not the resolved value: the
     * resolved entry always carries the schema default, and showing it would
     * turn "blank keeps the default" into "every save pins 30000".
     * @param name - the entry key.
     * @param entry - the resolved entry the effective value carries.
     * @param userEntry - the raw profile-layer entry, when the user has one.
     * @returns the form state.
     */
    function draftOf(name, entry, userEntry) {
      const raw = isRecord(userEntry) ? userEntry : {}
      const timeout = (field) => (raw[field] === undefined ? '' : String(raw[field]))
      return {
        name,
        transport: entry.transport === 'streamable-http' ? 'streamable-http' : 'stdio',
        command: String(entry.command ?? ''),
        args: Array.isArray(entry.args) ? entry.args.join('\n') : '',
        env: formatPairs(entry.env, '='),
        cwd: String(entry.cwd ?? ''),
        url: String(entry.url ?? ''),
        headers: formatPairs(entry.headers, ': '),
        enabled: entry.enabled !== false,
        startupTimeoutMs: timeout('startupTimeoutMs'),
        toolCallTimeoutMs: timeout('toolCallTimeoutMs'),
      }
    }

    /** Fields the form does not own, carried over from the profile layer so an edit does not drop them. */
    function preservedFields(userEntry) {
      const raw = isRecord(userEntry) ? userEntry : {}
      const out = {}
      for (const field of ['closeTimeoutMs', 'reconnect']) {
        if (raw[field] !== undefined) out[field] = raw[field]
      }
      return out
    }

    /**
     * Build the configured entry a draft describes.
     *
     * Only the chosen transport's fields are written: the manager refuses a
     * cross-transport field, and replacing the whole entry at `servers.<name>`
     * is what makes a transport switch drop the old fields.
     * @param draft - form state.
     * @returns the entry to store.
     */
    function entryOf(draft) {
      const entry = { transport: draft.transport }
      if (draft.transport === 'stdio') {
        entry.command = draft.command.trim()
        const args = lines(draft.args)
        if (args.length > 0) entry.args = args
        const env = parsePairs(draft.env, '=')
        if (Object.keys(env).length > 0) entry.env = env
        const cwd = draft.cwd.trim()
        if (cwd !== '') entry.cwd = cwd
      } else {
        entry.url = draft.url.trim()
        const headers = parsePairs(draft.headers, ':')
        if (Object.keys(headers).length > 0) entry.headers = headers
      }
      entry.enabled = draft.enabled
      const startup = draft.startupTimeoutMs.trim()
      if (startup !== '') entry.startupTimeoutMs = Number(startup)
      const toolCall = draft.toolCallTimeoutMs.trim()
      if (toolCall !== '') entry.toolCallTimeoutMs = Number(toolCall)
      return entry
    }

    /** The templated strings of a draft, for the manager's template rule. */
    function templatedValues(draft) {
      const values = draft.transport === 'stdio'
        ? [draft.command, draft.cwd, ...lines(draft.args), ...Object.values(parsePairs(draft.env, '='))]
        : [draft.url, ...Object.values(parsePairs(draft.headers, ':'))]
      return values.filter((value) => value.includes('${'))
    }

    /**
     * Local validation mirroring the manager's write-time rules, so common
     * mistakes are reported in the user's language before a round trip.
     * @param t - translate function.
     * @param draft - form state.
     * @param options - the original key, every taken name, and whether renaming is allowed.
     * @returns a localized message, or null when the draft is fine.
     */
    function draftProblem(t, draft, options) {
      const name = draft.name.trim()
      if (name === '') return t('errNameRequired')
      if (!NAME_PATTERN.test(name)) return t('errNamePattern')
      if (name !== options.original && options.names.includes(name)) return t('errNameTaken')
      if (options.original !== null && name !== options.original && !options.canRename) return t('errNameLocked')
      if (draft.transport === 'stdio') {
        if (draft.command.trim() === '') return t('errCommandRequired')
      } else if (draft.url.trim() === '') {
        return t('errUrlRequired')
      }
      for (const [field, label] of [['startupTimeoutMs', 'fieldStartupTimeout'], ['toolCallTimeoutMs', 'fieldToolCallTimeout']]) {
        const value = draft[field].trim()
        if (value === '') continue
        if (!/^\d+$/.test(value) || Number(value) <= 0) return format(t('errTimeout'), { field: t(label) })
      }
      for (const value of templatedValues(draft)) {
        for (const occurrence of value.match(templateSuspect()) ?? []) {
          if (!TEMPLATE_EXACT.test(occurrence)) return format(t('errTemplate'), { value: occurrence })
        }
      }
      return null
    }

    /* ------------------------------------------------------------------ *
     * live status stream
     * ------------------------------------------------------------------ */

    /**
     * One logical `mcpManager/watch` subscription shared by every mounted page.
     *
     * The stream carries the complete server list on subscription and after
     * each status or entry change, so a published snapshot is always a whole
     * answer. A dropped stream reopens while the page stays mounted; an aborted
     * subscription ends the stream at the Host.
     * @param ctx - the Client plugin context, whose `remote.mcpManager` answers.
     * @returns a `{ getSnapshot, subscribe }` source for the page.
     */
    function createStatusSource(ctx) {
      const listeners = new Set()
      let snapshot = { rows: null, error: null }
      let controller

      const publish = (next) => {
        snapshot = next
        for (const listener of Array.from(listeners)) listener()
      }

      const wait = (ms, signal) => new Promise((resolve) => {
        const timer = setTimeout(done, ms)
        function done() {
          clearTimeout(timer)
          signal.removeEventListener('abort', done)
          resolve()
        }
        signal.addEventListener('abort', done, { once: true })
      })

      const pump = async (signal) => {
        let attempt = 0
        /** Consecutive generations that ended without yielding anything. */
        let emptyEnds = 0
        while (!signal.aborted) {
          let stream
          try {
            stream = ctx.remote.mcpManager.watch(signal)
          } catch (error) {
            publish({ rows: null, error: messageOf(error) })
            return
          }
          let received = false
          try {
            for await (const list of stream) {
              if (signal.aborted) return
              received = true
              attempt = 0
              const rows = Object.create(null)
              if (Array.isArray(list)) {
                for (const view of list) {
                  if (isRecord(view) && typeof view.name === 'string') rows[view.name] = view
                }
              }
              publish({ rows, error: null })
            }
            if (signal.aborted) return
            // A clean end still ends the subscription, so reopen rather than
            // leaving the page without status; a Host whose manager went away
            // makes the next open fail and surfaces its error instead.
            attempt += 1
            emptyEnds = received ? 0 : emptyEnds + 1
            if (emptyEnds >= 3) {
              publish({ rows: null, error: null })
              return
            }
            await wait(Math.min(attempt * 1500, 6000), signal)
          } catch (error) {
            if (signal.aborted) return
            publish({ rows: snapshot.rows, error: messageOf(error) })
            attempt += 1
            await wait(Math.min(attempt * 1500, 6000), signal)
          }
        }
      }

      return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener)
          if (listeners.size === 1) {
            controller = new AbortController()
            void pump(controller.signal)
          }
          return () => {
            if (!listeners.delete(listener)) return
            if (listeners.size > 0) return
            controller?.abort(new Error('mcp settings page closed'))
            controller = undefined
            publish({ rows: null, error: null })
          }
        },
      }
    }

    /* ------------------------------------------------------------------ *
     * hooks and presentation
     * ------------------------------------------------------------------ */

    /** Render a `{ getSnapshot, subscribe }` source without a React-version assumption. */
    function useSnapshot(source) {
      const [snapshot, setSnapshot] = useState(() => source.getSnapshot())
      useEffect(() => {
        setSnapshot(source.getSnapshot())
        return source.subscribe(() => setSnapshot(source.getSnapshot()))
      }, [source])
      return snapshot
    }

    /** Status badge text and tone for one live status union member. */
    function describeStatus(t, status) {
      if (!isRecord(status)) return { tone: 'idle', text: t('statusUnknown') }
      switch (status.state) {
        case 'connected':
          return { tone: 'ok', text: format(t('statusConnected'), { count: status.toolCount ?? 0 }) }
        case 'connecting':
          return status.attempt > 0
            ? { tone: 'busy', text: format(t('statusConnectingAttempt'), { attempt: status.attempt + 1 }) }
            : { tone: 'busy', text: t('statusConnecting') }
        case 'reconnecting':
          return {
            tone: 'warn',
            text: format(t('statusReconnecting'), { attempt: status.attempt ?? 0, max: status.maxAttempts ?? 0 }),
            detail: status.lastError,
          }
        case 'waiting-credentials':
          return { tone: 'warn', text: t('statusWaitingCredentials'), detail: status.lastError }
        case 'disabled':
          return { tone: 'idle', text: t('statusDisabled') }
        case 'closed': {
          // A closed transport can still have failed to close cleanly; that is
          // the one condition a restart is the answer to.
          const result = isRecord(status.result) ? status.result : {}
          if (result.closeConfirmed === false || result.cleanupError !== undefined) {
            return { tone: 'error', text: t('failCleanup'), detail: result.cleanupError }
          }
          return { tone: 'idle', text: t('statusClosed') }
        }
        case 'failed': {
          const key = status.reason === 'gave-up' ? 'failGaveUp'
            : status.reason === 'reconnect-disabled' ? 'failReconnectDisabled'
              : status.reason === 'unclosed-generation' ? 'failUnclosed'
                : status.reason === 'load' ? 'failLoad'
                  : status.reason === 'cleanup' ? 'failCleanup'
                    : 'statusUnknown'
          return { tone: 'error', text: t(key), detail: status.lastError ?? status.result?.cleanupError }
        }
        default:
          return { tone: 'idle', text: String(status.state ?? '') }
      }
    }

    /** One-line transport summary of an entry. */
    function summaryOf(entry) {
      if (!isRecord(entry)) return ''
      if (entry.transport === 'streamable-http') return String(entry.url ?? '')
      return [entry.command ?? '', ...(Array.isArray(entry.args) ? entry.args : [])].join(' ')
    }

    /* ------------------------------------------------------------------ *
     * editor
     * ------------------------------------------------------------------ */

    /**
     * One labelled form field. The hint sits outside the `<label>` so it never
     * joins the control's accessible name.
     */
    function Field(props) {
      return h('div', { className: 'dms-field' },
        h('label', { className: 'dms-fieldBody' },
          h('span', { className: 'dms-fieldLabel' }, props.label),
          props.children),
        props.hint === undefined || props.hint === null ? null : h('span', { className: 'dms-hint' }, props.hint))
    }

    /** Add/edit form for one server entry. */
    function ServerEditor(props) {
      const { t, draft, onChange, onCancel, onSave, busy, error, isNew, canRename } = props
      const root = React.useRef(null)
      useEffect(() => {
        // The add form renders below the list, so bring it into view when it opens.
        root.current?.scrollIntoView?.({ block: 'nearest' })
      }, [])
      const set = (patch) => onChange({ ...draft, ...patch })
      const submit = (event) => {
        event.preventDefault()
        if (!busy) onSave()
      }
      const stdio = draft.transport === 'stdio'
      return h('form', { className: 'dms-editor', ref: root, onSubmit: submit, noValidate: true },
        h('div', { className: 'dms-editorHead' },
          h('span', { className: 'dms-editorTitle' },
            isNew ? t('addTitle') : format(t('editTitle'), { name: draft.name.trim() || '—' }))),
        h('div', { className: 'dms-grid' },
          h(Field, {
            label: t('fieldName'),
            hint: draft.name.trim() === '' ? null : format(t('fieldNameHint'), { name: draft.name.trim() }),
          }, h('input', {
            className: 'dms-input',
            value: draft.name,
            disabled: busy || !canRename,
            spellCheck: false,
            autoComplete: 'off',
            autoFocus: true,
            placeholder: 'chrome-devtools',
            onChange: (event) => set({ name: event.target.value }),
          })),
          h(Field, { label: t('fieldTransport') }, h('select', {
            className: 'dms-input dms-select',
            value: draft.transport,
            disabled: busy,
            onChange: (event) => set({ transport: event.target.value }),
          }, TRANSPORTS.map((transport) => h('option', { key: transport, value: transport }, transport))))),
        stdio ? h(Fragment, null,
          h('div', { className: 'dms-grid' },
            h(Field, { label: t('fieldCommand') }, h('input', {
              className: 'dms-input',
              value: draft.command,
              disabled: busy,
              spellCheck: false,
              autoComplete: 'off',
              placeholder: 'npx',
              onChange: (event) => set({ command: event.target.value }),
            })),
            h(Field, { label: t('fieldCwd') }, h('input', {
              className: 'dms-input',
              value: draft.cwd,
              disabled: busy,
              spellCheck: false,
              autoComplete: 'off',
              placeholder: 'C:\\work',
              onChange: (event) => set({ cwd: event.target.value }),
            }))),
          h(Field, { label: t('fieldArgs'), hint: t('fieldArgsHint') }, h('textarea', {
            className: 'dms-input dms-textarea',
            value: draft.args,
            disabled: busy,
            rows: 2,
            spellCheck: false,
            placeholder: 'chrome-devtools-mcp@latest\n--autoConnect',
            onChange: (event) => set({ args: event.target.value }),
          })),
          h(Field, { label: t('fieldEnv'), hint: `${t('fieldEnvHint')} ${t('templateHint')}` }, h('textarea', {
            className: 'dms-input dms-textarea',
            value: draft.env,
            disabled: busy,
            rows: 2,
            spellCheck: false,
            placeholder: 'GITHUB_TOKEN=${credential:GITHUB_TOKEN}',
            onChange: (event) => set({ env: event.target.value }),
          })))
          : h(Fragment, null,
            h(Field, { label: t('fieldUrl') }, h('input', {
              className: 'dms-input',
              value: draft.url,
              disabled: busy,
              spellCheck: false,
              autoComplete: 'off',
              placeholder: 'https://mcp.example.com/mcp',
              onChange: (event) => set({ url: event.target.value }),
            })),
            h(Field, { label: t('fieldHeaders'), hint: `${t('fieldHeadersHint')} ${t('templateHint')}` }, h('textarea', {
              className: 'dms-input dms-textarea',
              value: draft.headers,
              disabled: busy,
              rows: 2,
              spellCheck: false,
              placeholder: 'Authorization: Bearer ${credential:MCP_TOKEN}',
              onChange: (event) => set({ headers: event.target.value }),
            }))),
        h('div', { className: 'dms-grid' },
          h(Field, { label: t('fieldStartupTimeout'), hint: t('fieldTimeoutHint') }, h('input', {
            className: 'dms-input',
            value: draft.startupTimeoutMs,
            disabled: busy,
            inputMode: 'numeric',
            placeholder: t('placeholderDefault'),
            onChange: (event) => set({ startupTimeoutMs: event.target.value }),
          })),
          h(Field, { label: t('fieldToolCallTimeout') }, h('input', {
            className: 'dms-input',
            value: draft.toolCallTimeoutMs,
            disabled: busy,
            inputMode: 'numeric',
            placeholder: t('placeholderDefault'),
            onChange: (event) => set({ toolCallTimeoutMs: event.target.value }),
          }))),
        h('label', { className: 'dms-check' },
          h('input', {
            type: 'checkbox',
            checked: draft.enabled,
            disabled: busy,
            onChange: (event) => set({ enabled: event.target.checked }),
          }),
          h('span', null, t('fieldEnabled'))),
        error === null || error === undefined ? null : h('p', { className: 'dms-error', role: 'alert' }, error),
        h('div', { className: 'dms-editorActions' },
          h('button', {
            type: 'button', className: 'dms-button', disabled: busy, onClick: onCancel,
          }, t('actionCancel')),
          h('button', {
            type: 'submit', className: 'dms-button dms-buttonPrimary', disabled: busy,
          }, busy ? t('actionSaving') : t('actionSave'))))
    }

    /* ------------------------------------------------------------------ *
     * section
     * ------------------------------------------------------------------ */

    /** The Settings page: one row per managed server plus the add/edit surface. */
    function McpServersSection(props) {
      const t = props.t
      const useRemoteAccess = props.useRemoteAccess ?? (() => true)
      const mayMutate = useRemoteAccess('settings/mutate') !== false
      const mayControl = useRemoteAccess('mcpManager/restart') !== false
      const mayProbe = useRemoteAccess('mcpManager/probe') !== false

      const config = useSnapshot(props.configSource)
      const live = useSnapshot(props.statusSource)

      const [editing, setEditing] = useState(null)
      /** In-flight operations as `{ kind, name }` entries, so one row's finish never clears another's. */
      const [busy, setBusy] = useState([])
      const [results, setResults] = useState({})
      const [confirming, setConfirming] = useState(null)
      const [editorError, setEditorError] = useState(null)

      const servers = dictOf(config.value, 'servers')
      const baseServers = dictOf(config.base, 'servers')
      const userServers = dictOf(config.user, 'servers')
      const names = Object.keys(servers)

      const mayWrite = mayMutate && config.writable !== false
      const maySave = mayWrite && config.revision !== undefined

      const beginBusy = (kind, name) => setBusy((current) => [...current, { kind, name }])
      const endBusy = (kind, name) => setBusy((current) => (
        current.filter((entry) => !(entry.kind === kind && entry.name === name))
      ))
      const busyWith = (kind, name) => busy.some((entry) => entry.kind === kind && entry.name === name)
      const busyFor = (name) => busy.some((entry) => entry.name === name)

      const setResult = (name, result) => setResults((previous) => ({ ...previous, [name]: result }))

      const liveRows = isRecord(live.rows) ? live.rows : {}

      /** Which layer holds this key: a profile-only entry, an override, or a lower-layer entry. */
      const buildRow = (name) => {
        const entry = servers[name]
        const view = liveRows[name]
        const origin = entry === undefined
          ? 'registered'
          : userServers[name] !== undefined
            ? (baseServers[name] !== undefined ? 'overridden' : 'added')
            : 'inherited'
        return {
          name,
          entry,
          origin: isRecord(view) && view.configured === false ? 'removed' : origin,
        }
      }

      // Configured entries in document order, then any entry only the manager knows
      // about (a plugin registration, or a removed entry whose cleanup still runs).
      const rowNames = names.slice()
      for (const name of Object.keys(liveRows)) if (!rowNames.includes(name)) rowNames.push(name)
      const rows = rowNames.map(buildRow)

      /**
       * Send one path mutation through the shared form: it carries the current
       * revision, serializes, folds an accepted answer into the mirror and
       * re-reads the document after a refusal.
       * @param ops - ordered `set`/`unset` operations.
       * @returns `{ ok: true }` or a localized failure and its kind.
       */
      const mutate = async (ops) => {
        if (!maySave) return { ok: false, reason: 'no-revision', message: t('errNoRevision') }
        // Read the fence from the form itself, not the render snapshot, so the
        // conflict check below compares the revision this write actually used.
        const before = props.form.getSnapshot().revision
        let accepted = false
        try {
          accepted = await props.form.mutate(ops)
        } catch (error) {
          return { ok: false, reason: 'network', message: format(t('errNetwork'), { message: messageOf(error) }) }
        }
        if (accepted) return { ok: true }
        // The form re-read the document after a refusal: a moved revision means
        // someone else wrote first, an unchanged one means the host refused it.
        const after = props.form.getSnapshot().revision
        return before === after
          ? { ok: false, reason: 'rejected', message: t('errRejected') }
          : { ok: false, reason: 'conflict', message: t('errConflict') }
      }

      const saveDraft = async () => {
        if (editing === null) return
        const problem = draftProblem(t, editing.draft, {
          original: editing.original,
          names: rowNames,
          canRename: editing.canRename,
        })
        if (problem !== null) {
          setEditorError(problem)
          return
        }
        const name = editing.draft.name.trim()
        // The entry is replaced whole at `servers.<name>`; carry over the fields
        // the form does not own so a hand-tuned budget or reconnect policy
        // survives an edit (the host stores exactly what is sent for this key).
        const value = { ...preservedFields(userServers[editing.original ?? name]), ...entryOf(editing.draft) }
        const ops = [{ op: 'set', path: ['servers', name], value }]
        if (editing.original !== null && editing.original !== name) {
          ops.push({ op: 'unset', path: ['servers', editing.original] })
        }
        setEditorError(null)
        beginBusy('save', editing.original ?? '')
        const outcome = await mutate(ops)
        endBusy('save', editing.original ?? '')
        if (!outcome.ok) {
          setEditorError(outcome.message)
          // A conflict means the document moved under this editor: re-seed it
          // from the freshly read entry so the message's promise holds. Read
          // through the form, not this render's snapshot, which predates it.
          if (outcome.reason === 'conflict' && editing.original !== null) {
            const freshSnapshot = props.form.getSnapshot()
            const fresh = dictOf(freshSnapshot.value, 'servers')[editing.original]
            if (isRecord(fresh)) {
              const raw = dictOf(freshSnapshot.user, 'servers')[editing.original]
              setEditing((current) => (current === null
                ? current
                : { ...current, draft: draftOf(current.original, fresh, raw) }))
            } else {
              setEditing(null)
            }
          }
          return
        }
        setEditing(null)
        setResult(name, { tone: 'ok', text: t('savedNote') })
      }

      const toggleEnabled = async (name, enabled) => {
        beginBusy('toggle', name)
        const outcome = await mutate([{ op: 'set', path: ['servers', name, 'enabled'], value: enabled }])
        endBusy('toggle', name)
        setResult(name, outcome.ok
          ? { tone: 'ok', text: t(enabled ? 'enabledNote' : 'disabledNote') }
          : { tone: 'error', text: outcome.message })
      }

      const removeRow = async (row) => {
        setConfirming(null)
        beginBusy('delete', row.name)
        const outcome = await mutate([{ op: 'unset', path: ['servers', row.name] }])
        endBusy('delete', row.name)
        if (!outcome.ok) {
          setResult(row.name, { tone: 'error', text: outcome.message })
          return
        }
        setResults((previous) => {
          const next = { ...previous }
          delete next[row.name]
          return next
        })
        if (editing !== null && editing.original === row.name) setEditing(null)
      }

      const restart = async (name) => {
        beginBusy('restart', name)
        setResult(name, { tone: 'busy', text: t('restartRunning') })
        try {
          const answer = await props.restart(name)
          setResult(name, answer.ok
            ? { tone: 'ok', text: t('restartDone') }
            : { tone: 'error', text: format(t('restartFailed'), { message: answer.message ?? t('errUnknown') }) })
        } finally {
          endBusy('restart', name)
        }
      }

      const probe = async (name) => {
        beginBusy('probe', name)
        setResult(name, { tone: 'busy', text: t('probeRunning') })
        try {
          setResult(name, await props.probe(name))
        } finally {
          endBusy('probe', name)
        }
      }

      const startEdit = (row) => {
        setConfirming(null)
        setEditorError(null)
        setEditing({
          original: row.name,
          canRename: row.origin === 'added',
          draft: draftOf(row.name, row.entry, userServers[row.name]),
        })
      }

      const startCreate = () => {
        setConfirming(null)
        setEditorError(null)
        setEditing({ original: null, canRename: true, draft: emptyDraft() })
      }

      const renderRow = (row) => {
        const entry = row.entry
        const hasEntry = isRecord(entry)
        const rowBusy = busyFor(row.name)
        const result = results[row.name]
        const isEditing = editing !== null && editing.original === row.name
        const disabledEntry = hasEntry && entry.enabled === false
        const mayEdit = mayWrite && hasEntry && row.origin !== 'removed'
        const mayRemove = mayWrite && hasEntry && row.origin === 'added'
        const mayRevert = mayWrite && hasEntry && row.origin === 'overridden'
        const transport = hasEntry ? String(entry.transport ?? '') : ''
        const summary = summaryOf(entry)
        const view = liveRows[row.name]
        const badge = describeStatus(t, isRecord(view) ? view.status : undefined)
        const removable = mayRemove || mayRevert
        return h('li', { key: row.name, className: 'dms-card', 'data-editing': isEditing ? 'true' : undefined },
          h('div', { className: 'dms-head' },
            h('div', { className: 'dms-identity' },
              h('span', { className: 'dms-name' }, row.name),
              transport === '' ? null : h('span', { className: 'dms-tag' }, transport),
              row.origin === 'inherited' ? h('span', { className: 'dms-tag' }, t('inheritedBadge')) : null,
              row.origin === 'overridden' ? h('span', { className: 'dms-tag' }, t('overriddenBadge')) : null,
              row.origin === 'registered' ? h('span', { className: 'dms-tag' }, t('registeredBadge')) : null,
              row.origin === 'removed' ? h('span', { className: 'dms-tag' }, t('removedBadge')) : null),
            h('span', { className: 'dms-status', 'data-tone': badge.tone },
              h('span', { className: 'dms-dot' }),
              h('span', { className: 'dms-statusText' }, badge.text),
              badge.detail === undefined || badge.detail === null
                ? null
                : h('span', { className: 'dms-statusDetail', title: String(badge.detail) }, String(badge.detail))),
            h('div', { className: 'dms-actions' },
              hasEntry ? h('button', {
                type: 'button',
                className: 'dms-switch',
                role: 'switch',
                'aria-checked': disabledEntry ? 'false' : 'true',
                'aria-label': `${row.name}: ${t('fieldEnabled')}`,
                title: t(disabledEntry ? 'actionEnable' : 'actionDisable'),
                disabled: !mayWrite || rowBusy,
                onClick: () => { void toggleEnabled(row.name, disabledEntry) },
              }, h('span', { className: 'dms-switchThumb' })) : null,
              mayEdit ? h('button', {
                type: 'button', className: 'dms-button', disabled: rowBusy || isEditing,
                'aria-label': `${t('actionEdit')} — ${row.name}`,
                onClick: () => { startEdit(row) },
              }, t('actionEdit')) : null,
              h('button', {
                type: 'button', className: 'dms-button',
                'aria-label': `${t('actionProbe')} — ${row.name}`,
                disabled: !mayProbe || rowBusy || row.origin === 'removed',
                onClick: () => { void probe(row.name) },
              }, t('actionProbe')),
              row.origin === 'removed' ? null : h('button', {
                type: 'button', className: 'dms-button',
                'aria-label': `${t('actionRestart')} — ${row.name}`,
                disabled: !mayControl || rowBusy || disabledEntry,
                onClick: () => { void restart(row.name) },
              }, t('actionRestart')),
              removable ? h('button', {
                type: 'button', className: 'dms-button dms-buttonDanger',
                'aria-label': `${t(mayRevert ? 'actionRevert' : 'actionDelete')} — ${row.name}`,
                disabled: rowBusy,
                onClick: () => { setConfirming(row.name) },
              }, t(mayRevert ? 'actionRevert' : 'actionDelete')) : null)),
          summary === '' ? null : h('div', { className: 'dms-summary', title: summary }, summary),
          confirming === row.name ? h('div', { className: 'dms-confirm' },
            h('span', null, format(t(mayRevert ? 'confirmRevert' : 'confirmDelete'), { name: row.name })),
            h('div', { className: 'dms-confirmActions' },
              h('button', {
                type: 'button', className: 'dms-button', onClick: () => { setConfirming(null) },
              }, t('actionCancel')),
              h('button', {
                type: 'button', className: 'dms-button dms-buttonDanger',
                onClick: () => { void removeRow(row) },
              }, t('actionConfirm')))) : null,
          result === undefined ? null : h('p', {
            className: 'dms-result', 'data-tone': result.tone, role: result.tone === 'error' ? 'alert' : 'status',
          }, result.text),
          isEditing ? h(ServerEditor, {
            t,
            draft: editing.draft,
            onChange: (draft) => setEditing({ ...editing, draft }),
            onCancel: () => { setEditing(null); setEditorError(null) },
            onSave: () => { void saveDraft() },
            busy: busyWith('save', editing.original ?? ''),
            error: editorError,
            isNew: false,
            canRename: editing.canRename,
          }) : null)
      }

      const head = h('div', { className: 'dms-heading' },
        h('h2', { className: 'dms-title' }, t('title')),
        h('p', { className: 'dms-intro' }, t('intro')))

      if (config.status === 'loading') {
        return h('section', { className: 'dms-section' }, head, h('p', { className: 'dms-muted' }, t('loading')))
      }
      if (config.status === 'unavailable') {
        return h('section', { className: 'dms-section' }, head, h('p', { className: 'dms-muted' }, t('unavailable')))
      }

      const notices = []
      if (!mayMutate) notices.push(t('noWriteAccess'))
      else if (config.writable === false) notices.push(t('readOnly'))
      if (!mayControl || !mayProbe) notices.push(t('noControlAccess'))
      if (typeof live.error === 'string' && live.error !== '') {
        notices.push(format(t('statusStreamError'), { message: live.error }))
      }

      return h('section', { className: 'dms-section' },
        head,
        notices.map((text, index) => h('p', { key: `notice-${index}`, className: 'dms-muted' }, text)),
        rows.length === 0
          ? h('div', { className: 'dms-empty' },
            h('p', { className: 'dms-emptyTitle' }, t('empty')),
            h('p', { className: 'dms-hint' }, t('emptyHint')))
          : h('ul', { className: 'dms-rows' }, rows.map(renderRow)),
        editing !== null && editing.original === null
          ? h('div', { className: 'dms-addCard' }, h(ServerEditor, {
            t,
            draft: editing.draft,
            onChange: (draft) => setEditing({ ...editing, draft }),
            onCancel: () => { setEditing(null); setEditorError(null) },
            onSave: () => { void saveDraft() },
            busy: busyWith('save', ''),
            error: editorError,
            isNew: true,
            canRename: true,
          }))
          : h('button', {
            type: 'button',
            className: 'dms-add',
            disabled: !mayWrite || editing !== null || busy.length > 0,
            onClick: startCreate,
          }, `+ ${t('add')}`))
    }

    /* ------------------------------------------------------------------ *
     * styles
     * ------------------------------------------------------------------ */

    const STYLE_TEXT = `
.dms-section{display:flex;flex-direction:column;gap:12px;max-width:760px;color:var(--dsw-alias-label-primary)}
.dms-heading{display:flex;flex-direction:column;gap:6px}
.dms-title{margin:0;font-size:18px;line-height:26px;font-weight:600}
.dms-intro{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.dms-muted{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.dms-rows{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.dms-card{border:0.5px solid var(--dsw-alias-settings-card-stroke);background:var(--dsw-alias-settings-card-fill);border-radius:var(--dsw-radius-xl);padding:12px 14px;display:flex;flex-direction:column;gap:10px}
.dms-card[data-editing=true]{border-color:var(--dsw-alias-state-business-primary)}
.dms-head{display:flex;align-items:center;gap:10px;min-width:0;flex-wrap:wrap}
.dms-identity{display:inline-flex;align-items:center;gap:6px;min-width:0;flex-wrap:wrap}
.dms-name{font-size:14px;line-height:22px;font-weight:500;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
.dms-tag{flex:none;padding:1px 6px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-xs);font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.dms-status{display:inline-flex;align-items:center;gap:6px;min-width:0;flex:none;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dms-dot{display:inline-block;flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}
.dms-status[data-tone=ok] .dms-dot{background:var(--dsw-alias-state-success-primary)}
.dms-status[data-tone=ok]{color:var(--dsw-alias-state-success-primary)}
.dms-status[data-tone=busy] .dms-dot{background:var(--dsw-alias-state-business-primary)}
.dms-status[data-tone=warn] .dms-dot{background:var(--dsw-alias-state-warn-primary)}
.dms-status[data-tone=warn]{color:var(--dsw-alias-state-warn-primary)}
.dms-status[data-tone=error] .dms-dot{background:var(--dsw-alias-state-error-primary)}
.dms-status[data-tone=error]{color:var(--dsw-alias-state-error-primary)}
.dms-statusText{white-space:nowrap}
.dms-statusDetail{max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary)}
.dms-actions{display:inline-flex;align-items:center;gap:4px;margin-left:auto;flex-wrap:wrap;justify-content:flex-end}
.dms-summary{font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dms-result{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dms-result[data-tone=ok]{color:var(--dsw-alias-state-success-primary)}
.dms-result[data-tone=busy]{color:var(--dsw-alias-label-secondary)}
.dms-result[data-tone=error]{color:var(--dsw-alias-state-error-primary)}
.dms-result[data-tone=warn]{color:var(--dsw-alias-state-warn-primary)}
.dms-confirm{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 10px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dms-confirmActions{display:inline-flex;gap:6px;margin-left:auto}
.dms-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;height:28px;padding:0 10px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.dms-button:disabled{opacity:0.4;cursor:default}
.dms-button:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
@media (hover:hover){.dms-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}}
.dms-buttonPrimary{background:var(--dsw-alias-button-primary-fill);border-color:transparent;color:var(--dsw-alias-label-primary-foreground)}
@media (hover:hover){.dms-buttonPrimary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}}
.dms-buttonDanger{color:var(--dsw-alias-state-error-primary)}
@media (hover:hover){.dms-buttonDanger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}}
.dms-switch{position:relative;box-sizing:border-box;flex:none;width:34px;height:20px;padding:0;border:none;border-radius:999px;background:var(--dsw-alias-border-l4);cursor:pointer;transition:background 120ms ease}
.dms-switch[aria-checked=true]{background:var(--dsw-alias-state-business-primary)}
.dms-switch:disabled{opacity:0.4;cursor:default}
.dms-switch:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
.dms-switchThumb{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground);transition:transform 120ms ease}
.dms-switch[aria-checked=true] .dms-switchThumb{transform:translateX(14px)}
.dms-add{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:6px;width:100%;height:44px;border:1px dashed var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;cursor:pointer}
.dms-add:disabled{opacity:0.4;cursor:default}
.dms-add:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
@media (hover:hover){.dms-add:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}}
.dms-empty{margin-top:4px;padding:16px;border:1px dashed var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);display:flex;flex-direction:column;gap:4px;align-items:center;text-align:center}
.dms-emptyTitle{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.dms-addCard,.dms-editor{border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-module-platform);padding:14px 16px;display:flex;flex-direction:column;gap:14px}
.dms-addCard .dms-editor{background:none;padding:0}
.dms-editorHead{display:flex;align-items:baseline;gap:8px}
.dms-editorTitle{font-size:14px;line-height:22px;font-weight:500;color:var(--dsw-alias-label-primary)}
.dms-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 8px}
@media (max-width:560px){.dms-grid{grid-template-columns:minmax(0,1fr)}}
.dms-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.dms-fieldBody{display:flex;flex-direction:column;gap:6px;min-width:0;cursor:pointer}
.dms-fieldLabel{font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.dms-hint{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}
.dms-input{box-sizing:border-box;width:100%;height:32px;padding:0 10px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);font:inherit;font-size:13px;line-height:20px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dms-input:focus{outline:none;border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
.dms-input::placeholder{color:var(--dsw-alias-label-dimmed)}
.dms-input:disabled{opacity:0.6;cursor:default}
.dms-textarea{height:auto;min-height:56px;padding:8px 10px;font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;resize:vertical}
.dms-select{cursor:pointer}
.dms-check{display:inline-flex;align-items:center;gap:8px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);cursor:pointer}
.dms-check input{width:14px;height:14px;accent-color:var(--dsw-alias-state-business-primary);cursor:pointer}
.dms-error{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}
.dms-editorActions{display:flex;justify-content:flex-end;gap:8px}
@media (prefers-reduced-motion: reduce){.dms-switch,.dms-switchThumb{transition:none}}
`

    /* ------------------------------------------------------------------ *
     * plugin
     * ------------------------------------------------------------------ */

    return {
      inject: ['slots', 'locale', 'remote', 'remote.mcpManager', 'configForms'],
      apply(ctx) {
        const form = ctx.configForms.get(SETTINGS_NS)
        const configSource = {
          getSnapshot: () => form.getSnapshot(),
          subscribe: (listener) => form.subscribe(listener),
        }
        const statusSource = createStatusSource(ctx)

        ctx.effect(() => ctx.locale.register(LOCALE_NS, { en: EN, zh: ZH }), 'mcp-settings: dictionaries')

        ctx.effect(() => {
          const style = document.createElement('style')
          style.id = 'dsh-mcp-settings-style'
          style.textContent = STYLE_TEXT
          document.head.append(style)
          return () => { style.remove() }
        }, 'mcp-settings: styles')

        /** Rebuild one server through the manager, folding the failure into a message. */
        const restart = async (name) => {
          const t = ctx.locale.bind(LOCALE_NS)
          try {
            const answer = await ctx.remote.mcpManager.restart(name)
            if (answer !== undefined && answer.ok === true) return { ok: true }
            return { ok: false, message: answer?.error?.message ?? t('errUnknown') }
          } catch (error) {
            return { ok: false, message: messageOf(error) }
          }
        }

        /** Probe one entry without touching its live instance, and describe the outcome. */
        const probe = async (name) => {
          const t = ctx.locale.bind(LOCALE_NS)
          let answer
          try {
            answer = await ctx.remote.mcpManager.probe(name)
          } catch (error) {
            return { tone: 'error', text: format(t('probeFailed'), { message: messageOf(error) }) }
          }
          if (answer === undefined || answer.ok !== true) {
            return { tone: 'error', text: format(t('probeFailed'), { message: answer?.error?.message ?? t('errUnknown') }) }
          }
          const result = isRecord(answer.value) ? answer.value : {}
          const cleanup = result.cleanupError === undefined
            ? ''
            : ` — ${format(t('probeCleanup'), { message: String(result.cleanupError) })}`
          if (result.ok !== true) {
            const key = result.stage === 'list' ? 'probeListFailed' : 'probeConnectFailed'
            // The probe's budget is its own fixed 10 s constant, so a timeout
            // says nothing about the entry's startupTimeoutMs; say so once the
            // diagnostic looks like one rather than leaving the reader to guess.
            const timedOut = /timed?\s*out|timeout/i.test(String(result.message ?? ''))
            const hint = timedOut ? ` ${t('probeBudgetHint')}` : ''
            return {
              tone: 'error',
              text: format(t(key), { message: String(result.message ?? t('errUnknown')) }) + cleanup + hint,
            }
          }
          const identity = isRecord(result.serverInfo)
            ? `${String(result.serverInfo.name ?? '')} ${String(result.serverInfo.version ?? '')}`.trim()
            : ''
          const counts = {
            name: identity,
            count: Array.isArray(result.toolNames) ? result.toolNames.length : 0,
            ms: result.durationMs ?? 0,
          }
          const text = (identity === '' ? format(t('probeOkAnonymous'), counts) : format(t('probeOk'), counts))
            + (result.truncated === true ? t('probeTruncated') : '')
            + cleanup
          return { tone: cleanup === '' ? 'ok' : 'warn', text }
        }

        // One injected face, built once: the page derives from these identities.
        const injected = { configSource, statusSource, form, restart, probe }

        // The page exists only while the Host serves the manager's namespace, so
        // a deployment without mcp-manager shows no trace of it.
        ctx.effect(() => ctx.configForms.whileServed([SETTINGS_NS], () => (
          ctx.slots.inject('settings.section', () => ctx.slots.register({
            name: 'settings.section',
            id: 'mcp-servers',
            order: 12,
            label: () => ctx.locale.bind(LOCALE_NS)('nav'),
            locale: LOCALE_NS,
            inject: () => injected,
          }, McpServersSection))
        )), 'mcp-settings: settings section')
      },
    }
  },
})