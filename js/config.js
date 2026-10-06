"use strict";
/*
 * config.js — 기본값
 * 레이저 목록, 후보 Λ 간격, 오븐 온도 범위의 기본값. 값을 바꾸려면 이 파일만 수정하면 됩니다.
 */

/* ===================== 기본값 ===================== */
// 처음 화면에 나오는 레이저 (이름, 중심 파장 [nm])
const DEFAULT_LASERS = [
  { name: "hgkim 60 mW", wl: 404.88117 },
  { name: "hgkim 73 mW", wl: 404.95805 },
];
// step: 후보 Λ 간격 [μm], tMin/tMax: 오븐 사용 온도 [°C], tTarget: 선호 온도 [°C]
const DEFAULT_SETTINGS = { step: 0.75, tMin: 20, tMax: 100, tTarget: 40 };
// 레이저 색 (css/style.css의 --l1 ~ --l6). 레이저는 최대 이 개수까지 추가 가능
const LASER_COLORS = ["--l1", "--l2", "--l3", "--l4", "--l5", "--l6"];
// 그래프별 x축 확대/축소 슬라이더 (왼쪽 끝 = min: 확대, 오른쪽 끝 = max: 축소, 처음 값 = default)
//   qpm, all : 레이저 파장 범위 양옆으로 보여줄 여백 [nm]
//   period   : 오븐 사용 온도 범위의 가운데를 기준으로 한 반폭 [°C]
//   example  : 예시 중심 파장(EXAMPLE.center)을 기준으로 한 반폭 [nm]
const ZOOM = {
  qpm:     { min: 0.02, max: 10,  default: 0.3, unit: "nm" },
  all:     { min: 0.1,  max: 40,  default: 8,   unit: "nm" },
  period:  { min: 5,    max: 200, default: 100, unit: "°C" },
  example: { min: 0.05, max: 5,   default: 0.5, unit: "nm" },
};

// '예시' 탭에 그리는 조건
//   center: 기본 보기의 가운데 펌프 파장 [nm] (기본 보기 = center ± ZOOM.example.default)
//   periods: 그릴 Λ [μm], markedPeriod: 0.1 nm 간격으로 점을 찍을 Λ [μm], T: 세로축 온도 범위 [°C]
const EXAMPLE = { center: 403.5, periods: [9.65, 9.70, 9.75, 9.80, 9.85], markedPeriod: 9.75, T: [0, 80] };

// 브라우저에 입력값을 저장할 때 쓰는 이름
const STORAGE_KEY = "qpm-poling-state-v2";
const WL_RANGE = [350, 500];   // 입력 허용 펌프 파장 [nm]
