// Dev-only: parse STUDYBUDDY_DEV_RUN, a ';'-separated list of "command[:arg]@milliseconds",
// e.g. "unlock:hero@1500;landing@3000;snap:after@9000;quit@20000". Pure, so it is unit-tested.
'use strict';
function parse(str) {
  const out = [];
  for (const part of String(str || '').split(';')) {
    const m = /^\s*([a-z]+)(?::([^@]*))?@(\d+)\s*$/i.exec(part);
    if (m) out.push({ cmd: m[1].toLowerCase(), arg: m[2] || '', at: Math.min(Number(m[3]), 3600000) });
  }
  return out.sort((a, b) => a.at - b.at);
}
module.exports = { parse };
