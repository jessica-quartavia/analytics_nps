const FORBIDDEN_SQL = /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|GRANT|REVOKE|TRUNCATE)\b/i;

const FORBIDDEN_QUERY_METHODS = new Set(['insert', 'update', 'delete', 'upsert']);

/**
 * Rejeita SQL de escrita (defesa se algum caminho expuser SQL no futuro).
 * @param {string} sql
 */
export function assertReadOnlySql(sql) {
  if (typeof sql !== 'string') return;
  if (FORBIDDEN_SQL.test(sql)) {
    throw new Error(`BASE QV read-only: SQL de escrita bloqueado (${sql.slice(0, 80)}…)`);
  }
}

/**
 * Envolve PostgrestQueryBuilder permitindo apenas operações de leitura.
 * @param {object} query
 */
export function guardQueryBuilder(query) {
  return new Proxy(query, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && FORBIDDEN_QUERY_METHODS.has(prop)) {
        throw new Error(
          `BASE QV read-only: .${prop}() não permitido. Use apenas SELECT via .select().`,
        );
      }
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return (...args) => {
          if (prop === 'select' && args[0] && typeof args[0] === 'string') {
            assertReadOnlySql(args[0]);
          }
          const result = value.apply(target, args);
          if (result && typeof result === 'object' && 'then' in result) {
            return result;
          }
          if (result && typeof result === 'object' && typeof result.select === 'function') {
            return guardQueryBuilder(result);
          }
          return result;
        };
      }
      return value;
    },
  });
}

/**
 * Cliente Supabase somente leitura (BASE QV).
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 */
export function guardSupabaseClient(client) {
  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'from') {
        return (table) => guardQueryBuilder(target.from(table));
      }
      if (prop === 'rpc') {
        throw new Error('BASE QV read-only: .rpc() bloqueado.');
      }
      if (prop === 'schema') {
        throw new Error('BASE QV read-only: .schema() bloqueado.');
      }
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
