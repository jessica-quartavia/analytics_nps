/** Limiares centralizados — diagnóstico executivo (ETAPA 3.7). */

export const STABLE_NPS_THRESHOLD = 1;

export const MIN_EP_DIAGNOSIS_SAMPLE = 5;

export const MIN_DRIVER_N = 20;

export const SMALL_PAIRED_THRESHOLD = 30;

export const LOW_RESPONSE_RATE_THRESHOLD = 0.15;

export const HIGH_EP_PROXY_THRESHOLD = 0.35;

export const MIN_TOPIC_SHARE_PCT = 3;

export const EP_NPS_DECLINE_THRESHOLD = 5;

export const HIGH_DETRACTOR_SHARE_PCT = 20;

export const LOW_EP_CONFIDENCE_PCT = 50;

export const MAX_EXECUTIVE_DRIVERS = 5;

export const MIN_COMMENT_DRIVER_N = 15;

export const DRIVER_QUALITY_WEIGHT = {
  point_in_time: 3,
  partial: 2,
  current_proxy: 1,
  unavailable: 0,
};
