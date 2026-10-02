"use strict";
/*
 * app.js — 화면 동작
 * 상태 저장, 계산 결과 정리, 그래프 4종 정의, 렌더링, 입력 이벤트.
 */

/* ===================== 상태 ===================== */
function isValidWl(v) { return Number.isFinite(v) && v >= WL_RANGE[0] && v <= WL_RANGE[1]; }
function defaultState() {
  return {
    lasers: DEFAULT_LASERS.map(l => ({ ...l })), settings: { ...DEFAULT_SETTINGS }, tab: "qpm",
    allMargin: ALL_TAB_MARGIN_NM.default,   // '후보 Λ 전체' 탭의 x축 여백 [nm]
  };
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.lasers) && saved.settings) return { ...defaultState(), ...saved };
  } catch (e) { /* 저장값이 없거나 읽을 수 없음 */ }
  return defaultState();
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 저장 불가 환경 */ }
}
let state = loadState();


/* ===================== '후보 Λ 전체' 탭 x축 확대/축소 ===================== */
// 슬라이더(0–100)와 여백[nm]을 로그 눈금으로 변환: 확대 쪽에서도 세밀하게 조절되도록
const { min: M_MIN, max: M_MAX } = ALL_TAB_MARGIN_NM;
const sliderToMargin = v => M_MIN * Math.pow(M_MAX / M_MIN, v / 100);
const marginToSlider = m => 100 * Math.log(m / M_MIN) / Math.log(M_MAX / M_MIN);

// 보여줄 x 범위: 레이저 파장 범위 양옆에 여백을 붙임
function allTabXRange(r) {
  const wls = r.results.map(x => x.wl);
  return [Math.min(...wls) - state.allMargin, Math.max(...wls) + state.allMargin];
}

/* ===================== 계산 결과 정리 ===================== */
// Λ 표시 자릿수: 최소 2자리, 간격이 더 잘게 나뉘면 그 자릿수까지
const stepDecimals = () => (String(state.settings.step).split(".")[1] || "").length;
const fmtPeriod = p => p.toFixed(Math.max(2, stepDecimals()));

function compute() {
  const s = state.settings;
  const cands = candidatePeriods(s.step);
  const lasers = state.lasers.map((l, i) => ({ ...l, color: `var(${LASER_COLORS[i % LASER_COLORS.length]})`, valid: isValidWl(l.wl) }));
  const results = lasers.filter(l => l.valid).map(l => {
    const rec = recommendFor(l.wl, cands, s);
    return {
      ...l,
      signal: 2 * l.wl,
      ideal25: idealPeriod(l.wl, 25),
      period: rec.period,
      T: rec.T,
      inRange: rec.inRange,
      dTper01: qpmTemperature(l.wl + 0.1, rec.period) - rec.T,
    };
  });
  return { cands, lasers, results };
}

/* ===================== 그래프 ===================== */
// 교차점 말풍선 내용: (레이저, Λ)에서 QPM이 맞는 온도
function crossingTip(laser, period, T) {
  const s = state.settings;
  const verdict = T >= s.tMin && T <= s.tMax ? "사용 가능" : T > s.tMax ? "너무 높음" : "너무 낮음";
  const isRec = Math.abs(period - laser.period) < 1e-9;
  return {
    title: laser.name,
    rows: [
      ["펌프 λp", `${fmt(laser.wl, 3)} nm`],
      ["Λ", `${fmtPeriod(period)} μm${isRec ? " (추천)" : ""}`],
      ["QPM 온도", `${fmt(T, 1)} °C`],
      [`오븐 ${s.tMin}–${s.tMax} °C`, verdict],
    ],
  };
}
// 선 위의 점 말풍선 내용: Λ 선 위 한 점의 파장과 온도
function lineTip(title, wl, T) {
  return { title, rows: [["펌프 λp", `${fmt(wl, 2)} nm`], ["QPM 온도", `${fmt(T, 1)} °C`]] };
}
const HOVER_HINT = "점에 마우스를 올리면(휴대폰은 탭) 값이 표시됩니다.";

