import '../scripts/load-dotenv.mjs';
import { handleVocApi } from '../lib/server/voc-api-router.mjs';

export default handleVocApi;

export const config = { maxDuration: 300 };
