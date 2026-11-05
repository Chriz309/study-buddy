'use strict';
// Dev-mode gate and the Sparks economy rules that depend on it. Pure, so the gating is unit-tested.
// Dev mode is ON only for (a) a dedicated dev build (flag baked into package.json at build time by
// electron-builder.dev.yml) or (b) an UNPACKAGED run with STUDYBUDDY_DEV=1. The env var is ignored in any packaged build,
// and public builds never carry the flag, so there is no path to infinite Sparks in a release.
function isDevMode({ devBuildFlag, isPackaged, env } = {}) {
  return devBuildFlag === true || (!isPackaged && !!env && env.STUDYBUDDY_DEV === '1');
}

// infinite = true only in dev mode. Sparks never run out and spending does not reduce them.
function createEconomy(infinite) {
  const inf = infinite === true;
  return {
    infinite: inf,
    canAfford: (have, cost) => inf || have >= cost,
    after: (have, cost) => (inf ? have : +(have - cost).toFixed(3)),
    display: (have) => (inf ? '∞' : String(Math.floor(have))),
  };
}
module.exports = { isDevMode, createEconomy };
