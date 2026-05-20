// 天気予報モジュール
// データソース：Open-Meteo (https://open-meteo.com/) — 無料 / API キー不要 / CORS OK
// 設定された地点 (lat, lng) を localStorage から取得し、今日 / 明日 / 明後日 の
// 降水量と最大風速、気温、天候コードを画面右上に表示する。

const API_URL = 'https://api.open-meteo.com/v1/forecast';
const SETTINGS_KEY = 'crane_app_settings';

// WMO Weather interpretation code → 絵文字 + 短い日本語
const WMO = {
    0:  ['☀️', '快晴'],
    1:  ['🌤️', 'おおむね晴'],
    2:  ['⛅', '所により曇'],
    3:  ['☁️', '曇り'],
    45: ['🌫️', '霧'],
    48: ['🌫️', '霧氷'],
    51: ['🌦️', '霧雨 弱'],
    53: ['🌦️', '霧雨 中'],
    55: ['🌦️', '霧雨 強'],
    56: ['🌧️', '着氷霧雨 弱'],
    57: ['🌧️', '着氷霧雨 強'],
    61: ['🌧️', '雨 弱'],
    63: ['🌧️', '雨 中'],
    65: ['🌧️', '雨 強'],
    66: ['🌧️', '着氷性の雨 弱'],
    67: ['🌧️', '着氷性の雨 強'],
    71: ['🌨️', '雪 弱'],
    73: ['🌨️', '雪 中'],
    75: ['🌨️', '雪 強'],
    77: ['🌨️', '霧雪'],
    80: ['🌦️', 'にわか雨 弱'],
    81: ['🌧️', 'にわか雨 中'],
    82: ['⛈️', 'にわか雨 激'],
    85: ['🌨️', 'にわか雪 弱'],
    86: ['🌨️', 'にわか雪 強'],
    95: ['⛈️', '雷雨'],
    96: ['⛈️', '雷雨 + 雹 弱'],
    99: ['⛈️', '雷雨 + 雹 強']
};

const DAY_LABELS = ['今日', '明日', '明後日'];

function loadLocation() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        return s.location || {};
    } catch {
        return {};
    }
}

async function fetchForecast(lat, lng) {
    const url = `${API_URL}?latitude=${lat}&longitude=${lng}` +
        `&daily=weather_code,precipitation_sum,wind_speed_10m_max,temperature_2m_max,temperature_2m_min` +
        `&timezone=auto&forecast_days=3&wind_speed_unit=ms`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function rainColor(mm) {
    if (mm >= 10) return 'text-red-400';
    if (mm >= 3)  return 'text-yellow-300';
    return 'text-slate-200';
}

function windColor(ms) {
    if (ms >= 10) return 'text-red-400';
    if (ms >= 7)  return 'text-yellow-300';
    return 'text-slate-200';
}

function renderEmptyState(message) {
    document.getElementById('weather-location').textContent = '';
    document.getElementById('weather-content').innerHTML =
        `<div class="text-xs text-slate-400">${message}</div>`;
}

function renderLoading() {
    document.getElementById('weather-content').innerHTML =
        '<div class="text-xs text-slate-400">取得中…</div>';
}

function renderError(msg) {
    document.getElementById('weather-content').innerHTML =
        `<div class="text-xs text-red-400">取得失敗: ${msg}</div>`;
}

function renderForecast(loc, data) {
    document.getElementById('weather-location').textContent =
        `${loc.siteName || '現場'} (${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)})`;

    const d = data.daily;
    const html = d.time.slice(0, 3).map((_, i) => {
        const code = d.weather_code[i];
        const [icon, label] = WMO[code] || ['❔', '—'];
        const precip = d.precipitation_sum[i] ?? 0;
        const wind   = d.wind_speed_10m_max[i] ?? 0;
        const tmin   = d.temperature_2m_min[i];
        const tmax   = d.temperature_2m_max[i];

        return `
            <div class="flex items-center gap-2 text-sm py-2 border-t border-slate-700 first:border-t-0 first:pt-0">
                <div class="w-12 text-yellow-300 font-bold">${DAY_LABELS[i]}</div>
                <div class="text-2xl leading-none">${icon}</div>
                <div class="flex-1 min-w-0">
                    <div class="text-xs text-slate-400 truncate">${label}</div>
                    <div class="text-xs">🌡 ${Math.round(tmin)} / ${Math.round(tmax)}°C</div>
                </div>
                <div class="text-right text-xs leading-tight whitespace-nowrap">
                    <div class="${rainColor(precip)}">💧 ${precip.toFixed(1)} mm</div>
                    <div class="${windColor(wind)}">💨 ${wind.toFixed(1)} m/s</div>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('weather-content').innerHTML = html;
}

let _inflight = null;

export async function updateWeather() {
    const loc = loadLocation();

    if (loc.lat == null || loc.lng == null) {
        renderEmptyState('⚙️ 設定で地点を登録すると予報が表示されます');
        return;
    }

    renderLoading();

    try {
        // 短時間の連打を抑止（同じ in-flight があれば共有）
        if (!_inflight) {
            _inflight = fetchForecast(loc.lat, loc.lng).finally(() => { _inflight = null; });
        }
        const data = await _inflight;
        renderForecast(loc, data);
    } catch (e) {
        renderError(e.message);
        console.error('[weather]', e);
    }
}

// 手動更新ボタン
export function attachWeatherRefresh() {
    const btn = document.getElementById('weather-refresh');
    if (btn) btn.addEventListener('click', updateWeather);
}
