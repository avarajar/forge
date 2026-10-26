export type ModuleErrorCode = 'unreachable' | 'unauthorized' | 'bad_request' | 'not_found' | 'upstream'

// a failure a module route or action reports on purpose
export class ModuleError extends Error {
  readonly code: ModuleErrorCode
  constructor(code: ModuleErrorCode, message: string) {
    super(message)
    this.name = 'ModuleError'
    this.code = code
  }
}

// a call outside what the manifest grants
export class PermissionError extends Error {
  readonly permission: string
  readonly value: string
  constructor(permission: string, value: string) {
    super(`permission ${permission} does not cover ${value}`)
    this.name = 'PermissionError'
    this.permission = permission
    this.value = value
  }
}

// what PanelClient throws when a module route answers with an error
export class ModuleRequestError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ModuleRequestError'
    this.code = code
  }
}
