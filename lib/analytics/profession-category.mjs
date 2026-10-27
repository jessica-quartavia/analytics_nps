export const NAO_INFORMADO = 'Não informado';

export const PROFESSION_CATEGORIES = [
  'Medicina / Saúde',
  'Engenharia',
  'Tecnologia',
  'Financeiro / Bancário',
  'Direito',
  'Empresário / Empreendedor',
  'Servidor público',
  'Aposentado',
  'Educação',
  'Contabilidade / Economia',
  'Outros',
  NAO_INFORMADO,
];

/** @param {string|null|undefined} raw */
export function normalizeProfessionText(raw) {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

const RULES_BEFORE_APOSENTADO = [
  {
    category: 'Medicina / Saúde',
    terms: [
      'medico',
      'medica',
      'medicina',
      'ortopedista',
      'cardiologista',
      'dentista',
      'fisioterapeuta',
      'enfermeiro',
      'enfermeira',
      'cirurgiao',
      'cirurgia',
      'psicologo',
      'psicologa',
      'farmaceutico',
      'farmaceutica',
      'veterinario',
      'veterinaria',
      'nutricionista',
      'biomedico',
      'saude',
    ],
  },
  {
    category: 'Engenharia',
    terms: ['engenheiro', 'engenheira', 'engenharia'],
  },
  {
    category: 'Tecnologia',
    terms: [
      'tecnologia',
      'software',
      ' programador',
      'programador',
      'desenvolvedor',
      'desenvolvedora',
      'cientista de dados',
      'analista de dados',
      'informatica',
      'analista de sistemas',
      'ti',
    ],
  },
  {
    category: 'Financeiro / Bancário',
    terms: [
      'banco',
      'bancario',
      'bancaria',
      'mercado financeiro',
      'investimentos',
      ' financeiro',
      'financeiro',
      'corretor',
      'corretora',
      'gestor financeiro',
    ],
  },
  {
    category: 'Direito',
    terms: ['advogado', 'advogada', 'juridico', 'juridica', ' direito', 'direito'],
  },
  {
    category: 'Empresário / Empreendedor',
    terms: [
      'empresario',
      'empresaria',
      'empreendedor',
      'empreendedora',
      ' socio',
      'socia',
      'socios',
      'ceo',
      'fundador',
      'fundadora',
    ],
  },
  {
    category: 'Servidor público',
    terms: [
      'servidor publico',
      'servidora publica',
      'funcionario publico',
      'funcionaria publica',
      'servico publico',
      'func publico',
    ],
  },
  {
    category: 'Educação',
    terms: [
      'professor',
      'professora',
      ' educacao',
      'educacao',
      'pedagog',
      'docente',
      'coordenador pedagogico',
    ],
  },
  {
    category: 'Contabilidade / Economia',
    terms: [
      'contador',
      'contadora',
      'contabil',
      'contabilidade',
      'economista',
      ' economia',
      'economia',
      'auditor fiscal',
    ],
  },
];

function matchesTerm(normalized, term) {
  const t = term.trim();
  if (!t) return false;
  if (t.length <= 4) {
    return new RegExp(`(?:^|[\\s,/()-])${t}(?:$|[\\s,/()-])`).test(` ${normalized} `);
  }
  return normalized.includes(t);
}

/**
 * @param {string|null|undefined} rawProfession
 * @returns {string}
 */
export function classifyProfessionCategory(rawProfession) {
  const raw = String(rawProfession ?? '').trim();
  if (!raw) return NAO_INFORMADO;

  const normalized = normalizeProfessionText(raw);
  if (!normalized) return NAO_INFORMADO;

  for (const rule of RULES_BEFORE_APOSENTADO) {
    if (rule.terms.some((t) => matchesTerm(normalized, t))) {
      return rule.category;
    }
  }

  if (/\baposentad/.test(normalized)) {
    return 'Aposentado';
  }

  return 'Outros';
}

/**
 * Agrupa categorias para donut (~8 fatias): menores viram "Outros" (exceto Não informado).
 * @param {Map<string, number>} categoryCounts
 * @param {number} [maxSlices=8]
 */
export function rollupProfessionCategoriesForPie(categoryCounts, maxSlices = 8) {
  const na = NAO_INFORMADO;
  const entries = [...categoryCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .filter((e) => e.count > 0);

  const total = entries.reduce((s, e) => s + e.count, 0) || 1;
  const sortEntries = (list) =>
    list.sort((a, b) => {
      if (a.label === na && b.label !== na) return 1;
      if (b.label === na && a.label !== na) return -1;
      return b.count - a.count || a.label.localeCompare(b.label, 'pt-BR');
    });

  sortEntries(entries);

  if (entries.length <= maxSlices) {
    return entries.map((e) => ({ ...e, pct: (e.count / total) * 100 }));
  }

  const naEntry = entries.find((e) => e.label === na);
  let working = entries.filter((e) => e.label !== na);
  const out = [];

  while (working.length > maxSlices - (naEntry ? 1 : 0)) {
    working = sortEntries([...working]);
    const smallest = working.pop();
    if (!smallest) break;
    const outros = working.find((e) => e.label === 'Outros');
    if (outros) outros.count += smallest.count;
    else working.push({ label: 'Outros', count: smallest.count });
  }

  if (naEntry) working.push(naEntry);
  sortEntries(working);

  return working.map((e) => ({ ...e, pct: (e.count / total) * 100 }));
}

/** @param {{ profession?: string, profession_raw?: string|null }[]} rows */
export function buildProfessionCategoriesAudit(rows) {
  const byRaw = new Map();
  for (const row of rows ?? []) {
    const raw = row.profession_raw ?? (row.profession === NAO_INFORMADO ? '' : row.profession);
    const rawKey = String(raw ?? '').trim() || '(vazio)';
    const normalized = normalizeProfessionText(raw);
    const category = classifyProfessionCategory(raw);
    const prev = byRaw.get(rawKey);
    if (prev) prev.count += 1;
    else byRaw.set(rawKey, { raw_profession: rawKey, normalized_profession: normalized, category, count: 1 });
  }
  return [...byRaw.values()].sort((a, b) => b.count - a.count || a.raw_profession.localeCompare(b.raw_profession, 'pt-BR'));
}
