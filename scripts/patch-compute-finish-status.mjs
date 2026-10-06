import fs from 'fs';

const wfPath =
  'C:/Users/jessi/.cursor/projects/c-Users-jessi-OneDrive-rea-de-Trabalho-Projetos-NPS/agent-tools/a4f51088-6967-4d89-9527-bd1dfc06f3d0.txt';
const w = JSON.parse(fs.readFileSync(wfPath, 'utf8')).workflow;
let js = w.nodes.find((x) => x.name === 'Compute Finish Status').parameters.jsCode;

const insert = `
const diags = Array.isArray(sd.voc_invalid_diagnostics) ? sd.voc_invalid_diagnostics.slice(0, 20) : [];
const invalidCategoryCounts = diags.reduce((acc, d) => {
  const k = d.category || 'UNKNOWN';
  acc[k] = (acc[k] || 0) + 1;
  return acc;
}, {});
`;

if (!js.includes('voc_invalid_diagnostics')) {
  js = js.replace(
    'const errCounts = (c.http_429 || 0)',
    `${insert}\nconst errCounts = (c.http_429 || 0)`,
  );
  js = js.replace(
    'errors_json: JSON.stringify(safeErrors),',
    'errors_json: JSON.stringify({ sanitized_errors: safeErrors, invalid_diagnostics: diags, invalid_category_counts: invalidCategoryCounts }),',
  );
}

const payload = {
  workflowId: 'ENqJyEuulA0vzoI6',
  versionName: 'Finish Run includes invalid diagnostics',
  operations: [
    {
      type: 'setNodeParameter',
      nodeName: 'Compute Finish Status',
      path: '/jsCode',
      value: js,
    },
  ],
};

fs.writeFileSync('scripts/mcp-finish-status-update.json', JSON.stringify(payload));
console.log('written', js.length, js.includes('invalid_diagnostics'));
