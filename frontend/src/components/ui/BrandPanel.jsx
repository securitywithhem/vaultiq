import React from 'react';

const ShieldCheckIcon = () => (
  <svg
    className="w-3.5 h-3.5 text-emerald-400"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
    />
  </svg>
);

const STATS = [
  { label: 'Encrypted Files', value: '12,347', mono: true,      accent: false },
  { label: 'Security Level',  value: 'AES-256', mono: false,     accent: true  },
  { label: 'Uptime',          value: '99.99%',  mono: true,      accent: false },
  { label: 'Avg. Scan Time',  value: '< 1.2s',  mono: true,      accent: false },
];

/**
 * BrandPanel — the dark right-side panel shared by Login & Signup.
 */
const BrandPanel = () => (
  <div className="relative w-full h-full min-h-[52vh] lg:min-h-0 bg-[#040D07] overflow-hidden flex items-center justify-center px-8 py-16 lg:px-14">

    {/* ── Ambient glow blobs ─────────────────────────────────────────────── */}
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -top-[20%] -right-[15%] w-[650px] h-[650px] rounded-full bg-emerald-500/[0.11] blur-[150px]"
    />
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-[20%] -left-[15%] w-[550px] h-[550px] rounded-full bg-teal-600/[0.09] blur-[130px]"
    />
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-[40%] left-[35%] w-[280px] h-[280px] rounded-full bg-emerald-400/[0.07] blur-[90px]"
    />

    {/* ── Content ───────────────────────────────────────────────────────── */}
    <div className="relative z-10 w-full max-w-[420px] animate-fade-up">

      {/* Big mixed-weight headline */}
      <div className="mb-12 leading-none space-y-[0.08em]" aria-label="Enter the Future of Secure Storage, today.">
        <p className="text-3xl lg:text-5xl xl:text-6xl font-extralight text-white/25 tracking-tighter">
          Enter the
        </p>
        <p className="text-3xl lg:text-5xl xl:text-6xl font-black text-white tracking-tighter">
          Future
        </p>
        <p className="text-3xl lg:text-5xl xl:text-6xl font-extralight text-white/25 tracking-tighter">
          of Secure
        </p>
        <p className="text-3xl lg:text-5xl xl:text-6xl font-extralight text-white/25 tracking-tighter">
          Storage,
        </p>
        <p className="text-3xl lg:text-5xl xl:text-6xl font-light text-emerald-400 tracking-tighter italic">
          today.
        </p>
      </div>

      {/* ── Glassmorphism stats card ─────────────────────────────────────── */}
      <div className="backdrop-blur-2xl bg-white/[0.04] border border-white/[0.07] rounded-2xl p-6">

        {/* Card header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <ShieldCheckIcon />
            </div>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">
              Vault Status
            </span>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="text-xs text-emerald-400 font-medium">Live</span>
          </div>
        </div>

        {/* Stat rows */}
        <div className="space-y-3">
          {STATS.map(({ label, value, mono, accent }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-xs text-white/30">{label}</span>
              <span
                className={[
                  'text-xs tabular-nums',
                  mono   ? 'font-mono'   : 'font-semibold',
                  accent ? 'text-emerald-400' : 'text-white/75',
                ].join(' ')}
              >
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Storage bar */}
        <div className="mt-5 pt-4 border-t border-white/[0.06]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-white/25">Storage utilization</span>
            <span className="text-xs text-white/45 font-mono tabular-nums">82%</span>
          </div>
          <div className="h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-700 via-emerald-500 to-emerald-400"
              style={{ width: '82%' }}
            />
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default BrandPanel;
