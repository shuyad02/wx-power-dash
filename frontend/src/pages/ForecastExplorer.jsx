import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  Calendar,
  Clock,
  Filter,
  Download,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Info,
  RefreshCw,
} from 'lucide-react';
import { fetchForecastEvolution, fetchActuals } from '../api/endpoints.js';
import KPICard from '../components/KPICard.jsx';
import LoadingSpinner, { SkeletonChart } from '../components/LoadingSpinner.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import { formatMW, formatNumber, formatDateTime, formatHalfHourLabel } from '../utils/formatters.js';

/* Palette for multiple forecast publish runs */
const LINE_COLORS = [
  '#3b82f6', // primary bright blue
  '#06b6d4', // cyan
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#f97316', // orange
  '#eab308', // yellow
];

export default function ForecastExplorer() {
  const [selectedDate, setSelectedDate] = useState('2026-01-15');
  const [filterThreshold, setFilterThreshold] = useState('all');

  // Query forecast evolution for selected delivery date
  const {
    data: evolutionData,
    isLoading: isEvolutionLoading,
    isError: isEvolutionError,
    error: evolutionErr,
    refetch: refetchEvolution,
  } = useQuery({
    queryKey: ['forecastEvolution', selectedDate],
    queryFn: () => fetchForecastEvolution(selectedDate),
    retry: 2,
  });

  // Query actuals for the same day
  const {
    data: actualsData,
    isLoading: isActualsLoading,
  } = useQuery({
    queryKey: ['actuals', selectedDate],
    queryFn: () => fetchActuals(selectedDate, selectedDate),
    retry: 2,
  });

  // Process and merge data for the multi-line chart
  const { chartData, publishRuns, tableData, summaryStats } = useMemo(() => {
    // 1. Process actuals lookup by startTime
    const actualsMap = new Map();
    if (Array.isArray(actualsData)) {
      actualsData.forEach((item) => {
        const timeKey = item.startTime;
        actualsMap.set(timeKey, item.generation);
      });
    }

    // 2. Process evolution groups
    // evolutionData is list of ForecastEvolutionGroup { publishTime, forecasts: [ { startTime, generation } ] }
    const runs = [];
    const timeSlotsMap = new Map();

    if (Array.isArray(evolutionData)) {
      evolutionData.forEach((group, idx) => {
        const pTime = group.publishTime;
        const pLabel = formatDateTime(pTime, 'time') + ' Run';
        const key = `run_${idx}`;
        runs.push({
          key,
          label: pLabel,
          publishTime: pTime,
          color: LINE_COLORS[idx % LINE_COLORS.length],
        });

        if (Array.isArray(group.forecasts)) {
          group.forecasts.forEach((f) => {
            const slotKey = f.startTime;
            if (!timeSlotsMap.has(slotKey)) {
              timeSlotsMap.set(slotKey, {
                startTime: slotKey,
                label: formatHalfHourLabel(slotKey),
              });
            }
            timeSlotsMap.get(slotKey)[key] = Math.round(f.generation);
          });
        }
      });
    }

    // Also inject actuals into slots
    for (const [slotKey, actualGen] of actualsMap.entries()) {
      if (!timeSlotsMap.has(slotKey)) {
        timeSlotsMap.set(slotKey, {
          startTime: slotKey,
          label: formatHalfHourLabel(slotKey),
        });
      }
      timeSlotsMap.get(slotKey).Actual = Math.round(actualGen);
    }

    // Convert map to sorted list
    const sortedSlots = Array.from(timeSlotsMap.values()).sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    // Build tabular breakdown with DA decision forecast (first run or closest to D-1 12:00)
    const primaryRunKey = runs.length > 0 ? runs[0].key : null;
    const tableRows = [];
    let sumAbsErr = 0;
    let countErr = 0;
    let peakActual = 0;
    let peakForecast = 0;

    sortedSlots.forEach((slot, index) => {
      const actual = slot.Actual ?? null;
      const forecast = primaryRunKey ? (slot[primaryRunKey] ?? null) : null;
      const error = forecast != null && actual != null ? forecast - actual : null;
      const absError = error != null ? Math.abs(error) : null;
      const errorPct = actual && actual > 0 && error != null ? (absError / actual) * 100 : null;

      if (actual != null && actual > peakActual) peakActual = actual;
      if (forecast != null && forecast > peakForecast) peakForecast = forecast;
      if (absError != null) {
        sumAbsErr += absError;
        countErr += 1;
      }

      tableRows.push({
        period: index + 1,
        time: slot.label,
        startTime: slot.startTime,
        actual,
        forecast,
        error,
        absError,
        errorPct,
      });
    });

    const dayMae = countErr > 0 ? sumAbsErr / countErr : null;

    return {
      chartData: sortedSlots,
      publishRuns: runs,
      tableData: tableRows,
      summaryStats: {
        peakActual,
        peakForecast,
        dayMae,
        countSlots: sortedSlots.length,
      },
    };
  }, [evolutionData, actualsData]);

  // Filter table data
  const filteredTable = useMemo(() => {
    if (filterThreshold === 'large') {
      return tableData.filter((r) => r.errorPct != null && r.errorPct > 15);
    }
    if (filterThreshold === 'medium') {
      return tableData.filter((r) => r.errorPct != null && r.errorPct >= 5 && r.errorPct <= 15);
    }
    if (filterThreshold === 'small') {
      return tableData.filter((r) => r.errorPct != null && r.errorPct < 5);
    }
    return tableData;
  }, [tableData, filterThreshold]);

  // Export CSV
  const handleExportCSV = () => {
    if (!filteredTable.length) return;
    const headers = ['Period,Time,Actual (MW),Decision Forecast (MW),Error (MW),Abs Error (MW),Error (%)'];
    const rows = filteredTable.map((r) =>
      [
        r.period,
        r.time,
        r.actual ?? '',
        r.forecast ?? '',
        r.error ?? '',
        r.absError ?? '',
        r.errorPct ? r.errorPct.toFixed(1) + '%' : '',
      ].join(',')
    );
    const blob = new Blob([[headers, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wind_forecast_vs_actual_${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        {/* Header and Date Selector */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#1e293b] p-5 rounded-xl border border-slate-700/50">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              Forecast Explorer & Evolution
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Analyse forecast revisions across publish windows for day-ahead market procurement
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-[#0f172a] px-3 py-2 rounded-lg border border-slate-700">
              <Calendar className="w-4 h-4 text-blue-400" />
              <label htmlFor="delivery-date-input" className="text-slate-400 text-xs font-medium">Delivery Date:</label>
              <input
                id="delivery-date-input"
                type="date"
                min="2026-01-01"
                max="2026-01-31"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-white text-sm font-semibold focus:outline-none cursor-pointer"
              />
            </div>

            <button
              onClick={() => refetchEvolution()}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Daily KPI summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Daily Mean Absolute Error"
            value={summaryStats.dayMae != null ? `${formatNumber(summaryStats.dayMae, 0)}` : '—'}
            unit="MW"
            subtitle="Average procurement risk"
            accent="amber"
            icon={<AlertTriangle size={16} />}
            loading={isEvolutionLoading || isActualsLoading}
          />
          <KPICard
            title="Actual Peak Generation"
            value={summaryStats.peakActual > 0 ? formatMW(summaryStats.peakActual) : '—'}
            subtitle="Highest 30-min outturn"
            accent="green"
            icon={<TrendingUp size={16} />}
            loading={isActualsLoading}
          />
          <KPICard
            title="Forecast Peak Generation"
            value={summaryStats.peakForecast > 0 ? formatMW(summaryStats.peakForecast) : '—'}
            subtitle="Highest predicted outturn"
            accent="blue"
            icon={<TrendingDown size={16} />}
            loading={isEvolutionLoading}
          />
          <KPICard
            title="Settlement Periods"
            value={summaryStats.countSlots || 48}
            unit="slots"
            subtitle="30-min delivery resolution"
            accent="purple"
            icon={<Clock size={16} />}
            loading={isEvolutionLoading}
          />
        </div>

        {/* Multi-line Evolution Chart */}
        <div className="bg-[#1e293b] rounded-xl p-6 border border-slate-700/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <h3 className="text-white font-semibold text-base flex items-center gap-2">
                Forecast Evolution & Outturn Comparison
              </h3>
              <p className="text-slate-400 text-xs mt-0.5">
                Shows how wind predictions shifted closer to delivery vs final actual generation (in green)
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <span className="w-3 h-1 bg-emerald-400 rounded-full" /> Actual Outturn
              </span>
              <span className="flex items-center gap-1.5 text-blue-400 font-medium">
                <span className="w-3 h-1 bg-blue-400 rounded-full" /> Day-Ahead Decision Forecast
              </span>
            </div>
          </div>

          {isEvolutionLoading ? (
            <SkeletonChart className="h-80" />
          ) : isEvolutionError ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
              <AlertTriangle className="w-8 h-8 text-amber-400" />
              <p>Failed to load forecast evolution: {evolutionErr?.message}</p>
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-500">
              No forecast or actual data recorded for {selectedDate}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.5} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={{ stroke: '#334155' }}
                  tickLine={false}
                  interval={3}
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
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-[#0f172a] border border-slate-600 rounded-xl px-4 py-3 shadow-2xl min-w-[200px]">
                        <p className="text-slate-400 text-xs font-semibold mb-2 border-b border-slate-700 pb-1">
                          Delivery: {label}
                        </p>
                        {payload.map((item) => (
                          <div key={item.dataKey} className="flex items-center justify-between gap-4 py-0.5">
                            <span className="text-xs" style={{ color: item.color }}>
                              {item.name}:
                            </span>
                            <span className="text-xs font-bold text-white">
                              {item.value != null ? `${Number(item.value).toLocaleString()} MW` : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: 10 }}
                  formatter={(value) => <span className="text-xs text-slate-300">{value}</span>}
                />

                {/* Actual Line */}
                <Line
                  type="monotone"
                  dataKey="Actual"
                  name="Actual Outturn (FUELHH)"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ r: 2, fill: '#10b981' }}
                  activeDot={{ r: 6, fill: '#10b981' }}
                  connectNulls
                />

                {/* Individual Forecast Runs */}
                {publishRuns.map((run, i) => (
                  <Line
                    key={run.key}
                    type="monotone"
                    dataKey={run.key}
                    name={i === 0 ? 'Day-Ahead Auction Cutoff' : run.label}
                    stroke={run.color}
                    strokeWidth={i === 0 ? 2.5 : 1.5}
                    strokeDasharray={i === 0 ? undefined : '4 4'}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Detailed Half-Hourly Procurement Breakdown Table */}
        <div className="bg-[#1e293b] rounded-xl p-6 border border-slate-700/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-white font-semibold text-base">
                Half-Hourly Settlement Period Schedule (HH 1–48)
              </h3>
              <p className="text-slate-400 text-xs mt-0.5">
                Quantified variance for scheduling thermal plant procurement vs actual wind contribution
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Filter */}
              <div className="flex items-center gap-1.5 bg-[#0f172a] px-3 py-1.5 rounded-lg border border-slate-700 text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400">Deviation:</span>
                <select
                  value={filterThreshold}
                  onChange={(e) => setFilterThreshold(e.target.value)}
                  className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
                >
                  <option value="all" className="bg-[#1e293b]">All Periods</option>
                  <option value="large" className="bg-[#1e293b]">High Error (&gt; 15%)</option>
                  <option value="medium" className="bg-[#1e293b]">Moderate (5% - 15%)</option>
                  <option value="small" className="bg-[#1e293b]">Accurate (&lt; 5%)</option>
                </select>
              </div>

              {/* Export CSV button */}
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0f172a]/70 text-slate-400 text-xs uppercase font-semibold border-b border-slate-700">
                <tr>
                  <th className="py-3 px-4">Period</th>
                  <th className="py-3 px-4">Target Time (UTC)</th>
                  <th className="py-3 px-4 text-right">Actual Wind (MW)</th>
                  <th className="py-3 px-4 text-right">DA Forecast (MW)</th>
                  <th className="py-3 px-4 text-right">Procurement Delta</th>
                  <th className="py-3 px-4 text-center">Trading Action / Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredTable.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No settlement records match the current filter.
                    </td>
                  </tr>
                ) : (
                  filteredTable.map((row) => {
                    const isOver = row.error != null && row.error > 0;
                    const isSevere = row.errorPct != null && row.errorPct > 15;
                    const isModerate = row.errorPct != null && row.errorPct >= 5 && row.errorPct <= 15;

                    return (
                      <tr key={row.period} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-400 text-xs">
                          HH {row.period}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-200">
                          {row.time}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-400 font-semibold">
                          {row.actual != null ? `${row.actual.toLocaleString()} MW` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-blue-400 font-semibold">
                          {row.forecast != null ? `${row.forecast.toLocaleString()} MW` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {row.error != null ? (
                            <span
                              className={`font-semibold ${
                                isOver ? 'text-amber-400' : 'text-cyan-400'
                              }`}
                            >
                              {row.error > 0 ? `+${row.error.toLocaleString()}` : row.error.toLocaleString()} MW
                              {row.errorPct != null && (
                                <span className="text-xs text-slate-500 block">
                                  ({row.errorPct.toFixed(1)}%)
                                </span>
                              )}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {row.error == null ? (
                            <span className="text-slate-500 text-xs">Awaiting data</span>
                          ) : isOver ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              <AlertTriangle className="w-3 h-3" />
                              Undergeneration Risk (Procure {Math.round(row.error)} MW Thermal)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                              <CheckCircle2 className="w-3 h-3" />
                              Surplus Wind Generation ({Math.round(Math.abs(row.error))} MW)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
