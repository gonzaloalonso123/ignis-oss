import type { FlamePalette } from "../types";
import { FLAME_PALETTES } from "./palettes";
import { FLAME_PATHS } from "./paths";

export function ComputerArtwork() {
  return (
    <g data-computer="" opacity="0">
      <rect
        x="-94"
        y="-71"
        width="188"
        height="122"
        rx="13"
        fill="#87e8e5"
        fillOpacity=".09"
        stroke="#53bcbf"
        strokeWidth="1.5"
        strokeOpacity=".65"
      />
      <path
        d="M-94-49V-60Q-94-71-83-71H-68 M68-71H83Q94-71 94-60V-49 M94 29V40Q94 51 83 51H68 M-68 51H-83Q-94 51-94 40V29"
        fill="none"
        stroke="#a3f4ef"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M-78-57H-47 M61-57H78"
        stroke="#60c9ca"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M-76-44L-56-64 M-76-32L-44-64"
        stroke="#e1ffff"
        strokeWidth="2"
        opacity=".35"
      />
      <g fill="none" strokeLinecap="round" strokeWidth="3">
        <path d="M-67-7L-61-2-67 3" stroke="#347f87" />
        <path data-code-a="" d="M-49-2H41" stroke="#347f87" />
        <path data-code-b="" d="M-49 12H16" stroke="#347f87" />
        <path data-code-c="" d="M-49 26H48" stroke="#347f87" />
      </g>
      <path data-cursor="" d="M-49 33V40" stroke="#347f87" strokeWidth="3" />
    </g>
  );
}

export function Flame({ palette = FLAME_PALETTES.default }: { palette?: FlamePalette }) {
  return (
    <>
      <path data-red="" fill={palette.outer} d={FLAME_PATHS.red} />

      <path data-orange="" fill={palette.mid} d={FLAME_PATHS.orange} />

      <path data-yellow="" fill={palette.inner} d={FLAME_PATHS.yellow} />

      <g data-face="" fill={palette.eye}>
        <ellipse data-eye-left="" cx="-19" cy="-58" rx="6" ry="11" />
        <ellipse data-eye-right="" cx="19" cy="-58" rx="6" ry="11" />
      </g>

      <ellipse data-ember-a="" rx="5" ry="9" fill={palette.mid} opacity="0" />
      <ellipse data-ember-b="" rx="4" ry="7" fill={palette.outer} opacity="0" />
      <ellipse data-ember-c="" rx="3.5" ry="6" fill={palette.inner} opacity="0" />

      <ComputerArtwork />
    </>
  );
}
