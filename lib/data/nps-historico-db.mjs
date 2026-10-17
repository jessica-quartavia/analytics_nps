import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectBase0 } from '../base0/db.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readSnapshot(rel) {
  const abs = join(root, 'data', rel);
  const doc = JSON.parse(readFileSync(abs, 'utf8'));
  return doc.rows ?? doc;
}

/** SELECT em nps_historico (postgres). Fallback: snapshots materializados em data/processed. */
export async function fetchNpsHistoricoMedicoes() {
  try {
    const sql = connectBase0();
    try {
      return await sql`
        select ciclo, medicao, janela_datas, respostas, promotores, neutros, detratores, nps, nota_media
        from nps_historico.medicoes
        order by ciclo
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch {
    return readSnapshot('processed/nps_historico_medicoes_snapshot.json');
  }
}

export async function fetchNpsHistoricoRespostas() {
  try {
    const sql = connectBase0();
    try {
      return await sql`
        select ciclo, id_cliente, nota_nps, programa, ep, categoria
        from nps_historico.respostas
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch {
    return readSnapshot('processed/nps_historico_respostas_snapshot.json');
  }
}
