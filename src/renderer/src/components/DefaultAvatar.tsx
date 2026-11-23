import type { CSSProperties } from 'react';

const BACKGROUNDS = [
  '#D97757', '#668C84', '#7D779D', '#B38A5A', '#647F9B', '#B56D75',
  '#6F9072', '#8D7A64', '#668B8F', '#9A758F', '#8C9462', '#6C7B9A'
];

const MOTIFS = [
  <g key="constellation"><path d="M10 17 22 9 37 18 29 37 12 34 10 17Z M22 9 24 25 37 18 M24 25 12 34 M24 25 29 37" /><circle cx="10" cy="17" r="2.6" /><circle cx="22" cy="9" r="2.6" /><circle cx="37" cy="18" r="2.6" /><circle cx="29" cy="37" r="2.6" /><circle cx="12" cy="34" r="2.6" /></g>,
  <g key="branch"><path d="M24 40V9 M24 17 12 11 M24 25 37 18 M24 32 12 29" /><circle cx="24" cy="9" r="3" /><circle cx="12" cy="11" r="3" /><circle cx="37" cy="18" r="3" /><circle cx="12" cy="29" r="3" /></g>,
  <g key="grid"><path d="m24 6 17 18-17 18L7 24 24 6Z M7 24h34 M24 6v36 M14 14l20 20 M34 14 14 34" /><circle cx="24" cy="24" r="4" /></g>,
  <g key="orbit"><ellipse cx="24" cy="24" rx="17" ry="8" transform="rotate(-35 24 24)" /><ellipse cx="24" cy="24" rx="17" ry="8" transform="rotate(55 24 24)" /><circle cx="24" cy="24" r="4" /><circle cx="38" cy="14" r="2.5" /></g>,
  <g key="crystal"><path d="m24 6 14 12-5 21H15l-5-21L24 6Z M10 18h28 M24 6v33 M10 18l14 8 14-8 M15 39l9-13 9 13" /></g>,
  <g key="circuit"><path d="M9 13h10v10h10V11h10 M9 35h10V25h10v12h10" /><circle cx="9" cy="13" r="2.5" /><circle cx="39" cy="11" r="2.5" /><circle cx="9" cy="35" r="2.5" /><circle cx="39" cy="37" r="2.5" /></g>,
  <g key="hex"><path d="m24 7 15 8v18l-15 8-15-8V15l15-8Z M9 15l15 9 15-9 M24 24v17 M9 33l15-9 15 9" /><circle cx="24" cy="24" r="3" /></g>,
  <g key="wave"><path d="M7 27c6-18 10-18 17 0s11 18 17 0 M7 17c6-12 10-12 17 0s11 12 17 0 M7 37c6-12 10-12 17 0s11 12 17 0" /><circle cx="24" cy="27" r="3" /></g>,
  <g key="radial"><circle cx="24" cy="24" r="6" /><circle cx="24" cy="24" r="16" /><path d="M24 8V4 M24 44v-4 M8 24H4 M44 24h-4 M12.7 12.7l-3-3 M38.3 38.3l-3-3 M35.3 12.7l3-3 M9.7 38.3l3-3" /></g>,
  <g key="matrix"><rect x="9" y="9" width="12" height="12" rx="3" /><rect x="27" y="9" width="12" height="12" rx="3" /><rect x="9" y="27" width="12" height="12" rx="3" /><rect x="27" y="27" width="12" height="12" rx="3" /><path d="M21 15h6 M15 21v6 M33 21v6 M21 33h6" /></g>,
  <g key="nodes"><path d="M12 12 24 24 36 12 M12 36 24 24 36 36 M12 12v24 M36 12v24" /><circle cx="12" cy="12" r="3" /><circle cx="36" cy="12" r="3" /><circle cx="12" cy="36" r="3" /><circle cx="36" cy="36" r="3" /><circle cx="24" cy="24" r="4" /></g>,
  <g key="link"><path d="M17 15h-3a8 8 0 0 0 0 16h7 M31 33h3a8 8 0 0 0 0-16h-7 M16 24h16" /><circle cx="16" cy="15" r="2.5" /><circle cx="32" cy="33" r="2.5" /></g>
];

export function DefaultAvatar({ preset = 0, size = 36 }: { preset?: number | null; size?: number }) {
  const index = Number.isInteger(preset) ? Math.abs(Number(preset)) % MOTIFS.length : 0;
  const style: CSSProperties = { width: size, height: size, minWidth: size, background: BACKGROUNDS[index] };
  return <span className="nexo-default-avatar" style={style} aria-hidden="true">
    <svg viewBox="0 0 48 48" width={size * .78} height={size * .78} fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {MOTIFS[index]}
    </svg>
  </span>;
}
