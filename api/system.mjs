import '../scripts/load-dotenv.mjs';
import { handleSystemApi } from '../lib/server/system-api-router.mjs';

export default handleSystemApi;

export const config = { maxDuration: 30 };
