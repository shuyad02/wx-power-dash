import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  AlertOctagon,
  Scale,
  ShieldAlert,
  HelpCircle,
  Activity,
  CheckCircle,
} from 'lucide-react';
import { fetchAccuracy } from '../api/endpoints.js';
import KPICard from '../components/KPICard.jsx';
import LoadingSpinner, { SkeletonChart } from '../components/LoadingSpinner.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import { formatNumber, formatPercent, formatMW } from '../utils/formatters.js';

export default function AccuracyAnalysis() {
  const [activeTab, setActiveTab] = useState('hourly'); // 'hourly' | 'timeline' | 'scatter'

  const {
    data: accuracyData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['accuracyMetrics'],
    queryFn: fetchAccuracy,
    retry: 2,
  });

  const overall = accuracyData?.overall || {};
  const byHour = accuracyData?.by_hour || [];
  const timeseries = accuracyData?.timeseries || [];

  // Scatter plot data downsampled for performance if large
  const scatterData = useMemo(() => {
    if (!timeseries.length) return [];
    // sample up to 500 points smoothly
    const step = Math.max(1, Math.floor(timeseries.length / 500));
    return timeseries
      .filter((_, idx) => idx % step === 0)
      .map((pt) => ({
        actual: Math.round(pt.actual),
        forecast: Math.round(pt.forecast),
        error: Math.round(pt.error),
      }));
  }, [timeseries]);

  // Daily aggregate error trend
  const dailyTrend = useMemo(() => {
    if (!timeseries.length) return [];
    const daysMap = new Map();

    timeseries.forEach((pt) => {
      const dateStr = pt.startTime.split('T')[0];
      if (!daysMap.has(dateStr)) {
        daysMap.set(dateStr, { date: dateStr.slice(5), absErrors: [], errors: [] });
      }
      daysMap.get(dateStr).absErrors.push(pt.abs_error);
      daysMap.get(dateStr).errors.push(pt.error);
    });

    return Array.from(daysMap.values()).map((d) => {
      const mae = d.absErrors.reduce((a, b) => a + b, 0) / d.absErrors.length;
      const bias = d.errors.reduce((a, b) => a + b, 0) / d.errors.length;
      return {
        date: d.date,
        MAE: Math.round(mae),
        Bias: Math.round(bias),
      };
    });
  }, [timeseries]);

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-[#1e293b] p-6 rounded-xl border border-slate-700/50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                Forecast Accuracy & Error Quantification
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Rigorous evaluation of Day-Ahead wind predictions against BMRS FUELHH outturn for January 2026
              </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 text-xs font-semibold">
              <Activity className="w-4 h-4 animate-pulse" />
              <span>{overall.n_matched ? `${overall.n_matched} Half-Hourly Pairs Analyzed` : 'January 2026 Full Month'}</span>
            </div>
          </div>
        </div>

        {/* Core KPI metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <KPICard
            title="MAE"
            value={overall.mae != null ? `${formatNumber(overall.mae, 0)}` : '—'}
            unit="MW"
            subtitle="Mean Absolute Error"
            accent="amber"
            icon={<Scale size={16} />}
            loading={isLoading}
          />
          <KPICard
            title="RMSE"
            value={overall.rmse != null ? `${formatNumber(overall.rmse, 0)}` : '—'}
            unit="MW"
            subtitle="Root Mean Squared Error"
            accent="red"
            icon={<AlertOctagon size={16} />}
            loading={isLoading}
          />
          <KPICard
            title="Systematic Bias"
            value={overall.bias != null ? `${overall.bias > 0 ? '+' : ''}${formatNumber(overall.bias, 0)}` : '—'}
            unit="MW"
            subtitle={overall.bias > 0 ? 'Over-forecasting tendency' : 'Under-forecasting tendency'}
            accent={overall.bias > 0 ? 'amber' : 'blue'}
            icon={<TrendingUp size={16} />}
            loading={isLoading}
          />
          <KPICard
            title="MAPE"
            value={overall.mape != null ? formatPercent(overall.mape) : '—'}
            subtitle="Mean Absolute % Error"
            accent="purple"
            icon={<BarChart3 size={16} />}
            loading={isLoading}
          />
          <KPICard
            title="Correlation (r)"
            value={overall.correlation != null ? formatNumber(overall.correlation, 3) : '—'}
            subtitle="Pearson coefficient"
            accent="green"
            icon={<CheckCircle size={16} />}
            loading={isLoading}
          />
        </div>

        {/* Analytics Tabs and Charts */}
        <div className="bg-[#1e293b] rounded-xl p-6 border border-slate-700/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-700 pb-4 mb-6">
            <div>
              <h3 className="text-white font-semibold text-base">Error Distribution & Patterns</h3>
              <p className="text-slate-400 text-xs mt-0.5">
                Investigate error behavior by time-of-day, daily trajectory, and outturn correlation
              </p>
            </div>

            <div className="flex items-center gap-1 bg-[#0f172a] p-1 rounded-lg border border-slate-700 text-xs">
              <button
                onClick={() => setActiveTab('hourly')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'hourly'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Diurnal (Hour-of-Day)
              </button>
              <button
                onClick={() => setActiveTab('timeline')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'timeline'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Daily Timeline
              </button>
              <button
                onClick={() => setActiveTab('scatter')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'scatter'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Forecast vs Actual Scatter
              </button>
            </div>
          </div>

          {isLoading ? (
            <SkeletonChart className="h-80" />
          ) : isError ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
              <AlertOctagon className="w-8 h-8 text-red-400" />
              <p>Failed to load accuracy metrics: {error?.message}</p>
            </div>
          ) : activeTab === 'hourly' ? (
            <div>
              <div className="mb-4 flex items-center justify-between text-xs text-slate-400">
                <span>Diurnal error profile across 24 UTC settlement hours</span>
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 bg-amber-500 rounded" /> MAE (MW)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 bg-red-500 rounded" /> RMSE (MW)
                  </span>
                </span>
              </div>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={byHour} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="hour"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickFormatter={(h) => `${h.toString().padStart(2, '0')}:00`}
                    axisLine={{ stroke: '#334155' }}
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickFormatter={(v) => `${v} MW`}
                    axisLine={false}
                    width={60}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-[#0f172a] border border-slate-600 rounded-xl px-4 py-3 shadow-2xl">
                          <p className="text-slate-400 text-xs font-semibold mb-1">
                            Hour {label.toString().padStart(2, '0')}:00 UTC
                          </p>
                          {payload.map((item) => (
                            <div key={item.dataKey} className="flex justify-between gap-4 text-xs py-0.5">
                              <span style={{ color: item.color }}>{item.name}:</span>
                              <span className="font-bold text-white">{Math.round(item.value)} MW</span>
                            </div>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="mae" name="MAE (MW)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="rmse" name="RMSE (MW)" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : activeTab === 'timeline' ? (
            <div>
              <div className="mb-4 text-xs text-slate-400">
                Daily MAE and Bias evolution across January 2026
              </div>
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={dailyTrend} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.5} />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `${v} MW`} width={60} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-[#0f172a] border border-slate-600 rounded-xl px-4 py-3 shadow-2xl">
                          <p className="text-slate-400 text-xs font-semibold mb-1">Date: {label}</p>
                          {payload.map((item) => (
                            <div key={item.dataKey} className="flex justify-between gap-4 text-xs py-0.5">
                              <span style={{ color: item.color }}>{item.name}:</span>
                              <span className="font-bold text-white">{item.value} MW</span>
                            </div>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Legend />
                  <ReferenceLine y={0} stroke="#64748b" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="MAE" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Bias" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div>
              <div className="mb-4 text-xs text-slate-400">
                Scatter alignment against 45° perfect prediction benchmark (Points above line = Over-forecast)
              </div>
              <ResponsiveContainer width="100%" height={340}>
                <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="actual"
                    type="number"
                    name="Actual"
                    unit=" MW"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    label={{ value: 'Actual Generation (MW)', position: 'insideBottom', offset: -5, fill: '#64748b', fontSize: 11 }}
                  />
                  <YAxis
                    dataKey="forecast"
                    type="number"
                    name="Forecast"
                    unit=" MW"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    label={{ value: 'Forecast Generation (MW)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[#0f172a] border border-slate-600 rounded-xl px-4 py-3 shadow-2xl text-xs">
                          <p className="text-slate-400 font-semibold mb-1">Settlement Pair</p>
                          <p className="text-emerald-400">Actual: {data.actual.toLocaleString()} MW</p>
                          <p className="text-blue-400">Forecast: {data.forecast.toLocaleString()} MW</p>
                          <p className={data.error > 0 ? 'text-amber-400' : 'text-cyan-400'}>
                            Error: {data.error > 0 ? `+${data.error}` : data.error} MW
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Scatter name="Delivery Slots" data={scatterData} fill="#3b82f6" opacity={0.6} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Actionable Decision-Maker Guidance for UK Day-Ahead Procurement Desk */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#1e293b] rounded-xl p-6 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              <h4 className="text-white font-semibold text-base">Quantified Procurement Buffer</h4>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed mb-4">
              When bidding in the UK Day-Ahead Auction (EPEX SPOT / Nord Pool UK at 11:00–12:00 UTC D-1), rely on the quantified uncertainty bounds:
            </p>
            <ul className="space-y-2.5 text-xs text-slate-300">
              <li className="flex items-start gap-2 bg-[#0f172a] p-3 rounded-lg border border-slate-800">
                <span className="w-2 h-2 rounded-full bg-amber-400 mt-1 flex-shrink-0" />
                <span>
                  <strong>Reserve Margin:</strong> Hold an operating thermal/flexible headroom buffer of at least{' '}
                  <strong className="text-amber-300 font-mono">{overall.mae ? Math.round(overall.mae) : 850} MW</strong>{' '}
                  to guard against unforecasted drops in wind outturn.
                </span>
              </li>
              <li className="flex items-start gap-2 bg-[#0f172a] p-3 rounded-lg border border-slate-800">
                <span className="w-2 h-2 rounded-full bg-red-400 mt-1 flex-shrink-0" />
                <span>
                  <strong>Extreme Volatility (RMSE):</strong> The RMSE of{' '}
                  <strong className="text-red-300 font-mono">{overall.rmse ? Math.round(overall.rmse) : 1100} MW</strong>{' '}
                  captures high-wind storm front tails. When meteorological fronts shift, avoid relying on single-point forecast estimates.
                </span>
              </li>
            </ul>
          </div>

          <div className="bg-[#1e293b] rounded-xl p-6 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-3">
              <HelpCircle className="w-5 h-5 text-blue-400" />
              <h4 className="text-white font-semibold text-base">Balancing Mechanism & Cash-out Exposure</h4>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed mb-4">
              Understanding the economic impact of forecast error under Elexon BSC settlement:
            </p>
            <div className="space-y-2.5 text-xs text-slate-300">
              <div className="bg-[#0f172a] p-3 rounded-lg border border-slate-800">
                <p className="font-semibold text-slate-200 mb-1">System Imbalance Price (Cash-out):</p>
                <p className="text-slate-400 leading-relaxed">
                  If wind is over-forecasted (positive bias), the utility is physically short in real-time. Short positions settle at the System Buy Price (SBP), which can spike to £300–£1,000+/MWh during peak grid stress.
                </p>
              </div>
              <div className="bg-[#0f172a] p-3 rounded-lg border border-slate-800">
                <p className="font-semibold text-slate-200 mb-1">Recommended Strategy:</p>
                <p className="text-slate-400 leading-relaxed">
                  Procure base thermal capacity in the Day-Ahead auction up to (Demand − [Forecast − Bias]). Adjust intra-day closer to delivery as WINDFOR updates roll in.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
