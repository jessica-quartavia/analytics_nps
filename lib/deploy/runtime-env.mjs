/** Runtime Vercel / serverless (filesystem de deploy é read-only). */
export function isVercelServerless(env = process.env) {
  return env.VERCEL === '1' || Boolean(env.VERCEL_ENV);
}

export function isReadOnlyAppFilesystem(env = process.env) {
  return isVercelServerless(env);
}
