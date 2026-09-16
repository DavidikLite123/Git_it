import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 20, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...rest,
  }
}

export const Logo = ({ size = 28, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })} strokeWidth={2}>
    <path d="M7 18.5V11a5 5 0 0 1 5-5h4.5" />
    <path d="M16.5 3.5v5M14 6h5" />
    <circle cx="7" cy="20.5" r="2" />
  </svg>
)

export const GitHubMark = ({ size = 20, ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden {...rest}>
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
)

export const UploadCloud = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })}>
    <path d="M12 16V8m0 0-3.2 3.2M12 8l3.2 3.2" />
    <path d="M6.5 18a4.5 4.5 0 0 1-.5-8.97 6 6 0 0 1 11.7 1.6A3.9 3.9 0 0 1 17.6 18" />
  </svg>
)

export const Folder = ({ size = 18, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })}>
    <path d="M3 7.5A2 2 0 0 1 5 5.5h3.6a2 2 0 0 1 1.6.8l.8 1.1H19a2 2 0 0 1 2 2v6.1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </svg>
)

export const FileIcon = ({ size = 18, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5" />
  </svg>
)

export const Check = ({ size = 20, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })} strokeWidth={2.4}>
    <path d="m4.5 12.5 5 5 10-11" />
  </svg>
)

export const Close = ({ size = 20, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })} strokeWidth={2.2}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const Alert = ({ size = 20, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })}>
    <path d="M12 4 2.8 20h18.4L12 4Z" />
    <path d="M12 10v4M12 17.2v.1" />
  </svg>
)

export const Info = ({ size = 20, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.8v.1" />
  </svg>
)

export const Sun = ({ size = 20, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
  </svg>
)

export const Moon = ({ size = 20, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </svg>
)

export const ExternalLink = ({ size = 18, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5" />
  </svg>
)

export const Copy = ({ size = 18, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })}>
    <rect x="9" y="9" width="11" height="11" rx="2.2" />
    <path d="M15 6.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h.5" />
  </svg>
)

export const Trash = ({ size = 18, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l.7 12a2 2 0 0 0 2 1.9h5.6a2 2 0 0 0 2-1.9l.7-12" />
  </svg>
)

export const Refresh = ({ size = 18, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
    <path d="M20 4v7h-7" />
  </svg>
)

export const Lock = ({ size = 18, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })}>
    <rect x="4.5" y="10" width="15" height="10.5" rx="2.4" />
    <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
  </svg>
)

export const Globe = ({ size = 18, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3.5 9h17M3.5 15h17M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
  </svg>
)

export const Search = ({ size = 18, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
)

export const ChevronRight = ({ size = 18, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })} strokeWidth={2.2}>
    <path d="m9 5 7 7-7 7" />
  </svg>
)

export const ChevronDown = ({ size = 18, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })} strokeWidth={2.2}>
    <path d="m5 9 7 7 7-7" />
  </svg>
)

export const Rocket = ({ size = 20, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })}>
    <path d="M13.5 3.5c3.5-1 6.5 0 7 0 .5.5 1 3.5 0 7-1.2 4.2-5 7-7.6 8.3L9.5 15l-3.8-3.4C7 9 10 5 13.5 3.5Z" />
    <circle cx="15.5" cy="8.5" r="1.6" />
    <path d="M7.5 16.5c-1 1.5-1.2 3.5-1 5 1.5.2 3.5 0 5-1" />
  </svg>
)

export const Zap = ({ size = 18, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })}>
    <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12Z" />
  </svg>
)

export const Key = ({ size = 18, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })}>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 8-8M16.5 6.5 19 9M14 9l2 2" />
  </svg>
)

export const Spinner = ({ size = 20, ...rest }: IconProps) => (
  <svg {...base({ size, ...rest })} className={`spin ${rest.className ?? ''}`} strokeWidth={2.2}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
)
