/**
 * POST /api/voc-sync — worker HTTP (Vercel serverless).
 * Auth: Authorization: Bearer ANALYTICS_NPS_VOC_SYNC_TOKEN
 */
import '../scripts/load-dotenv.mjs';
import { handleVocSyncVercel } from '../lib/persistence/voc-sync-http.mjs';

export default handleVocSyncVercel;

export const config = {
  maxDuration: 300,
};
