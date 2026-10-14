import '../scripts/load-dotenv.mjs';
import { handleActionsApi } from '../lib/server/actions-api-router.mjs';

export default handleActionsApi;

export const config = { maxDuration: 120 };