const CHARTS = {
  qpm: {
    desc: r => `추천된 Λ에서 펌프 파장에 따라 QPM이 맞는 결정 온도입니다. 작은 점은 0.1 nm 간격이고, 큰 점이 각 레이저의 동작 온도입니다. 펌프 파장이 0.1 nm 늘면 약 ${fmt(avg(r.results.map(x => x.dTper01)), 2)} °C 높여야 합니다. ${HOVER_HINT}`,
    draw(el, r) {
      const s = state.settings, res = r.results;
      const wls = res.map(x => x.wl);
      const xa = Math.floor(Math.min(...wls) * 10) / 10 - 0.2, xb = Math.ceil(Math.max(...wls) * 10) / 10 + 0.2;
      const Ts = res.map(x => x.T);
      const ya = Math.min(0, Math.min(...Ts) - 15), yb = Math.max(s.tMax + 10, Math.max(...Ts) + 20);
      const periods = [...new Set(res.map(x => x.period))].sort((a, b) => a - b);
      drawChart(el, {
        x: [xa, xb], y: [ya, yb], xLabel: "Pump wavelength (nm)", yLabel: "Temperature (°C)",
        draw(c) {
          c.band({ ya: s.tMax, yb: c.y1, fill: "var(--warn-soft)" });
          c.band({ ya: c.y0, yb: s.tMin, fill: "var(--warn-soft)" });
          c.hline(s.tMin, { color: "var(--warn)", width: 1.2, dash: "5 4" });   // 인쇄 시에도 보이는 경계선
          c.hline(s.tMax, { color: "var(--warn)", width: 1.2, dash: "5 4" });
          const grid = linspace(xa, xb, 200);
          for (const p of periods) {
            c.line(grid, grid.map(w => qpmTemperature(w, p)), { color: "var(--pump)", width: 2 });
            for (let w = Math.ceil(xa * 10) / 10; w <= xb + 1e-9; w += 0.1) {
              const T = qpmTemperature(w, p);
              c.dot(w, T, { r: 2.6, fill: "var(--pump)", tip: lineTip(`Λ = ${fmtPeriod(p)} μm`, w, T) });
            }
            // 선 이름: 선 위 62 % 지점의 오른쪽 아래 (점·라벨이 적은 자리)
            const xl = xa + (xb - xa) * 0.62, yl = qpmTemperature(xl, p);
            if (yl > c.y0 && yl < c.y1) c.label(xl, yl, `Λ = ${fmtPeriod(p)} μm`, { dx: 10, dy: 18, color: "var(--pump)", weight: 600 });
          }
          [...res].sort((a, b) => b.T - a.T).forEach(x => {
            c.dot(x.wl, x.T, { r: 7, fill: x.color, stroke: "var(--surface)", tip: crossingTip(x, x.period, x.T) });
            c.label(x.wl, x.T, `${fmt(x.T, 1)} °C`, { anchor: "end", dx: -11, dy: -9, color: x.color, weight: 700, size: 13, avoid: true });
          });
        },
      });
      return [
        ...periods.map(p => ({ label: `Λ = ${fmtPeriod(p)} μm`, color: "var(--pump)" })),
        ...res.map(x => ({ label: x.name, color: x.color, kind: "dot" })),
        { label: `오븐 사용 온도 경계 (${s.tMin}, ${s.tMax} °C)`, color: "var(--warn)", kind: "dash" },
      ];
    },
  },

  all: {
    desc: () => `간격 ${fmtPeriod(state.settings.step)} μm의 후보 Λ 각각이 담당하는 펌프 파장대입니다. 세로선(레이저)과 후보 Λ 선의 교차점이 그 조합의 QPM 온도이고, 초록 범위 안의 교차점이 쓸 수 있는 조합입니다. ${HOVER_HINT}`,
    draw(el, r) {
      const s = state.settings, res = r.results;
      const [xa, xb] = allTabXRange(r);   // 슬라이더로 조절되는 범위
      const ya = Math.min(0, s.tMin - 10), yb = Math.max(150, s.tMax + 40);
      const recommended = new Set(res.map(x => x.period));
      drawChart(el, {
        x: [xa, xb], y: [ya, yb], xLabel: "Pump wavelength (nm)", yLabel: "Temperature (°C)",
        draw(c) {
          c.band({ ya: s.tMin, yb: s.tMax, fill: "var(--ok-soft)" });
          const grid = linspace(xa, xb, 240);
          const yLab = ya + (yb - ya) * 0.06;   // 선 이름을 놓을 높이 (그림 아래쪽)

          // 1) 후보 선을 모두 그리고, 각 선이 이름 높이를 지나는 x 위치를 기록
          const lines = r.cands.map(p => {
            const Tl = grid.map(w => qpmTemperature(w, p));
            const isRec = recommended.has(p);
            c.line(grid, Tl, { color: isRec ? "var(--pump)" : "var(--neutral-line)", width: isRec ? 2.5 : 1.3 });
            const xCross = grid.find((w, i) => i > 0 && Tl[i - 1] < yLab && Tl[i] >= yLab);
            return { p, Tl, isRec, xCross };
          });

          // 2) 선 이름은 선의 바로 왼쪽에 놓음. 그 자리를 다른 선이 지나가거나
          //    다른 이름과 겹치면 생략 (어느 선의 이름인지 헷갈리지 않도록). 추천 Λ부터 배치
          const crossPx = lines.filter(l => l.xCross !== undefined).map(l => c.sx(l.xCross));
          const placed = [];   // 이미 놓은 이름의 [왼쪽, 오른쪽] px
          for (const l of [...lines].sort((a, b) => b.isRec - a.isRec)) {
            const text = `Λ = ${fmtPeriod(l.p)} μm`;
            const style = { anchor: "end", dx: -6, color: l.isRec ? "var(--pump)" : "var(--muted)", weight: 600 };
            if (l.xCross !== undefined) {
              const right = c.sx(l.xCross) - 4, left = right - text.length * 7.4;
              // 추천 Λ 이름은 다른 선이 지나가더라도 항상 표시 (글자 테두리로 선 위에서도 읽힘)
              const blocked = left < c.sx(xa) + 4
                || (!l.isRec && crossPx.some(x => x > left && x < right))
                || placed.some(([a, b]) => left < b && right > a);
              if (!blocked) { c.label(l.xCross, yLab, text, style); placed.push([left, right]); }
            } else if (l.isRec) {
              // 많이 확대해서 아래쪽 이름 자리가 화면 밖이면, 선의 보이는 구간 가운데에 표시
              const visible = grid.filter((w, i) => l.Tl[i] > ya && l.Tl[i] < yb);
              const xMid = visible[Math.floor(visible.length / 2)];
              if (xMid !== undefined) c.label(xMid, qpmTemperature(xMid, l.p), text, { ...style, anchor: "start", dx: 8, dy: 16 });
            }
          }
          for (const x of res) c.vline(x.wl, { color: x.color, width: 2 });

          // 교차점: 레이저 세로선 × 후보 Λ 선 (추천 조합은 크게)
          for (const x of res) {
            for (const p of r.cands) {
              const T = qpmTemperature(x.wl, p), isRec = Math.abs(p - x.period) < 1e-9;
              c.dot(x.wl, T, { r: isRec ? 6.5 : 4.5, fill: x.color, stroke: "var(--surface)", tip: crossingTip(x, p, T) });
            }
          }
        },
      });
      return [
        { label: "추천된 Λ", color: "var(--pump)" },
        { label: "다른 후보 Λ", color: "var(--neutral-line)" },
        { label: "교차점 (큰 점: 추천 조합)", color: "var(--muted)", kind: "dot" },
        ...res.map(x => ({ label: `${x.name} (${fmt(x.wl, 3)} nm)`, color: x.color })),
        { label: `사용 온도 ${s.tMin}–${s.tMax} °C`, color: "var(--ok-soft)", kind: "box" },
      ];
    },
  },

  period: {
    desc: () => `레이저마다 온도를 바꿀 때 필요한 이상적인 Λ(곡선)와 후보 Λ(점선)입니다. 곡선과 점선의 교차점이 그 Λ를 쓸 때의 동작 온도이고, 초록 영역 안이면 사용할 수 있습니다. ${HOVER_HINT}`,
    draw(el, r) {
      const s = state.settings, res = r.results;
      const xa = Math.min(-20, s.tMin - 20), xb = Math.max(160, s.tMax + 40);
      const Tg = linspace(xa, xb, 120);
      const all = res.flatMap(x => [idealPeriod(x.wl, xa), idealPeriod(x.wl, xb)]);
      const ya = Math.min(...all) - 0.08, yb = Math.max(...all) + 0.08;
      const recommended = new Set(res.map(x => x.period));
      const visible = r.cands.filter(p => p > ya && p < yb);
      drawChart(el, {
        x: [xa, xb], y: [ya, yb], xLabel: "Crystal temperature (°C)", yLabel: "Required poling period Λ (μm)",
        draw(c) {
          c.band({ xa: s.tMin, xb: s.tMax, fill: "var(--ok-soft)" });
          for (const p of visible) {
            const isRec = recommended.has(p);
            c.hline(p, { color: isRec ? "var(--pump)" : "var(--neutral-line)", width: isRec ? 1.8 : 1, dash: "6 5" });
            if (isRec || visible.length <= 10) c.label(xb, p, `${fmtPeriod(p)} μm`, { anchor: "end", dx: -6, dy: -6, color: isRec ? "var(--pump)" : "var(--muted)", weight: 600 });
          }
          for (const x of res) c.line(Tg, Tg.map(T => idealPeriod(x.wl, T)), { color: x.color, width: 2.5 });
          // 교차점: 레이저 곡선 × 후보 Λ 점선 (추천 조합은 크게)
          for (const x of res) {
            for (const p of visible) {
              const T = qpmTemperature(x.wl, p), isRec = Math.abs(p - x.period) < 1e-9;
              c.dot(T, p, { r: isRec ? 6.5 : 4.5, fill: x.color, stroke: "var(--surface)", tip: crossingTip(x, p, T) });
            }
          }
        },
      });
      return [
        ...res.map(x => ({ label: x.name, color: x.color })),
        { label: "후보 Λ", color: "var(--neutral-line)" },
        { label: "교차점 (큰 점: 추천 조합)", color: "var(--muted)", kind: "dot" },
        { label: `사용 온도 ${s.tMin}–${s.tMax} °C`, color: "var(--ok-soft)", kind: "box" },
      ];
    },
  },

  slide: {
    desc: r => {
      const inside = r.results.filter(x => x.wl >= 403 && x.wl <= 404);
      const outside = r.results.filter(x => x.wl < 403 || x.wl > 404);
      let text = `슬라이드 722와 같은 범위·Λ로 그린 그림입니다. Λ = 9.75 μm 선이 403.2 nm에서 ${fmt(qpmTemperature(403.2, 9.75), 1)} °C, 404.0 nm에서 ${fmt(qpmTemperature(404.0, 9.75), 1)} °C를 지나며, 슬라이드 그림과 거의 같습니다.`;
      if (inside.length) text += ` 이 범위에 있는 레이저는 점선으로 표시했고, 빈 원이 각 Λ 선과의 교차점입니다.`;
      if (outside.length) text += ` (${outside.map(x => x.name).join(", ")}는 403–404 nm 밖이라 표시되지 않습니다.)`;
      return `${text} ${HOVER_HINT}`;
    },
    draw(el, r) {
      const set = [[9.65, "var(--l1)"], [9.70, "var(--l6)"], [9.75, "var(--l4)"], [9.80, "var(--ink)"], [9.85, "var(--l3)"]];
      const inside = r.results.filter(x => x.wl >= 403 && x.wl <= 404);   // 이 범위 안의 레이저만
      drawChart(el, {
        x: [403.0, 404.0], y: [0, 80], xLabel: "Pump wavelength (nm)", yLabel: "Temperature (°C)",
        draw(c) {
          const grid = linspace(403, 404, 120);
          for (const [p, col] of set) c.line(grid, grid.map(w => qpmTemperature(w, p)), { color: col, width: 2 });
          for (const x of inside) c.vline(x.wl, { color: x.color, width: 1.6, dash: "5 4" });

          // 슬라이드의 빨간 점 (Λ = 9.75 μm, 0.1 nm 간격)
          for (let w = 403.2; w <= 404.0001; w += 0.1) {
            const T = qpmTemperature(w, 9.75);
            c.dot(w, T, { r: 4, fill: "var(--l4)", tip: lineTip("슬라이드 표시점 (Λ = 9.75 μm)", w, T) });
          }
          // 교차점: 레이저 점선 × 슬라이드의 Λ 선
          for (const x of inside) {
            for (const [p] of set) {
              const T = qpmTemperature(x.wl, p);
              c.dot(x.wl, T, { r: 5.5, fill: "var(--surface)", stroke: x.color, tip: crossingTip(x, p, T) });
            }
          }
        },
      });
      return [
        ...set.map(([p, col]) => ({ label: `Λ = ${p.toFixed(2)} μm`, color: col })),
        ...inside.map(x => ({ label: x.name, color: x.color, kind: "dash" })),
        ...(inside.length ? [{ label: "교차점", color: "var(--muted)", kind: "ring" }] : []),
      ];
    },
  },
};

