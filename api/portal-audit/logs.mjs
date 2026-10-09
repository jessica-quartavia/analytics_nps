import '../../scripts/load-dotenv.mjs';
import { handlePortalAuditVercel } from '../../lib/persistence/portal-audit-http.mjs';

export default handlePortalAuditVercel;

export const config = { maxDuration: 30 };
