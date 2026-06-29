'use client';

import { ShieldCheck } from 'lucide-react';

type Props = {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
};

/**
 * Aegis Logo
 * - Custom SVG shield (public/aegis-shield.svg) for the real brand mark
 * - Wordmark in the Aegis Amber font weight
 * - Sizes: sm (32px), md (48px), lg (72px), xl (120px)
 */
export default function AegisLogo({ size = 'md', showWordmark = true }: Props) {
  const dim = { sm: 32, md: 48, lg: 72, xl: 120 }[size];
  const wordSize = { sm: 'text-base', md: 'text-xl', lg: 'text-3xl', xl: 'text-5xl' }[size];
  const taglineSize = { sm: 'text-[8px]', md: 'text-[10px]', lg: 'text-xs', xl: 'text-sm' }[size];

  return (
    <div className="flex items-center gap-3">
      <div
        className="relative flex items-center justify-center"
        style={{ width: dim, height: dim }}
      >
        <img
          src="/aegis-shield.svg"
          alt="Aegis"
          width={dim}
          height={dim}
          className="drop-shadow-[0_0_12px_rgba(251,191,36,0.35)]"
        />
      </div>
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span className={`font-black tracking-[0.18em] text-amber-400 ${wordSize}`}>
            AEGIS
          </span>
          <span className={`uppercase tracking-[0.32em] text-slate-500 mt-1.5 ${taglineSize}`}>
            Fleet Operations Command
          </span>
        </div>
      )}
    </div>
  );
}
