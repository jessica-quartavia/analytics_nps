/**
 * POST /api/voc-prepare — normalização oficial VoC (sem banco).
 */
import '../scripts/load-dotenv.mjs';
import { handleVocPrepareVercel } from '../lib/persistence/voc-classify-http.mjs';

export default handleVocPrepareVercel;

export const config = {
  maxDuration: 60,
};
