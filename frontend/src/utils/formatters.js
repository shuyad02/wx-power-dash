/**
 * Format a MW value with appropriate precision and unit.
 * @param {number} value - MW value
 * @param {number} decimals - decimal places
 * @returns {string}
 */
export function formatMW(value, decimals = 0) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(2)} GW`;
  }
  return `${value.toFixed(decimals)} MW`;
}

/**
 * Format a number with fixed decimal places.
 * @param {number} value
 * @param {number} decimals
 * @returns {string}
 */
export function formatNumber(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return value.toFixed(decimals);
}

/**
 * Format a percentage value.
 * @param {number} value - decimal fraction (0.05 = 5%) or already percentage
 * @param {boolean} isDecimal - if true, multiply by 100
 * @returns {string}
 */
export function formatPercent(value, isDecimal = false) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const pct = isDecimal ? value * 100 : value;
  return `${pct.toFixed(1)}%`;
}

/**
 * Format a datetime string to UK time display.
 * @param {string|Date} dateTime
 * @param {string} formatStr - 'time' | 'date' | 'datetime' | 'short'
 * @returns {string}
 */
export function formatDateTime(dateTime, formatStr = 'datetime') {
  if (!dateTime) return '—';
  const date = typeof dateTime === 'string' ? new Date(dateTime) : dateTime;
  if (isNaN(date.getTime())) return '—';

  const options = { timeZone: 'Europe/London' };

  switch (formatStr) {
    case 'time':
      return date.toLocaleTimeString('en-GB', {
        ...options,
        hour: '2-digit',
        minute: '2-digit',
      });
    case 'date':
      return date.toLocaleDateString('en-GB', {
        ...options,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    case 'short':
      return date.toLocaleDateString('en-GB', {
        ...options,
        day: '2-digit',
        month: 'short',
      });
    case 'datetime':
    default:
      return date.toLocaleString('en-GB', {
        ...options,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
  }
}

/**
 * Format a half-hourly settlement period time label from an ISO string.
 * @param {string} isoString
 * @returns {string} e.g. "08:30"
 */
export function formatHalfHourLabel(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get color class based on error magnitude relative to a threshold.
 * @param {number} absError - absolute error in MW
 * @param {number} warnThreshold - MW threshold for warning (default 200)
 * @param {number} errorThreshold - MW threshold for error (default 500)
 * @returns {string} Tailwind color class
 */
export function getErrorColorClass(absError, warnThreshold = 200, errorThreshold = 500) {
  if (absError === null || absError === undefined) return 'text-slate-400';
  if (absError < warnThreshold) return 'text-emerald-400';
  if (absError < errorThreshold) return 'text-amber-400';
  return 'text-red-400';
}

/**
 * Get background color class based on error magnitude.
 */
export function getErrorBgClass(absError, warnThreshold = 200, errorThreshold = 500) {
  if (absError === null || absError === undefined) return '';
  if (absError < warnThreshold) return 'bg-emerald-400/10';
  if (absError < errorThreshold) return 'bg-amber-400/10';
  return 'bg-red-400/10';
}