/* ===================== 렌더링 ===================== */
let lastResult = null;

function renderLaserInputs() {
  const list = $("laser-list");
  list.innerHTML = state.lasers.map((l, i) => `
    <div class="laser-row" data-i="${i}">
      <span class="swatch" style="background:var(${LASER_COLORS[i % LASER_COLORS.length]})"></span>
      <input type="text" aria-label="레이저 ${i + 1} 이름" data-field="name" value="${esc(l.name)}">
      <button type="button" class="icon-btn" data-remove="${i}" aria-label="레이저 ${i + 1} 삭제" ${state.lasers.length <= 1 ? "disabled" : ""}>×</button>
      <div class="wl-wrap">
        <input type="number" aria-label="레이저 ${i + 1} 중심 파장 (nm)" data-field="wl" step="0.00001" inputmode="decimal" value="${Number.isFinite(l.wl) ? l.wl : ""}">
        <span>nm</span>
      </div>
      <span class="laser-error" ${isValidWl(l.wl) ? "hidden" : ""}>${WL_RANGE[0]}–${WL_RANGE[1]} nm 사이 값을 입력하세요.</span>
    </div>`).join("");
  $("add-laser").disabled = state.lasers.length >= LASER_COLORS.length;
}

function renderSettingsInputs() {
  const s = state.settings;
  $("step").value = s.step; $("tmin").value = s.tMin; $("tmax").value = s.tMax; $("ttarget").value = s.tTarget;
}

