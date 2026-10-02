"use strict";
/*
 * chart.js — SVG 차트 도우미
 * 외부 라이브러리 없이 축·격자·선·점·라벨을 그리는 작은 함수 모음.
 */

/* ===================== SVG 차트 도우미 ===================== */
function niceStep(span, count) {
  const raw = span / Math.max(count, 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / mag;
  return (r >= 7.5 ? 10 : r >= 3.5 ? 5 : r >= 1.5 ? 2 : 1) * mag;
}
function ticks(min, max, count) {
  const step = niceStep(max - min, count);
  const out = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-6; v += step) out.push(+v.toFixed(10));
  return { values: out, step };
}
function decimalsFor(step) { return Math.max(0, -Math.floor(Math.log10(step) + 1e-9)); }

function drawChart(el, opt) {
  // 너비: data-width가 있으면 그 값(인쇄용 고정 크기), 없으면 화면의 실제 너비
  const W = Math.max(300, Math.round(+el.dataset.width || el.clientWidth));
  const H = Math.round(Math.min(Math.max(W * 0.6, 300), 540));
  const m = { l: 60, r: 18, t: 14, b: 52 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const [x0, x1] = opt.x, [y0, y1] = opt.y;
  const sx = v => m.l + (v - x0) / (x1 - x0) * pw;
  const sy = v => m.t + ph - (v - y0) / (y1 - y0) * ph;
  const clipId = "clip-" + Math.random().toString(36).slice(2, 8);
  const under = [], plot = [], over = [];
  const boxes = [];   // 라벨 충돌 회피용

  // 격자와 눈금
  const xt = ticks(x0, x1, Math.max(3, Math.floor(pw / 90)));
  const yt = ticks(y0, y1, Math.max(3, Math.floor(ph / 55)));
  const xd = decimalsFor(xt.step), yd = decimalsFor(yt.step);
  for (const v of xt.values) {
    under.push(`<line x1="${sx(v)}" x2="${sx(v)}" y1="${m.t}" y2="${m.t + ph}" stroke="var(--grid)"/>`);
    over.push(`<text x="${sx(v)}" y="${m.t + ph + 20}" text-anchor="middle" font-size="12" fill="var(--muted)">${v.toFixed(xd)}</text>`);
  }
  for (const v of yt.values) {
    under.push(`<line x1="${m.l}" x2="${m.l + pw}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--grid)"/>`);
    over.push(`<text x="${m.l - 8}" y="${sy(v) + 4}" text-anchor="end" font-size="12" fill="var(--muted)">${v.toFixed(yd)}</text>`);
  }
  over.push(`<text x="${m.l + pw / 2}" y="${H - 8}" text-anchor="middle" font-size="13" fill="var(--ink)">${opt.xLabel}</text>`);
  over.push(`<text transform="translate(16 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle" font-size="13" fill="var(--ink)">${opt.yLabel}</text>`);

  const api = {
    sx, sy, x0, x1, y0, y1,
    band({ xa = x0, xb = x1, ya = y0, yb = y1, fill }) {
      const X0 = sx(Math.max(Math.min(xa, xb), x0)), X1 = sx(Math.min(Math.max(xa, xb), x1));
      const Y0 = sy(Math.min(Math.max(ya, yb), y1)), Y1 = sy(Math.max(Math.min(ya, yb), y0));
      if (X1 > X0 && Y1 > Y0) under.push(`<rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}" fill="${fill}"/>`);
    },
    line(xs, ys, { color = "var(--ink)", width = 2, dash = "" } = {}) {
      const pts = xs.map((x, i) => [x, ys[i]]).filter(p => Number.isFinite(p[1]));
      if (pts.length < 2) return;
      const d = pts.map((p, i) => `${i ? "L" : "M"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join("");
      plot.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ""} stroke-linejoin="round"/>`);
    },
    vline(x, opts) { api.line([x, x], [y0, y1], opts); },
    hline(y, opts) { api.line([x0, x1], [y, y], opts); },
    // tip = { title, rows: [[이름, 값], ...] } 을 주면 마우스를 올렸을 때 값이 표시됨
    dot(x, y, { r = 4, fill = "var(--ink)", stroke = "none", tip = null } = {}) {
      if (x < x0 || x > x1 || y < y0 || y > y1) return;
      const cx = sx(x).toFixed(1), cy = sy(y).toFixed(1);
      over.push(`<circle class="pt" cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`);
      // 보이는 점 바로 뒤에 투명한 큰 원을 두어 마우스·손가락으로 잡기 쉽게 함
      if (tip) over.push(`<circle class="pt-hit" cx="${cx}" cy="${cy}" r="${Math.max(r + 5, 10)}" data-tip="${esc(JSON.stringify(tip))}"/>`);
    },
    label(x, y, text, { color = "var(--ink)", anchor = "start", dx = 0, dy = 0, size = 12, weight = 500, avoid = false } = {}) {
      let X = sx(x) + dx, Y = sy(y) + dy;
      const w = text.length * size * 0.6, h = size + 4;
      if (avoid) {
        const left = () => (anchor === "end" ? X - w : anchor === "middle" ? X - w / 2 : X);
        let tries = 0;
        while (tries++ < 8 && boxes.some(b => left() < b.x + b.w && left() + w > b.x && Y - h < b.y && Y > b.y - b.h)) Y -= h;
        boxes.push({ x: left(), y: Y, w, h });
      }
      over.push(`<text x="${X}" y="${Y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${color}" paint-order="stroke" stroke="var(--surface)" stroke-width="4" stroke-linejoin="round">${esc(text)}</text>`);
    },
  };
  opt.draw(api);

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><clipPath id="${clipId}"><rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/></clipPath></defs>
    <g clip-path="url(#${clipId})">${under.join("")}${plot.join("")}</g>
    <rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="none" stroke="var(--line)"/>
    ${over.join("")}
  </svg>`;
}

/* ---------- 점 위에 마우스를 올리면 값을 보여주는 말풍선 ---------- */
// chartEl: 그래프가 그려지는 요소, tipEl: 말풍선 요소 (둘 다 position: relative인 부모 안에 있음)
function setupChartTooltip(chartEl, tipEl) {
  let activePoint = null;

  function show(hit) {
    const { title, rows } = JSON.parse(hit.dataset.tip);
    tipEl.innerHTML = `<strong>${esc(title)}</strong><dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
    tipEl.hidden = false;

    if (activePoint) activePoint.classList.remove("active");
    activePoint = hit.previousElementSibling;   // 보이는 점 강조
    activePoint.classList.add("active");

    // 말풍선 위치: 점의 오른쪽 위. 칸 밖으로 나가면 반대쪽으로
    const box = tipEl.parentElement.getBoundingClientRect();
    const pt = hit.getBoundingClientRect();
    const px = pt.left + pt.width / 2 - box.left, py = pt.top + pt.height / 2 - box.top;
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight, gap = 12;
    let left = px + gap, top = py - h - gap;
    if (left + w > box.width) left = px - w - gap;
    if (left < 0) left = Math.max(0, Math.min(box.width - w, px - w / 2));
    if (top < 0) top = py + gap;
    tipEl.style.left = `${left}px`;
    tipEl.style.top = `${top}px`;
  }

  function hide() {
    tipEl.hidden = true;
    if (activePoint) activePoint.classList.remove("active");
    activePoint = null;
  }

  chartEl.addEventListener("pointerover", e => {
    const hit = e.target.closest(".pt-hit");
    if (hit) show(hit);
  });
  chartEl.addEventListener("pointerout", e => {
    if (e.pointerType === "mouse" && e.target.closest(".pt-hit")) hide();
  });
  // 터치: 점을 탭하면 표시, 빈 곳을 탭하면 숨김
  chartEl.addEventListener("pointerdown", e => {
    const hit = e.target.closest(".pt-hit");
    if (hit) show(hit); else hide();
  });
  return { hide };
}

// 범례 기호를 SVG로 그림 (배경색과 달리 인쇄할 때도 빠지지 않음)
const LEGEND_SYMBOL = {
  line: c => `<line x1="1" y1="6" x2="19" y2="6" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`,
  dash: c => `<line x1="1" y1="6" x2="19" y2="6" stroke="${c}" stroke-width="1.6" stroke-dasharray="4 3"/>`,
  dot: c => `<circle cx="10" cy="6" r="5" fill="${c}"/>`,
  ring: c => `<circle cx="10" cy="6" r="4.2" fill="var(--surface)" stroke="${c}" stroke-width="1.8"/>`,
  box: c => `<rect x="2" y="1" width="16" height="10" rx="2" fill="${c}" stroke="var(--line)"/>`,
};
function legendHTML(items) {
  return items.map(it => {
    const symbol = (LEGEND_SYMBOL[it.kind] || LEGEND_SYMBOL.line)(it.color);
    return `<span><svg width="20" height="12" aria-hidden="true">${symbol}</svg>${esc(it.label)}</span>`;
  }).join("");
}
