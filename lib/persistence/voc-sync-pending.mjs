function sourceTimestampMs(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * @param {object} item — work item
 * @param {object} ctx
 * @param {object} ctx.store
 * @param {string} ctx.classifierVersion
 * @param {boolean} ctx.force
 * @param {Map<string, boolean>} [ctx.clsCache] source_response_id → has classification
 */
export async function isWorkItemPending(item, ctx) {
  if (ctx.force) return true;

  const existing = await ctx.store.getExistingResponse(item.source_response_id, item.question_key);
  const isNew = !existing;
  const hashChanged = existing?.answer_hash !== item.answer_hash;

  const prevMs = sourceTimestampMs(existing?.source_updated_at);
  const nextMs = sourceTimestampMs(item.source_updated_at);
  const sourceChanged =
    prevMs != null && nextMs != null ? prevMs !== nextMs : Boolean(existing?.source_updated_at !== item.source_updated_at);

  if (isNew || hashChanged || sourceChanged) return true;

  const cacheKey = item.source_response_id;
  if (!ctx.clsCache.has(cacheKey)) {
    const hasCls = await ctx.store.hasClassificationForVersion(cacheKey, ctx.classifierVersion);
    ctx.clsCache.set(cacheKey, hasCls);
  }
  return !ctx.clsCache.get(cacheKey);
}

/**
 * @param {object[]} workItems
 * @param {object} ctx
 * @param {number|null} [ctx.limit] aplica após filtrar pendentes
 */
export async function filterPendingWorkItems(workItems, ctx) {
  const clsCache = new Map();
  const pending = [];
  for (const item of workItems) {
    if (await isWorkItemPending(item, { ...ctx, clsCache })) {
      pending.push(item);
      if (ctx.limit != null && pending.length >= ctx.limit) break;
    }
  }
  return pending;
}
