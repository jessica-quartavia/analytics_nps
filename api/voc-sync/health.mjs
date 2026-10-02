/**
 * GET /api/voc-sync/health — status leve (sem auth).
 */
import '../../scripts/load-dotenv.mjs';
import { handleVocSyncHealthVercel } from '../../lib/persistence/voc-sync-health.mjs';

export default handleVocSyncHealthVercel;

export const config = {
  maxDuration: 10,
};
