"use strict";
/*
 * qpm.js — 물리 계산
 * 온도 의존 Sellmeier 식과 type-II degenerate QPM 조건 (λ 단위: μm, 펌프 파장 인자: nm).
 */

/* ===================== 굴절률 (λ: μm) ===================== */
function nZ(l, T) {
  const l2 = l * l;
  const n25 = Math.sqrt(2.12725 + 1.18431 / (1 - 0.0514852 / l2) + 0.6603 / (1 - 100.00507 / l2) - 0.00968956 * l2);
  const dndT = (12.415 / l ** 3 - 44.414 / l2 + 59.129 / l - 12.101) * 1e-6;
  return n25 + (T - 25) * dndT;
}
function nY(l, T) {
  const l2 = l * l;
  const n25 = Math.sqrt(2.09930 + 0.922683 / (1 - 0.0467695 / l2) - 0.0138408 * l2);
  const dndT = (4.269 / l ** 3 - 14.761 / l2 + 21.232 / l - 2.113) * 1e-6;
  return n25 + (T - 25) * dndT;
}

/* ===================== QPM 계산 ===================== */
// Δk = n_y(λp)/λp − n_z(2λp)/(2λp) − n_y(2λp)/(2λp)   [1/μm],  QPM: Δk = 1/Λ
function deltaK(pumpNm, T) {
  const p = pumpNm / 1000, s = 2 * p;
  return nY(p, T) / p - nZ(s, T) / s - nY(s, T) / s;
}
function idealPeriod(pumpNm, T) { return 1 / deltaK(pumpNm, T); }
// Δk가 T에 선형이므로 정확히 풀림
function qpmTemperature(pumpNm, period) {
  const k25 = deltaK(pumpNm, 25);
  const slope = deltaK(pumpNm, 26) - k25;
  return 25 + (1 / period - k25) / slope;
}

function candidatePeriods(step) {
  // 4–20 μm 안의 step 배수 (너무 많으면 400개로 제한)
  const lo = Math.ceil(4 / step - 1e-9), hi = Math.floor(20 / step + 1e-9);
  const out = [];
  for (let k = lo; k <= hi && out.length < 400; k++) out.push(+(k * step).toFixed(6));
  return out;
}

function recommendFor(wl, cands, s) {
  let best = null;
  for (const period of cands) {
    const T = qpmTemperature(wl, period);
    const outside = Math.max(s.tMin - T, 0, T - s.tMax);
    const score = outside === 0 ? Math.abs(T - s.tTarget) : 1e4 + outside;
    if (!best || score < best.score) best = { period, T, score, inRange: outside === 0 };
  }
  return best;
}
