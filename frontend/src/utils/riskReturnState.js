// G6: pure helpers; no network, clock, DOM or locale side effects.
export const E02_SHARED_FIELDS = [
  'experiment_id', 'as_of', 'trained_until', 'risk_notice', 'target_notice', 'descriptive_risk'
];

export const KNOWN_REASONS = [
  'AS_OF_MISMATCH',
  'E10_STALE',
  'NO_E10_PREDICTION',
  'NO_E02_PREDICTION',
  'E10_TABLE_NOT_FOUND'
];

export function classifyRequestError(error) {
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return { kind: 'timeout', status: null };
  }
  const status = error?.status;
  if (status === 400) return { kind: 'badRequest', status };
  if (typeof status === 'number' && Number.isFinite(status) && status >= 401 && status <= 499) {
    return { kind: 'client', status };
  }
  if (typeof status === 'number' && Number.isFinite(status) && status >= 500) {
    return { kind: 'server', status };
  }
  if (typeof status !== 'number' || !Number.isFinite(status)) {
    return { kind: 'network', status: null };
  }
  return { kind: 'unknown', status };
}

export function classifyRiskReturnPayload(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body) || typeof body.aligned !== 'boolean') {
    return { kind: 'empty' };
  }
  if (body.aligned === false) {
    return {
      kind: 'unaligned',
      reason: KNOWN_REASONS.includes(body.reason) ? body.reason : 'UNKNOWN',
      rawReason: body.reason
    };
  }
  if (!Array.isArray(body.e02?.predictions) || body.e02.predictions.length === 0) {
    return { kind: 'empty' };
  }
  if (body.e10?.is_stale === true) {
    return { kind: 'defensiveStale', reason: 'E10_STALE' };
  }
  return { kind: 'success' };
}

// Recursive value comparison, insensitive to object-key order, sensitive to array order.
// No raw JSON.stringify equality: key order is not part of the contract.
export function deepEqualRiskValue(left, right) {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) {
    return left.length === right.length && left.every((value, index) => deepEqualRiskValue(value, right[index]));
  }
  const lKeys = Object.keys(left);
  const rKeys = Object.keys(right);
  if (lKeys.length !== rKeys.length) return false;
  return lKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && deepEqualRiskValue(left[key], right[key]));
}

export function sharedE02Fields(predictions) {
  const rows = Array.isArray(predictions) ? predictions : [];
  return Object.fromEntries(E02_SHARED_FIELDS.map((field) => [field, {
    shared: rows.length > 0 && rows.every((row) => deepEqualRiskValue(row?.[field], rows[0]?.[field])),
    value: rows[0]?.[field]
  }]));
}
