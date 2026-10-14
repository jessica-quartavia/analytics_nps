import '../scripts/load-dotenv.mjs';
import { handleDashboardRefreshVercel } from '../lib/persistence/dashboard-refresh-http.mjs';

export default handleDashboardRefreshVercel;

export const config = { maxDuration: 120 };
