/**
 * POST /api/voc-classify — classificador VoC stateless (Gemini/rules, sem banco).
 */
import '../scripts/load-dotenv.mjs';
import { handleVocClassifyVercel } from '../lib/persistence/voc-classify-http.mjs';

export default handleVocClassifyVercel;

export const config = {
  maxDuration: 300,
};
