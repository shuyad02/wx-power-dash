import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

/**
 * KPI Card component for displaying key performance indicators.
 * @param {Object} props
 * @param {string} props.title - Card title
 * @param {string|number} props.value - Main metric value
 * @param {string} props.unit - Unit label
 * @param {string} props.subtitle - Secondary text
 * @param {'up'|'down'|'neutral'} props.trend - Trend direction
 * @param {string} props.trendLabel - Trend description text
 * @param {React.ReactNode} props.icon - Icon element
 * @param {'blue'|'green'|'amber'|'red'|'purple'} props.accent - Accent color theme
 * @param {boolean} props.loading - Loading state
 */
export default function KPICard({
  title,
  value,
  unit,
  subtitle,
  trend,
  trendLabel,
  icon,
  accent = 'blue',
  loading = false,
}) {
  const accentMap = {
    blue: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      icon: 'text-blue-400',
      value: 'text-blue-300',
      trend: { up: 'text-blue-400', down: 'text-blue-400', neutral: 'text-slate-400' },
    },
    green: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      icon: 'text-emerald-400',
      value: 'text-emerald-300',
      trend: { up: 'text-emerald-400', down: 'text-red-400', neutral: 'text-slate-400' },
    },
    amber: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      icon: 'text-amber-400',
      value: 'text-amber-300',
      trend: { up: 'text-emerald-400', down: 'text-red-400', neutral: 'text-slate-400' },
    },
    red: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      icon: 'text-red-400',
      value: 'text-red-300',
      trend: { up: 'text-red-400', down: 'text-emerald-400', neutral: 'text-slate-400' },
    },
    purple: {
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
      icon: 'text-purple-400',
      value: 'text-purple-300',
      trend: { up: 'text-emerald-400', down: 'text-red-400', neutral: 'text-slate-400' },
    },
  };

  const colors = accentMap[accent] || accentMap.blue;

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend ? colors.trend[trend] : colors.trend.neutral;

  if (loading) {
    return (
      <div className="bg-[#1e293b] rounded-xl p-5 border border-slate-700/50 animate-pulse">
        <div className="h-4 bg-slate-700 rounded w-2/3 mb-3" />
        <div className="h-8 bg-slate-700 rounded w-1/2 mb-2" />
        <div className="h-3 bg-slate-700 rounded w-1/3" />
      </div>
    );
  }

  return (
    <div
      className={`relative bg-[#1e293b] rounded-xl p-5 border ${colors.border} hover:border-opacity-40 transition-all duration-200 group overflow-hidden`}
    >
      {/* Background glow */}
      <div className={`absolute inset-0 ${colors.bg} opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl`} />

      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <p className="text-slate-400 text-sm font-medium">{title}</p>
          {icon && (
            <div className={`p-2 rounded-lg ${colors.bg}`}>
              <span className={colors.icon}>{icon}</span>
            </div>
          )}
        </div>

        <div className="flex items-baseline gap-2 mb-1">
          <span className={`text-2xl font-bold ${colors.value}`}>{value ?? '—'}</span>
          {unit && <span className="text-slate-400 text-sm">{unit}</span>}
        </div>

        {(subtitle || trendLabel) && (
          <div className="flex items-center gap-1 mt-2">
            {trend && trendLabel && (
              <>
                <TrendIcon className={`w-3.5 h-3.5 ${trendColor}`} />
                <span className={`text-xs ${trendColor}`}>{trendLabel}</span>
              </>
            )}
            {subtitle && !trendLabel && (
              <span className="text-xs text-slate-500">{subtitle}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
