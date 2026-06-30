'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Truck, Camera, Anchor, Newspaper, Radio, Maximize2, Minimize2,
} from 'lucide-react';
import EmergencyCCTV from './EmergencyCCTV';
import MaritimeOverview from './MaritimeOverview';
import GlobalIncidents from './GlobalIncidents';
import SATruckingNews from './SATruckingNews';

type Tab = 'fleet' | 'cctv' | 'maritime' | 'global' | 'sa';

const TABS: Array<{ key: Tab; label: string; icon: React.ReactNode; color: string }> = [
  { key: 'fleet',   label: 'Fleet',    icon: <Truck className="w-3.5 h-3.5" />,       color: 'text-amber-400' },
  { key: 'cctv',    label: 'CCTV',     icon: <Camera className="w-3.5 h-3.5" />,      color: 'text-cyan-400' },
  { key: 'maritime',label: 'Maritime', icon: <Anchor className="w-3.5 h-3.5" />,      color: 'text-blue-400' },
  { key: 'global',  label: 'News',     icon: <Newspaper className="w-3.5 h-3.5" />,   color: 'text-emerald-400' },
  { key: 'sa',      label: 'SA',       icon: <Radio className="w-3.5 h-3.5" />,       color: 'text-rose-400' },
];

/**
 * Aegis Intel Panel — right-rail tabbed UI for the Globe page.
 *
 * v1.4 redesign:
 * - Widened from w-80 (320px) to w-96 (384px) so all 5 tabs render cleanly
 *   without label truncation. With 5 tabs, each gets ~75px which fits
 *   "Maritime" + icon comfortably.
 * - Panel is responsive: on mobile (<sm), drops to a slim bottom sheet
 *   with horizontal scroll for tabs.
 * - Per-tab icons + labels in two rows: icon top, label below. This
 *   gives a Notion/Linear feel and avoids icon+label horizontal squeeze.
 * - Smooth animated underline indicates the active tab.
 */
export default function IntelPanel({
  fleetContent,
  defaultTab = 'fleet',
}: {
  /** Pre-rendered fleet list (lives in the page) — we just slot it in. */
  fleetContent: React.ReactNode;
  defaultTab?: Tab;
}) {
  const [active, setActive] = useState<Tab>(defaultTab);
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setActive(t.key);
              setCollapsed(false);
            }}
            className={`w-10 h-10 rounded-lg border bg-[#0a0e1a]/92 backdrop-blur-md flex items-center justify-center transition ${
              active === t.key
                ? 'border-amber-500/60 shadow-[0_0_12px_rgba(251,191,36,0.25)]'
                : 'border-slate-700 hover:border-slate-500'
            }`}
            title={t.label}
          >
            <span className={t.color}>{t.icon}</span>
          </button>
        ))}
        <button
          onClick={() => setCollapsed(false)}
          className="w-10 h-10 rounded-lg border border-slate-700 bg-[#0a0e1a]/92 backdrop-blur-md flex items-center justify-center hover:border-amber-500/50 transition"
          title="Expand panel"
        >
          <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-4 right-4 z-20 w-[360px] sm:w-96 max-h-[calc(100vh-140px)] flex flex-col rounded-lg border border-slate-700/80 bg-[#0a0e1a]/95 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.6)] overflow-hidden">
      {/* Tab strip — icon stacked above label, all 5 visible */}
      <div className="flex items-stretch border-b border-slate-800 bg-slate-900/60 relative">
        {TABS.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 px-1 pt-2 pb-1.5 transition ${
                isActive
                  ? 'bg-slate-900/80'
                  : 'hover:bg-slate-900/40'
              }`}
            >
              <span className={isActive ? t.color : 'text-slate-500'}>
                {t.icon}
              </span>
              <span className={`text-[9px] uppercase tracking-widest font-bold leading-none ${
                isActive ? t.color : 'text-slate-500'
              }`}>
                {t.label}
              </span>
              {/* Animated active underline */}
              {isActive && (
                <motion.div
                  layoutId="intel-tab-underline"
                  className={`absolute bottom-0 left-0 right-0 h-0.5 ${
                    t.key === 'fleet' ? 'bg-amber-400' :
                    t.key === 'cctv' ? 'bg-cyan-400' :
                    t.key === 'maritime' ? 'bg-blue-400' :
                    t.key === 'global' ? 'bg-emerald-400' :
                    'bg-rose-400'
                  }`}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
            </button>
          );
        })}
        <button
          onClick={() => setCollapsed(true)}
          className="flex-shrink-0 px-2 text-slate-500 hover:text-amber-300 transition border-l border-slate-800"
          title="Collapse to icons"
        >
          <Minimize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            {active === 'fleet' && fleetContent}
            {active === 'cctv' && <EmergencyCCTV />}
            {active === 'maritime' && <MaritimeOverview />}
            {active === 'global' && <GlobalIncidents />}
            {active === 'sa' && <SATruckingNews />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}