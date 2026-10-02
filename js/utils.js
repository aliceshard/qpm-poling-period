"use strict";
/*
 * utils.js — 공통 도우미
 * DOM 접근, 문자열 이스케이프, 숫자 형식 등.
 */

/* ===================== 유틸 ===================== */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : "–");
function linspace(a, b, n) { const out = []; for (let i = 0; i < n; i++) out.push(a + (b - a) * i / (n - 1)); return out; }
const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
