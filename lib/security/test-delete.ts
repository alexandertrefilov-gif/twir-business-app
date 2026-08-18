interface TestDeleteEnvironment {
  NODE_ENV?: string
  TEST_DELETE_ENABLED?: string
}

export function isTestDeleteEnabled(
  env: TestDeleteEnvironment = process.env,
): boolean {
  return env.NODE_ENV === 'development' && env.TEST_DELETE_ENABLED === '1'
}

export function requireTestDeleteEnabled(
  env: TestDeleteEnvironment = process.env,
): void {
  if (!isTestDeleteEnabled(env)) {
    const error = new Error('Test-Löschfunktion ist deaktiviert.')
    error.name = 'ForbiddenError'
    throw error
  }
}
