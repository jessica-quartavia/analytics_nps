import '../scripts/load-dotenv.mjs';
import { handleDashboardCurrentNpsVercel } from '../lib/persistence/dashboard-current-nps-http.mjs';

export default handleDashboardCurrentNpsVercel;

export const config = { maxDuration: 60 };
