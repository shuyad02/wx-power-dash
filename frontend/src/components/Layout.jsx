import { NavLink, useLocation } from 'react-router-dom';
import { Wind, LayoutDashboard, LineChart, BarChart3, ExternalLink } from 'lucide-react';

const navItems = [
  {
    to: '/',
    label: 'Dashboard',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    to: '/forecasts',
    label: 'Forecast Explorer',
    icon: LineChart,
    exact: false,
  },
  {
    to: '/accuracy',
    label: 'Accuracy Analysis',
    icon: BarChart3,
    exact: false,
  },
];

export default function Layout({ children }) {
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-[#0f172a]">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-[#1e293b] border-r border-slate-700/50 flex flex-col z-30 shadow-2xl">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/30">
              <Wind className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-white font-bold text-xl tracking-tight">WindWatch</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-400 text-xs font-medium">Live</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider px-3 mb-3">
            Navigation
          </p>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
                  ${isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50 border border-transparent'
                  }
                `}
              >
                <Icon
                  className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-500'}`}
                  size={18}
                />
                {item.label}
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Sidebar footer */}
        <div className="px-4 py-4 border-t border-slate-700/50">
          <div className="bg-slate-800/60 rounded-lg p-3">
            <p className="text-slate-500 text-xs mb-1 font-medium">Data Source</p>
            <a
              href="https://bmrs.elexon.co.uk"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors"
            >
              <span>Elexon BMRS</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <p className="text-slate-600 text-xs mt-2">January 2026 · GB Wind</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64 min-h-screen flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-[#0f172a]/80 backdrop-blur-sm border-b border-slate-700/50 px-8 py-3.5 flex items-center justify-between">
          <div>
            {navItems.map((item) => {
              const isActive = item.exact
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to);
              if (!isActive) return null;
              return (
                <div key={item.to}>
                  <h1 className="text-white font-semibold text-lg">{item.label}</h1>
                  <p className="text-slate-400 text-xs">UK Wind Energy Forecast Analytics</p>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-[#1e293b] px-3 py-1.5 rounded-lg border border-slate-700/50">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300 text-xs font-medium">Jan 2026 Data</span>
            </div>
            <div className="flex items-center gap-2 bg-[#1e293b] px-3 py-1.5 rounded-lg border border-slate-700/50">
              <span className="text-slate-400 text-xs">GB Grid</span>
              <span className="text-white text-xs font-semibold">50 Hz</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
