import { handleVocManualReviewVercel } from '../lib/persistence/voc-manual-review-http.mjs';

export default handleVocManualReviewVercel;

export const config = {
  maxDuration: 60,
};