// 추천 Λ 목록 (작은 값부터)
function recommendedPeriods(r) { return [...new Set(r.results.map(x => x.period))].sort((a, b) => a - b); }

// 요약 문장 (화면 상단과 인쇄 요약에서 같이 사용)
function summaryText(r) {
  const s = state.settings, res = r.results, periods = recommendedPeriods(r);
  const ok = res.filter(x => x.inRange);
  const nearby = periods.map(p => [p - s.step, p + s.step]).flat().filter(p => p > 0 && !periods.includes(p));
  let text = `레이저 ${res.length}개 중 ${ok.length}개가 오븐 사용 온도(${s.tMin}–${s.tMax} °C) 안에서 QPM 조건을 만족합니다.`;
  if (ok.length < res.length) text += ` 나머지는 가장 가까운 후보를 쓰더라도 사용 온도를 벗어납니다.`;
  if (periods.length === 1 && nearby.length) text += ` 이웃 후보(${nearby.map(fmtPeriod).join(", ")} μm)는 이 파장대에서 쓸 수 없습니다.`;
  return text;
}

// 참고 문장 (화면 결과표 아래와 인쇄 요약에서 같이 사용)
function buildNotes(r) {
  const notes = [];
  if (r.results.length) {
    const perPm = avg(r.results.map(x => x.dTper01)) / 100;
    notes.push(`펌프 파장이 1 pm 바뀌면 QPM 온도는 약 ${fmt(perPm, 3)} °C 움직입니다. 측정된 레이저의 단기 흔들림(0.1 pm 이하)은 영향이 거의 없지만, 다중 모드 레이저(앞선 분석에서 taewon 95 mW)는 모드 간격만큼 다른 온도에서 QPM이 맞습니다.`);
  }
  if (r.results.some(x => x.T > 100)) {
    notes.push("100 °C 이상은 25 °C 근처에서 측정된 온도 계수를 선형으로 연장한 값이라 오차가 커질 수 있습니다. 실제로는 온도를 스캔하며 SPDC 신호가 최대가 되는 지점을 찾으세요.");
  }
  return notes;
}

