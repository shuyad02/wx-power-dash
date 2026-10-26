import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Zap, TrendingUp, BarChart2, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { fetchLatestForecast, fetchAccuracy } from '../api/endpoints.js';
import KPICard from '../components/KPICard.jsx';
import LoadingSpinner, { SkeletonCard, SkeletonChart } from '../components/LoadingSpinner.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import { formatMW, formatNumber, formatDateTime, formatHalfHourLabel, formatPercent } from '../utils/formatters.js';

/* ─────────────── Custom Tooltip ─────────────── */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f172a] border border-slate-600/60 rounded-xl px-4 py-3 shadow-2xl min-w-[180px]">
      <p className="text-slate-400 text-xs mb-2 font-medium">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-slate-300 text-xs">{entry.name}</span>
          </div>
          <span className="text-white text-xs font-semibold">
            {entry.value != null ? `${Number(entry.value).toFixed(0)} MW` : '—'}
          </span>
        </div>
      ))}
    </div>
  );
};

const ErrorTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  return (
    <div className="bg-[#0f172a] border border-slate-600/60 rounded-xl px-4 py-3 shadow-2xl">
      <p className="text-slate-400 text-xs mb-1 font-medium">{label}</p>
      <p className={`text-sm font-bold ${val > 0 ? 'text-amber-400' : 'text-blue-400'}`}>
        {val != null ? `${val > 0 ? '+' : ''}${Number(val).toFixed(0)} MW` : '—'}
      </p>
      <p className="text-slate-500 text-xs mt-1">
        {val > 0 ? 'Over-forecast' : 'Under-forecast'}
      </p>
    </div>
  );
};

/* ─────────────── UK Clock ─────────────── */
function UKClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const ukTime = time.toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const ukDate = time.toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (
    <div className="text-right">
      <div className="text-2xl font-mono font-bold text-white tabular-nums">{ukTime}</div>
      <div className="text-slate-400 text-xs mt-0.5">{ukDate} · UK Time</div>
    </div>
  );
}

