const models = ['LinearRegression', 'RandomForest', 'XGBoost', 'SVM (SVR)', 'LSTM'];
const symbols = ['VNM', 'VCB', 'FPT', 'HPG', 'SSI'];
const rows = (value) => Array.isArray(value) ? value.filter((x) => x && typeof x === 'object') : [];
const date = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? value : 'chưa xác định';
const trend = (value) => ['UP', 'HOLD', 'DOWN'].includes(value) ? value : 'chưa xác định';
const percent = (value, scale = 1) => typeof value === 'number' && Number.isFinite(value) ? `${(value * scale).toFixed(4)}%` : 'chưa có';
export const FORECAST_NOTICE = 'Đây là kết quả mô hình; R2 backtest nhiều trường hợp âm, không phải khuyến nghị đầu tư.';
export const TRAINING_NOTICE = 'Các mô hình lợi suất E02 huấn luyện đến 2025-08-19; horizon 5 phiên.';

// Project only typed fields into prose. Tool strings, descriptions, warnings and instructions are never executed or sent to an LLM.
export function composeForecast(evidence) {
  const out = [];
  if (evidence.mcpPrediction) {
    const p = evidence.mcpPrediction;
    out.push(`Nguồn: MCP tính trực tiếp; as_of ${date(p.as_of)}; nguồn giá: ${['postgres', 'cache', 'vnstock'].includes(p.data_source) ? p.data_source : 'chưa xác định'}.`);
    for (const row of rows(p.results).slice(0, 5)) {
      if (models.includes(row.model)) out.push(`${row.model}: ${'error' in row ? 'chưa có kết quả' : `${trend(row.trend)}, lợi suất dự báo ${percent(row.predicted_return, 100)}`}.`);
    }
  }
  if (evidence.ranking) {
    out.push('Nguồn: MCP tính trực tiếp; xếp hạng theo lợi suất trung bình các mô hình.');
    for (const row of rows(evidence.ranking.ranking).slice(0, 5)) {
      if (symbols.includes(row.symbol)) out.push(`${row.symbol}: ${trend(row.majority_trend)}, ${percent(row.mean_return_percent)}; as_of ${date(row.as_of)}; nguồn giá ${['postgres', 'cache', 'vnstock'].includes(row.data_source) ? row.data_source : 'chưa xác định'}.`);
    }
    if (evidence.ranking.failed?.length) out.push(`Chưa có kết quả cho ${evidence.ranking.failed.length} mã.`);
  }
  if (evidence.stored) {
    out.push('Nguồn: dự báo đã lưu trong du_doan (daily pipeline), không phải lần tính MCP trực tiếp.');
    for (const row of rows(evidence.stored.predictions).slice(0, 5)) {
      if (models.includes(row.model)) out.push(`${row.model}: ${trend(row.trend)}, lợi suất dự báo ${percent(row.predicted_return, 100)}; ngày ${date(row.as_of)}.`);
    }
  }
  if (evidence.riskReturn) {
    const p = evidence.riskReturn;
    out.push(`Nguồn: risk-return đã lưu (daily pipeline); ngày ${date(p.as_of)}; dữ liệu lợi suất/biến động ${p.aligned === true ? 'cùng ngày' : 'chưa đồng bộ, không suy luận kết hợp'}.`);
    if (p.aligned === true && p.derived) out.push(`Trung vị lợi suất: ${percent(p.derived.return_median_pct)}; sigma 5 phiên: ${percent(p.derived.sigma_5d_pct)}.`);
  }
  if (evidence.volatility) {
    for (const row of rows(evidence.volatility.predictions).slice(0, 5)) out.push(`Nguồn: biến động E10 đã lưu (daily pipeline); ngày ${date(row.as_of)}; sigma ngày ${percent(row.predicted_volatility, 100)}. Không cho biết chiều tăng/giảm; ${row.is_stale === true ? 'dữ liệu đã cũ' : 'cần xét độ mới dữ liệu'}.`);
  }
  if (evidence.modelInfo) out.push(`MCP hiện có ${(Array.isArray(evidence.modelInfo.models_enabled) ? evidence.modelInfo.models_enabled : []).filter((x) => models.includes(x)).join(', ') || 'chưa có model'}; mã VNM, VCB, FPT, HPG, SSI.`);
  if (evidence.recentPrices) {
    for (const row of rows(evidence.recentPrices.rows).slice(-10)) if (typeof row.close === 'number' && Number.isFinite(row.close)) out.push(`Giá MCP: ${date(row.date)}, đóng cửa ${row.close}.`);
  }
  if (evidence.metrics) {
    const p = evidence.metrics;
    if (p.mean_metrics && typeof p.mean_metrics === 'object') {
      for (const split of ['validation', 'test']) {
        const metrics = p.mean_metrics[split] || p.mean_metrics[split === 'validation' ? 'val' : split];
        if (metrics && typeof metrics === 'object') for (const key of ['MAE', 'MSE', 'RMSE', 'R2', 'IC', 'DirAcc']) {
          const value = metrics[key] ?? metrics[key.toLowerCase()];
          if (typeof value === 'number' && Number.isFinite(value)) out.push(`${split} ${key}: ${value.toFixed(6)}.`);
        }
      }
    }
    if (models.includes(p.model)) out.push(`Backtest ${p.model}; huấn luyện đến ${date(p.trained_until)}; có ${Number.isInteger(p.folds) ? p.folds : 0} fold validation/test. Không có chỉ số train.`);
  }
  for (const message of evidence.forecastErrors || []) out.push(message);
  out.push(TRAINING_NOTICE, FORECAST_NOTICE);
  return out.join('\n');
}