function verdictText(x) {
  return x.inRange ? "사용 가능" : x.T > state.settings.tMax ? "너무 높음" : "너무 낮음";
}

function renderHero(r) {
  const s = state.settings, res = r.results;
  if (!res.length) {
    $("hero-value").textContent = "–";
    $("hero-value").classList.remove("multi");
    $("hero-text").textContent = "레이저 중심 파장을 하나 이상 입력하세요.";
    $("hero-chips").innerHTML = "";
    return;
  }
  const periods = recommendedPeriods(r);
  $("hero-caption").textContent = `간격 ${fmtPeriod(s.step)} μm 후보 중 추천 poling period`;
  $("hero-value").innerHTML = `Λ ${periods.map(fmtPeriod).join(" / ")}<small>μm</small>`;
  $("hero-value").classList.toggle("multi", periods.length > 1);
  $("hero-text").textContent = summaryText(r);
  $("hero-chips").innerHTML = res.map(x => `
    <li class="chip ${x.inRange ? "ok" : "out"}">
      <span class="swatch" style="background:${x.color}"></span>${esc(x.name)}
      <strong>${fmt(x.T, 1)} °C</strong>
    </li>`).join("");
}

function renderTable(r) {
  const s = state.settings;
  $("result-body").innerHTML = r.results.map(x => `
    <tr>
      <td class="name"><span class="swatch" style="width:10px;height:10px;border-radius:50%;background:${x.color}"></span>${esc(x.name)}</td>
      <td data-label="펌프 λp (nm)">${fmt(x.wl, 5)}</td>
      <td data-label="signal = idler (nm)">${fmt(x.signal, 4)}</td>
      <td data-label="25 °C에서 이상적인 Λ (μm)">${fmt(x.ideal25, 4)}</td>
      <td data-label="추천 Λ (μm)"><strong>${fmtPeriod(x.period)}</strong></td>
      <td data-label="QPM 온도 (°C)"><strong>${fmt(x.T, 1)}</strong></td>
      <td data-label="판정"><span class="badge ${x.inRange ? "ok" : "out"}">${verdictText(x)}</span></td>
      <td data-label="ΔT / 0.1 nm (°C)">${fmt(x.dTper01, 2)}</td>
    </tr>`).join("");

  $("notes").innerHTML = buildNotes(r).map(n => `<p>${esc(n)}</p>`).join("");
}

