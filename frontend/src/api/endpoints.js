import apiClient from './client.js';

/**
 * Fetch actual wind generation data for a date range.
 * @param {string} dateFrom - ISO date string (YYYY-MM-DD)
 * @param {string} dateTo - ISO date string (YYYY-MM-DD)
 */
export async function fetchActuals(dateFrom, dateTo) {
  const { data } = await apiClient.get('/actuals', {
    params: { date_from: dateFrom, date_to: dateTo },
  });
  return data;
}

/**
 * Fetch the latest available forecast (most recent publish time).
 */
export async function fetchLatestForecast() {
  const { data } = await apiClient.get('/forecasts/latest');
  return data;
}

/**
 * Fetch forecasts for a date range.
 * @param {string} dateFrom - ISO date string
 * @param {string} dateTo - ISO date string
 */
export async function fetchForecasts(dateFrom, dateTo) {
  const { data } = await apiClient.get('/forecasts', {
    params: { date_from: dateFrom, date_to: dateTo },
  });
  return data;
}

/**
 * Fetch the forecast evolution (multiple publish times) for a delivery date.
 * @param {string} deliveryDate - ISO date string (YYYY-MM-DD)
 */
export async function fetchForecastEvolution(deliveryDate) {
  const { data } = await apiClient.get('/forecasts/evolution', {
    params: { delivery_date: deliveryDate },
  });
  return data;
}

/**
 * Fetch overall accuracy metrics for January 2026.
 */
export async function fetchAccuracy() {
  const { data } = await apiClient.get('/accuracy');
  return data;
}

/**
 * Fetch accuracy breakdown by hour of day.
 */
export async function fetchAccuracyByHour() {
  const { data } = await apiClient.get('/accuracy/by-hour');
  return data;
}

/**
 * Fetch daily accuracy metrics throughout January 2026.
 */
export async function fetchDailyAccuracy() {
  const { data } = await apiClient.get('/accuracy/daily');
  return data;
}
