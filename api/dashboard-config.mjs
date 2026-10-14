import '../scripts/load-dotenv.mjs';
import { handleDashboardConfigVercel } from '../lib/persistence/dashboard-config-http.mjs';

export default handleDashboardConfigVercel;

export const config = { maxDuration: 10 };