/* ─────────────── Main Dashboard ─────────────── */
export default function Dashboard() {
  const {
    data: forecastData,
    isLoading: forecastLoading,
    isError: forecastError,
    error: forecastErr,
    refetch: refetchForecast,
  } = useQuery({
    queryKey: ['latestForecast'],
    queryFn: fetchLatestForecast,
    retry: 2,
  });

  const {
    data: accuracyData,
    isLoading: accuracyLoading,
    isError: accuracyError,
  } = useQuery({
    queryKey: ['accuracy'],
    queryFn: fetchAccuracy,
    retry: 2,
  });

  /* Build chart data */
  const chartData = useMemo(() => {
    // If accuracy timeseries is available, it provides matched Actual and Forecast pairs
    if (accuracyData?.timeseries?.length) {
      const recent = accuracyData.timeseries.slice(0, 48); // First full day of Jan 2026 or last 48 slots
      return recent.map((row) => ({
        label: formatHalfHourLabel(row.startTime) || row.startTime,
        startTime: row.startTime,
        Forecast: row.forecast != null ? Math.round(row.forecast) : null,
        Actual: row.actual != null ? Math.round(row.actual) : null,
        Error: row.error != null ? Math.round(row.error) : null,
      }));
    }

    if (!forecastData) return [];
    const records = Array.isArray(forecastData) ? forecastData : forecastData.data || [];
    if (!Array.isArray(records)) return [];

    return records.map((row) => {
      const label = row.startTime || row.settlement_time || row.time || row.timestamp;
      const forecast = row.generation ?? row.forecast_mw ?? row.forecast ?? null;
      const actual = row.actual ?? row.actual_mw ?? null;
      const error = forecast != null && actual != null ? forecast - actual : null;
      return {
        label: formatHalfHourLabel(label) || label,
        startTime: label,
        Forecast: forecast != null ? Math.round(forecast) : null,
        Actual: actual != null ? Math.round(actual) : null,
        Error: error != null ? Math.round(error) : null,
      };
    });
  }, [accuracyData, forecastData]);

  /* Summary stats */
  const summaryStats = useMemo(() => {
    if (!chartData.length) return {};
    const withActuals = chartData.filter((d) => d.Actual != null);
    const withForecast = chartData.filter((d) => d.Forecast != null);
    const latestForecast = withForecast.at(-1)?.Forecast ?? null;
    const maxActual = withActuals.length
      ? Math.max(...withActuals.map((d) => d.Actual))
      : null;
    const errors = withActuals
      .filter((d) => d.Error != null)
      .map((d) => Math.abs(d.Error));
    const mae = errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null;
    return { latestForecast, maxActual, mae };
  }, [chartData]);

  const mae = accuracyData?.overall?.mae ?? accuracyData?.mae ?? summaryStats.mae;
  const rmse = accuracyData?.overall?.rmse ?? accuracyData?.rmse;
  const mape = accuracyData?.overall?.mape ?? accuracyData?.mape;

  const isLoading = forecastLoading || accuracyLoading;
  const deliveryDate = chartData[0]?.startTime ? chartData[0].startTime.split('T')[0] : 'January 2026';
  const publishTime = Array.isArray(forecastData) && forecastData[0]?.publishTime ? forecastData[0].publishTime : null;

  return (
    <ErrorBoundary>
      <div className="space-y-6">

        {/* Page Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">
              Wind Generation Overview
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              D-1 Forecast vs Actuals · GB Embedded Wind · January 2026
            </p>
          </div>
          <UKClock />
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KPICard
            title="Latest Forecast Peak"
            value={summaryStats.latestForecast != null ? formatMW(summaryStats.latestForecast) : '—'}
            subtitle="Most recent half-hour"
            icon={<Zap size={16} />}
            accent="blue"
            loading={forecastLoading}
          />
          <KPICard
            title="Jan 2026 MAE"
            value={mae != null ? `${formatNumber(mae, 0)}` : '—'}
            unit="MW"
            subtitle="Mean Absolute Error"
            icon={<BarChart2 size={16} />}
            accent="amber"
            loading={accuracyLoading}
          />
          <KPICard
            title="Jan 2026 RMSE"
            value={rmse != null ? `${formatNumber(rmse, 0)}` : '—'}
            unit="MW"
            subtitle="Root Mean Square Error"
            icon={<TrendingUp size={16} />}
            accent="red"
            loading={accuracyLoading}
          />
          <KPICard
            title="Jan 2026 MAPE"
            value={mape != null ? formatPercent(mape) : '—'}
            subtitle="Mean Absolute % Error"
            icon={<Clock size={16} />}
            accent="purple"
            loading={accuracyLoading}
          />
        </div>

        {/* Forecast vs Actuals Chart */}
        {forecastError ? (
          <div className="bg-[#1e293b] rounded-xl p-8 border border-red-500/30 flex flex-col items-center gap-4">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <div className="text-center">
              <p className="text-white font-semibold mb-1">Failed to load forecast data</p>
              <p className="text-slate-400 text-sm">{forecastErr?.message || 'Check API connection'}</p>
            </div>
            <button
              onClick={refetchForecast}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        ) : forecastLoading ? (
          <SkeletonChart className="h-96" />
        ) : (
          <div className="bg-[#1e293b] rounded-xl p-6 border border-slate-700/50">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-white font-semibold text-base">
                  Forecast vs Actuals
                </h3>
                <p className="text-slate-400 text-xs mt-0.5">
                  {deliveryDate
                    ? `Delivery date: ${typeof deliveryDate === 'string' && deliveryDate.match(/^\d{4}-\d{2}-\d{2}$/) ? deliveryDate : deliveryDate}`
                    : 'Latest available period'}
                  {publishTime ? ` · Published: ${formatDateTime(publishTime, 'time')}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-0.5 bg-blue-400 rounded" />
                  <span className="text-slate-400 text-xs">D-1 Forecast</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-0.5 bg-emerald-400 rounded" />
                  <span className="text-slate-400 text-xs">Actual</span>
                </div>
              </div>
            </div>

            {chartData.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-slate-500">
                No data available for this period
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    axisLine={{ stroke: '#334155' }}
                    tickLine={false}
                    interval={3}
                    dy={8}
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
                    width={50}
                    label={{
                      value: 'Generation (MW)',
                      angle: -90,
                      position: 'insideLeft',
                      fill: '#64748b',
                      fontSize: 11,
                      dx: -10,
                    }}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="Forecast"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, fill: '#3b82f6' }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="Actual"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, fill: '#10b981' }}
                    connectNulls
                    strokeDasharray="0"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* Error Area Chart */}
        {!forecastError && !forecastLoading && chartData.some((d) => d.Error != null) && (
          <div className="bg-[#1e293b] rounded-xl p-6 border border-slate-700/50">
            <div className="mb-5">
              <h3 className="text-white font-semibold text-base">Forecast Error</h3>
              <p className="text-slate-400 text-xs mt-0.5">
                Error = Forecast − Actual · Positive = Over-forecast, Negative = Under-forecast
              </p>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="errorGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.4} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={{ stroke: '#334155' }}
                  tickLine={false}
                  interval={3}
                  dy={8}
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}`}
                  width={50}
                />
                <Tooltip content={<ErrorTooltip />} />
                <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" />
                <Area
                  type="monotone"
                  dataKey="Error"
                  stroke="#f59e0b"
                  fill="url(#errorGradient)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Info Banner */}
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-blue-300 font-medium text-sm">About this dashboard</p>
            <p className="text-slate-400 text-xs mt-1 leading-relaxed">
              This dashboard displays D-1 wind generation forecasts versus Elexon BMRS actuals for the GB embedded wind fleet.
              MAE represents the average forecast error in MW — use this to estimate how much additional power to procure
              from the day-ahead market. A positive error means the forecast over-predicted actual generation.
            </p>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
