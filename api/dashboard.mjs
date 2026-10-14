import '../scripts/load-dotenv.mjs';
import { handleDashboardApi } from '../lib/server/dashboard-api-router.mjs';

export default handleDashboardApi;

export const config = { maxDuration: 120 };