function renderZoomTools(r) {
  const show = state.tab === "all" && r.results.length > 0;
  $("zoom-tools").hidden = !show;
  if (!show) return;
  const [xa, xb] = allTabXRange(r);
  $("zoom").value = marginToSlider(state.allMargin);
  $("zoom-out").textContent = `${fmt(xa, 2)} – ${fmt(xb, 2)} nm (폭 ${fmt(xb - xa, xb - xa < 2 ? 2 : 1)} nm)`;
}

function renderChart(r) {
  const tab = CHARTS[state.tab] ? state.tab : "qpm";
  document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  renderZoomTools(r);
  const el = $("chart");
  if (!r.results.length && tab !== "slide") {
    el.innerHTML = `<p class="chart-desc" style="padding:40px 0">레이저 중심 파장을 입력하면 그래프가 그려집니다.</p>`;
    $("chart-desc").textContent = ""; $("chart-legend").innerHTML = "";
    return;
  }
  chartTip.hide();   // 다시 그리면 이전 말풍선은 닫음
  $("chart-desc").textContent = CHARTS[tab].desc(r);
  const legend = CHARTS[tab].draw(el, r);
  $("chart-legend").innerHTML = legendHTML(legend || []);
  el.setAttribute("aria-label", $("chart-desc").textContent);
}

