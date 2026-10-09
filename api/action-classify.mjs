/**
 * POST /api/action-classify — classificação IA de itens do Plano de Ação (Gemini/rules).
 */
import '../scripts/load-dotenv.mjs';
import { handleActionClassifyVercel } from '../lib/persistence/action-classify-http.mjs';

export default handleActionClassifyVercel;

export const config = {
  maxDuration: 300,
};
