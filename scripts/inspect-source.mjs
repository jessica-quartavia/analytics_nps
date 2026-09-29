import { createBaseQvClient, BASE_QV_QUERIES, fetchNpsCycles, fetchNpsResponses } from '../lib/data/base-qv.mjs';

const baseQv = createBaseQvClient();
const [cycles, sample] = await Promise.all([
  fetchNpsCycles(baseQv),
  fetchNpsResponses(baseQv),
]);

console.log(
  JSON.stringify(
    {
      queries: BASE_QV_QUERIES,
      nps_cycles: cycles.length,
      nps_responses: sample.length,
      sample_cycle_names: cycles.map((c) => c.name),
    },
    null,
    2,
  ),
);
