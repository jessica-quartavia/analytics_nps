import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const partials = join(dirname(fileURLToPath(import.meta.url)), '../data/ingest/partials');
mkdirSync(partials, { recursive: true });

const bundle = {
  nps_cycles: [
    {
      id: '5d1bb5b4-43b2-4ad0-ba75-3430d21dfa6a',
      name: 'NPS 2026-T2',
      programa: null,
      starts_at: '2026-07-02T03:00:00+00:00',
      ends_at: '2026-08-13T02:59:59+00:00',
    },
    {
      id: '7f9f8b42-84ae-4e00-a408-d22bea7c4407',
      name: 'NPS 2026-T3',
      programa: null,
      starts_at: '2026-09-15T03:00:00+00:00',
      ends_at: null,
    },
  ],
  journey_stages: [
    { id: '7c43c981-5cc8-4ed3-b6ad-3bad26856b79', name: 'Onboarding', display_order: 0 },
    { id: '33bb253e-6c80-4611-a1dd-abc6515530e7', name: 'Onboarding', display_order: 1 },
    { id: '562f36dc-e059-4631-9fa4-b02dcecd069b', name: 'Preparação', display_order: 1 },
    { id: '78c87b40-0ed6-4ee8-9d0c-83f74d48da81', name: 'Preparação', display_order: 2 },
    { id: '51fed43b-61b3-418d-ad71-34081c8a2bf8', name: 'Implementação', display_order: 2 },
    { id: '56423a49-cb1a-4750-87c9-f4ee2ee7135f', name: 'Otimização', display_order: 3 },
    { id: 'e663383b-7ed6-40c0-b0d8-9f5b1b232829', name: 'Implementação', display_order: 3 },
    { id: 'b142f424-1135-4874-8dde-2c66b49f1758', name: 'Otimização', display_order: 4 },
  ],
};

writeFileSync(join(partials, 'nps_cycles.json'), `${JSON.stringify(bundle.nps_cycles)}\n`);
writeFileSync(join(partials, 'journey_stages.json'), `${JSON.stringify(bundle.journey_stages)}\n`);
console.log('wrote small bundle partials');
