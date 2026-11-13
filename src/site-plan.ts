import { svg } from "lit";
// Original abstract demonstration: a symmetric park and a single square pavilion.
// No real property, address, aerial photograph or private reference geometry.
export const sitePlan = () => svg`
  <svg viewBox="0 0 100 100" aria-hidden="true" class="demo-plan">
    <defs>
      <radialGradient id="park"><stop stop-color="#254e48"/><stop offset="1" stop-color="#102c30"/></radialGradient>
      <linearGradient id="roof" x2="1" y2="1"><stop stop-color="#66838c"/><stop offset="1" stop-color="#304d58"/></linearGradient>
      <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#96c5bb" stroke-opacity=".05" stroke-width=".25"/></pattern>
    </defs>
    <rect width="100" height="100" fill="url(#park)"/>
    <rect width="100" height="100" fill="url(#grid)"/>
    <path d="M0 50H100M50 0V100" stroke="#6f8173" stroke-width="9"/>
    <path d="M0 50H100M50 0V100" stroke="#b5bba5" stroke-opacity=".2" stroke-width=".4"/>
    <rect x="29" y="29" width="42" height="42" rx="8" fill="#84b994" opacity=".13"/>
    <g fill="#254f42" stroke="#609577" stroke-width=".4">
      <circle cx="24" cy="24" r="10"/><circle cx="76" cy="24" r="10"/>
      <circle cx="24" cy="76" r="10"/><circle cx="76" cy="76" r="10"/>
    </g>
    <g fill="#609577" opacity=".3"><circle cx="22" cy="21" r="5"/><circle cx="74" cy="21" r="5"/><circle cx="22" cy="73" r="5"/><circle cx="74" cy="73" r="5"/></g>
    <rect x="36" y="38" width="30" height="29" rx="2" fill="#061d23" opacity=".6"/>
    <rect x="35" y="35" width="30" height="30" rx="1" fill="url(#roof)" stroke="#a9c4c8" stroke-width=".7"/>
    <path d="M35 35L50 50L65 35M35 65L50 50L65 65" fill="none" stroke="#a0b8ba" stroke-width=".5"/>
    <rect x="45" y="39" width="10" height="5" rx=".6" fill="#1c3845" stroke="#85b0be" stroke-width=".3"/>
    <path d="M44 65H56" stroke="#ecd19a" stroke-width="1.5"/>
    <g fill="#e2ce93" opacity=".7"><circle cx="37" cy="74" r=".7"/><circle cx="63" cy="74" r=".7"/></g>
  </svg>`;
