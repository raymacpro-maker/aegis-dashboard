'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Truck, Camera, Anchor, Newspaper, X, Maximize2, Minimize2,
} from 'lucide-react';
import EmergencyCCTV from './EmergencyCCTV';
import MaritimeOverview from './MaritimeOverview';
import GlobalIncidents from './GlobalIncidents';

type Tab = 'fleet' | 'cctv' | 'maritime' | 'global';

const TABS: Array<{ key: Tab; label: string; icon: React.ReactNode; color: string }> = [
  { key: 'fleet',   label: 'Fleet',     icon: <Truck className="w-3.5 h-3.5" />,       color: 'text-amber-400' },
  { key: 'cctv',    label: 'CCTV',      icon: <Camera className="w-3.5 h-3.5" />,      color: 'text-cyan-400' },
  { key: 'maritime',label: 'Maritime',  icon: <Anchor className="w-3.5 h-3.5" />,      color: 'text-blue-400' },
  { key: 'global',  label: 'Global',    icon: <Newspaper className="w-3.5 h-3.5" />,   color: 'text-emerald-400' },
];

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
            className={`w-9 h-9 rounded-lg border bg-[#0a0e1a]/92 backdrop-blur-md flex items-center justify-center transition ${
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
          className="w-9 h-9 rounded-lg border border-slate-700 bg-[#0a0e1a]/92 backdrop-blur-md flex items-center justify-center hover:border-amber-500/50 transition"
          title="Expand panel"
        >
          <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-4 right-4 z-20 w-80 max-h-[calc(100vh-140px)] flex flex-col rounded-lg border border-slate-700/80 bg-[#0a0e1a]/95 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.6)] overflow-hidden">
      {/* Tab strip */}
      <div className="flex items-center border-b border-slate-800 bg-slate-900/60">
        {TABS.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-[10px] uppercase tracking-widest font-bold transition border-b-2 ${
                isActive
                  ? `${t.color} border-current bg-slate-900/80`
                  : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-900/40'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setCollapsed(true)}
          className="px-2 py-2.5 text-slate-500 hover:text-amber-300 transition border-b-2 border-transparent"
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
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}