import '../scripts/load-dotenv.mjs';
import { handleActionOperationalVercel } from '../lib/persistence/action-operational-http.mjs';

export default handleActionOperationalVercel;

export const config = { maxDuration: 60 };