/* ===================== 인쇄용 요약 ===================== */
// 화면과 별도로 A4 한 장 분량의 요약을 만들어 두고, 인쇄할 때만 보이게 함 (css의 @media print)
function nowText() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function renderPrintSheet(r) {
  const s = state.settings, res = r.results;
  const sheet = $("print-sheet");
  if (!res.length) {
    sheet.innerHTML = `<h1>PPKTP poling period 선택 요약</h1><p>레이저 중심 파장을 하나 이상 입력한 뒤 인쇄하세요.</p>`;
    return;
  }
  const periods = recommendedPeriods(r);
  const swatch = color => `<svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="${color}"/></svg>`;
  const slope = avg(res.map(x => x.dTper01));

  sheet.innerHTML = `
    <header class="ps-head">
      <h1>PPKTP poling period 선택 요약</h1>
      <p>Type-II collinear degenerate QPM-SPDC (pump y, signal z, idler y). 인쇄 <span id="print-date">${nowText()}</span></p>
    </header>

    <section class="ps-summary">
      <div class="ps-readout">
        <span>추천 poling period</span>
        <strong>Λ = ${periods.map(fmtPeriod).join(" / ")} μm</strong>
      </div>
      <div>
        <p>${esc(summaryText(r))}</p>
        <p class="ps-cond">계산 조건: 후보 Λ 간격 ${fmtPeriod(s.step)} μm의 배수, 오븐 사용 온도 ${s.tMin}–${s.tMax} °C, 선호 온도 ${s.tTarget} °C</p>
      </div>
    </section>

    <figure class="ps-figure">
      <div id="print-chart" data-width="720"></div>
      <figcaption>
        <span class="ps-fig-title">추천 Λ에서 펌프 파장별 QPM 온도 (작은 점: 0.1 nm 간격, 기울기 약 ${fmt(slope, 2)} °C / 0.1 nm)</span>
        <span class="legend" id="print-legend"></span>
      </figcaption>
    </figure>

    <table class="ps-table">
      <thead>
        <tr>
          <th>레이저</th><th>펌프 λ<sub>p</sub> (nm)</th><th>signal = idler (nm)</th><th>25 °C에서 이상적인 Λ (μm)</th>
          <th>추천 Λ (μm)</th><th>QPM 온도 (°C)</th><th>판정</th><th>ΔT / 0.1 nm (°C)</th>
        </tr>
      </thead>
      <tbody>
        ${res.map(x => `
        <tr>
          <td>${swatch(x.color)} ${esc(x.name)}</td>
          <td>${fmt(x.wl, 5)}</td><td>${fmt(x.signal, 4)}</td><td>${fmt(x.ideal25, 4)}</td>
          <td><strong>${fmtPeriod(x.period)}</strong></td><td><strong>${fmt(x.T, 1)}</strong></td>
          <td class="${x.inRange ? "ok" : "out"}">${verdictText(x)}</td><td>${fmt(x.dTper01, 2)}</td>
        </tr>`).join("")}
      </tbody>
    </table>

    <div class="ps-notes">${buildNotes(r).map(n => `<p>${esc(n)}</p>`).join("")}</div>

    <footer class="ps-foot">
      계산: 1/Λ = n<sub>y</sub>(λ<sub>p</sub>,T)/λ<sub>p</sub> − n<sub>z</sub>(2λ<sub>p</sub>,T)/2λ<sub>p</sub> − n<sub>y</sub>(2λ<sub>p</sub>,T)/2λ<sub>p</sub>.
      Sellmeier: n<sub>z</sub> Appl. Opt. 26, 2390 (1987), n<sub>y</sub> Appl. Phys. Lett. 84, 1644 (2004),
      온도 의존성 Opt. Lett. 18, 1208 (1993).
    </footer>`;

  const legend = CHARTS.qpm.draw($("print-chart"), r);
  $("print-legend").innerHTML = legendHTML(legend);
}

