import '../../scripts/load-dotenv.mjs';
import { handleSystemLogsVercel } from '../../lib/persistence/system-logs-http.mjs';

export default handleSystemLogsVercel;

export const config = { maxDuration: 30 };
