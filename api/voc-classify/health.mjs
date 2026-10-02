import '../../scripts/load-dotenv.mjs';
import { handleVocClassifyHealthVercel } from '../../lib/persistence/voc-classify-http.mjs';

export default handleVocClassifyHealthVercel;

export const config = {
  maxDuration: 10,
};
