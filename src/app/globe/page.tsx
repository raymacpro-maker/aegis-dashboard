'use client';

import dynamic from 'next/dynamic';
import { ArrowLeft } from 'lucide-react';
import AegisLogo from '@/components/AegisLogo';

const Globe2D = dynamic(() => import('@/components/Globe2D'), { ssr: false });

export default function GlobePage() {
  return (
    <div className="h-screen w-screen bg-[#04040A] text-slate-100 flex flex-col overflow-hidden">
      <header className="border-b border-amber-500/20 bg-[#0a0e1a]/95 backdrop-blur px-6 py-3 flex items-center justify-between z-30 flex-shrink-0">
        <div className="flex items-center gap-4">
          <a href="/dashboard" className="flex items-center gap-1.5 text-slate-400 hover:text-amber-300 text-xs transition">
            <ArrowLeft className="w-3.5 h-3.5" /> Command Center
          </a>
          <AegisLogo size="sm" />
          <span className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-bold">
            · Intel Globe
          </span>
        </div>
        <div className="text-[10px] text-slate-500">
          Live · 10s refresh
        </div>
      </header>
      <div className="flex-1 relative">
        <Globe2D />
      </div>
    </div>
  );
}
