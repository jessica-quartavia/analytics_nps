import fs from 'fs';

const wfPath = process.argv[2];
const w = JSON.parse(fs.readFileSync(wfPath, 'utf8')).workflow;
const conn = w.connections;

function outs(name) {
  const main = conn[name]?.main;
  if (!main) return [];
  return main.flatMap((branch, i) =>
    (branch || []).map((t) => `${t.node}[out${i}]`),
  );
}

function ins(name) {
  const found = [];
  for (const [src, main] of Object.entries(conn)) {
    if (!main?.main) continue;
    main.main.forEach((branch, i) => {
      for (const t of branch || []) {
        if (t.node === name) found.push(`${src}[out${i}]`);
      }
    });
  }
  return found;
}

const focus = [
  'Schedule 30min',
  'Set Voc Config',
  'Fetch NPS Cycles',
  'Read BASE QV NPS',
  'Attach Run Context',
  'Loop Responses',
  'Prepare VoC Input',
  'Unit Done Counters',
  'Create Run',
  'Capture Run Id',
];

console.log('=== GRAPH ===');
for (const n of focus) {
  const node = w.nodes.find((x) => x.name === n);
  if (!node) {
    console.log('\nMISSING', n);
    continue;
  }
  console.log(`\n${n} (${node.type}) disabled=${node.disabled}`);
  console.log('  IN:', ins(n).join(', ') || '(none)');
  console.log('  OUT:', outs(n).join(', ') || '(none)');
}

for (const name of ['Fetch NPS Cycles', 'Read BASE QV NPS', 'Attach Run Context', 'Unit Done Counters']) {
  const node = w.nodes.find((x) => x.name === name);
  console.log(`\n=== ${name} params ===`);
  if (node.parameters.query) {
    console.log(node.parameters.query);
    console.log('queryReplacement:', node.parameters.options?.queryReplacement);
  } else if (node.parameters.jsCode) {
    console.log(node.parameters.jsCode);
  }
}
