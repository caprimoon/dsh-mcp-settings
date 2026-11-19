# @caprimoon/dsh-mcp-settings · MCP 服务器设置页

给 DeepSeek Harness 的 **设置** 加一个「MCP 服务器」页签，用来管理官方
`@deepseek-ai/dsh-mcp-manager` 的服务器集群。DSH 自带这个 manager（Web / Desktop
profile 都有 `mcp-manager` 这一行），但它没有任何界面，MCP 服务器只能手改
`cordis.patch.yml`；这个插件只做那层壳，复用宿主已有的设置与 MCP Remote，不碰
loader，也不托管子进程。

## 安装

在 **插件 → 添加插件** 里填 GitHub 源：

```
github:caprimoon/dsh-mcp-settings
```

或者装本地目录：把仓库路径填进去即可（本地路径会 link 安装，改完跟着热替换）。
Host 侧只有一行空壳，客户端 bundle 由 `client-hmr` 轮询热替换，通常不用重启。

装好之后最快的一条路：**设置 → MCP 服务器 → 新增服务器 → 填入 chrome-devtools 示例 →
保存**，就能拿到一套能直接用的配置（`npx chrome-devtools-mcp@latest --autoConnect`，
启动超时 60000 / 工具调用超时 120000）。如果 `chrome-devtools` 这个键已被占用，
示例会自动换成 `chrome-devtools-2`，所以随时点都不会撞名。

## 在哪里

**设置 → MCP 服务器**（导航顺序 12，落在「模型」和「内置插件」之间）。
只有当宿主挂载了 `mcp-manager` 这一行时页签才出现。

## 能做什么

- 列出每台服务器：名称、传输方式、实时状态徽标（已连接 / 连接中 / 重连中 /
  等待凭据 / 已停用 / 失败）、已注册工具数
- **新增 / 编辑**：`stdio`（命令 / 参数 / 环境变量 / 工作目录）与
  `streamable-http`（URL / 请求头）；切换传输方式时只写对应字段
- **一键填入示例**：新增表单右上角的「填入 chrome-devtools 示例」把整套可用配置
  （命令 / 参数 / 两条超时）填好，改不改随你；只填不保存，保存仍是显式动作
- **启用 / 停用**：关掉只卸载实例、保留条目
- **测试连接**：调用 manager 的 `probe`，不改动运行中的实例，回显服务器身份、
  工具数与耗时
- **重启**：调用 manager 的 `restart`，重建实例并重置重连预算
- **删除**：只对「用户层新增」的条目出现，`unset` 掉整个键。从更底层配置继承来的
  条目没有删除语义——宿主会把 `unset` 换成「写回继承值」，所以那类行给的是
  **重置**（`重置为继承值`），确认框里写明「用户层仍保留这条条目」。
- 由插件注册的服务器（`ctx.mcpManager.register()`）标为「插件注册」，只读：可测可重启。

## 写入去哪

所有改动都经过宿主的设置文档（shared config form → `settings.mutate`），
带 revision 校验，落到当前 profile 的 `cordis.patch.yml`：

```yaml
- id: mcp-manager
  config:
    servers:
      <name>:
        transport: stdio
        command: npx
        args: ['chrome-devtools-mcp@latest', '--autoConnect']
```

写入是**字段级**的：保存一台服务器只替换 `servers.<name>` 这一棵子树，其它服务器不动。
改完立即生效（`servers` 是 volatile 字段，manager 会立刻对账），重启 DSH 也不会丢。
写入带 revision 校验：别的界面先写过就会拒绝这次写，页面会重新读文档、把编辑器换成
当前取值再让你核对，不会静默覆盖。

## 密钥

`command` / `args` / `env` / `cwd` / `url` / `headers` 里的值都可以写成
`${credential:名字}` 引用宿主凭据库，表单只保存这个引用，**从不落明文**。
名字规则与宿主一致：`[A-Za-z_][A-Za-z0-9_]*`。

## 限制

- 表单写死这几条：`transport`、`command`/`args`/`env`/`cwd`、`url`/`headers`、
  `enabled`、`startupTimeoutMs`、`toolCallTimeoutMs`。保存时是**整条替换**
  `servers.<name>`，但会把 profile 层里手写的 `closeTimeoutMs` 与 `reconnect`
  原样带上，所以那两项在这里看不到、也不会被一次保存抹掉。
- 因为整条替换，从 `stdio` 切到 `streamable-http` 时旧传输方式的字段会被清掉——
  这正是 manager 的跨传输校验要求的。
- 超时留空表示「用户层没设」，沿用 mcp-client 默认值；已经有显式取值时才显示出来，
  这样普通保存不会顺手把默认值钉进 profile。
- 编辑器里参数一行一个、环境变量一行 `KEY=VALUE`、请求头一行 `KEY: VALUE`；
  行首尾空格会被去掉。
- **测试连接有自己的预算**：`probe` 走的是 mcp-client 里写死的
  `DEFAULT_PROBE_TIMEOUT_MS = 10_000`（`mcp-manager` 的 `probeFromClient` 不传
  `timeoutMs`），**不读**条目的 `startupTimeoutMs`。所以冷启动的
  `npx xxx@latest` 首次拉包时，常见「实例已连接、探测却
  `MCP operation timed out`」——两侧说的都是各自的事实，包缓存好之后再测一次即可。
  要根治就把命令换成已安装的可执行文件，或先手动跑一次让 npx 缓存就位。

## 兼容性

在一个安装了 `@deepseek-ai/dsh-mcp-manager@0.2.2-rc.5` 的
dsh-desktop 0.2.2-rc.5 上开发与验证。用到的宿主接口只有：设置文档的共享配置表单
（`settings.mutate` + revision）、`mcpManager` 的 `watch` / `restart` / `probe`、
以及 `settings.section` 槽位。这些都是 0.2.x 已有的公开面，不依赖任何私有实现。

## 许可

MIT © caprimoon