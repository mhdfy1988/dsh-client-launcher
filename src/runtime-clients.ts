/** One DSH client explicitly configured in the Desktop launcher. */
export interface RuntimeClientRecord {
  id: string
  name: string
  root: string
}

/** Versioned launcher state stored by the DSH client launcher. */
export interface RuntimeClientRegistry {
  version: 1
  activeId?: string
  clients: RuntimeClientRecord[]
}

function parseClient(value: unknown): RuntimeClientRecord {
  if (typeof value !== 'object' || value === null) throw new Error('DSH 客户端记录不是对象。')
  const id = Reflect.get(value, 'id')
  const name = Reflect.get(value, 'name')
  const root = Reflect.get(value, 'root')
  if (typeof id !== 'string' || id.trim() === '') throw new Error('DSH 客户端记录缺少 ID。')
  if (typeof name !== 'string' || name.trim() === '') throw new Error('DSH 客户端记录缺少名称。')
  if (typeof root !== 'string' || root.trim() === '') throw new Error('DSH 客户端记录缺少路径。')
  return { id, name, root }
}

/**
 * Parse launcher state from an untrusted JSON file.
 * @param value - parsed JSON value.
 * @returns validated client registry.
 */
export function parseRuntimeClientRegistry(value: unknown): RuntimeClientRegistry {
  if (typeof value !== 'object' || value === null) throw new Error('DSH 客户端配置不是对象。')
  const version = Reflect.get(value, 'version')
  const activeId = Reflect.get(value, 'activeId')
  const clients = Reflect.get(value, 'clients')
  if (version !== 1) throw new Error('DSH 客户端配置版本不受支持。')
  if (activeId !== undefined && typeof activeId !== 'string') throw new Error('默认 DSH 客户端 ID 无效。')
  if (!Array.isArray(clients)) throw new Error('DSH 客户端列表无效。')
  const parsedClients = clients.map(parseClient)
  const ids = new Set(parsedClients.map(client => client.id))
  if (ids.size !== parsedClients.length) throw new Error('DSH 客户端列表包含重复 ID。')
  if (activeId !== undefined && !ids.has(activeId)) throw new Error('默认 DSH 客户端不存在。')
  return {
    version,
    ...(activeId === undefined ? {} : { activeId }),
    clients: parsedClients,
  }
}

/** Create an empty first-launch registry. */
export function createEmptyRuntimeClientRegistry(): RuntimeClientRegistry {
  return { version: 1, clients: [] }
}