function renderAll() {
  lastResult = compute();
  renderHero(lastResult);
  renderTable(lastResult);
  renderChart(lastResult);
  renderPrintSheet(lastResult);
  saveState();
}

/* ===================== 이벤트 ===================== */
const chartTip = setupChartTooltip($("chart"), $("chart-tip"));
$("print-btn").addEventListener("click", () => window.print());
// Ctrl+P / 브라우저 메뉴로 인쇄해도 최신 값과 인쇄 시각이 들어가도록
window.addEventListener("beforeprint", () => { if (lastResult) renderPrintSheet(lastResult); });

$("laser-list").addEventListener("input", e => {
  const row = e.target.closest(".laser-row");
  if (!row) return;
  const i = +row.dataset.i, field = e.target.dataset.field;
  if (field === "name") state.lasers[i].name = e.target.value;
  if (field === "wl") {
    state.lasers[i].wl = e.target.value === "" ? NaN : parseFloat(e.target.value);
    const valid = isValidWl(state.lasers[i].wl);
    e.target.setAttribute("aria-invalid", String(!valid));
    row.querySelector(".laser-error").hidden = valid;
  }
  renderAll();
});
$("laser-list").addEventListener("click", e => {
  const btn = e.target.closest("[data-remove]");
  if (!btn) return;
  state.lasers.splice(+btn.dataset.remove, 1);
  renderLaserInputs(); renderAll();
});
$("add-laser").addEventListener("click", () => {
  const last = state.lasers[state.lasers.length - 1];
  state.lasers.push({ name: `레이저 ${state.lasers.length + 1}`, wl: last && isValidWl(last.wl) ? +(last.wl + 0.5).toFixed(3) : 404 });
  renderLaserInputs(); renderAll();
});

function bindSetting(id, key, validate) {
  $(id).addEventListener("input", e => {
    const v = parseFloat(e.target.value);
    const ok = Number.isFinite(v) && validate(v);
    e.target.setAttribute("aria-invalid", String(!ok));
    if (ok) { state.settings[key] = v; renderAll(); }
  });
}
bindSetting("step", "step", v => v >= 0.01 && v <= 5);
bindSetting("tmin", "tMin", v => v < state.settings.tMax);
bindSetting("tmax", "tMax", v => v > state.settings.tMin);
bindSetting("ttarget", "tTarget", () => true);

// '후보 Λ 전체' 탭 x축 슬라이더
let zoomFrame = 0;
$("zoom").addEventListener("input", e => {
  state.allMargin = sliderToMargin(+e.target.value);
  cancelAnimationFrame(zoomFrame);
  zoomFrame = requestAnimationFrame(() => { renderChart(lastResult); saveState(); });
});
$("zoom-reset").addEventListener("click", () => {
  state.allMargin = ALL_TAB_MARGIN_NM.default;
  renderChart(lastResult); saveState();
});

$("reset").addEventListener("click", () => {
  const tab = state.tab;
  state = defaultState(); state.tab = tab;
  document.querySelectorAll("input[aria-invalid]").forEach(i => i.removeAttribute("aria-invalid"));
  renderLaserInputs(); renderSettingsInputs(); renderAll();
});

document.querySelector(".tabs").addEventListener("click", e => {
  const b = e.target.closest(".tab");
  if (!b) return;
  state.tab = b.dataset.tab; saveState(); renderChart(lastResult);
});
document.querySelector(".tabs").addEventListener("keydown", e => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const tabs = [...document.querySelectorAll(".tab")];
  const i = tabs.findIndex(t => t.getAttribute("aria-selected") === "true");
  const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
  next.focus(); next.click();
});

let resizeFrame = 0, lastWidth = 0;
new ResizeObserver(entries => {
  const w = Math.round(entries[0].contentRect.width);
  if (w === lastWidth) return;
  lastWidth = w;
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => lastResult && renderChart(lastResult));
}).observe($("chart"));

renderLaserInputs();
renderSettingsInputs();
renderAll();
