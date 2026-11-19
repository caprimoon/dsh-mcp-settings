/**
 * Host half of @caprimoon/dsh-mcp-settings.
 *
 * The capability lives entirely in the Client half, which reads and writes the
 * `mcp-manager` settings namespace through the Remote settings API and streams
 * server status through `ctx.remote.mcpManager`. This plugin registers no Host
 * service, no tool and no config: it exists so the bundle row is mounted and the
 * browser artifact is served beside it.
 */

/** No Host-side behavior. */
export function apply() {}