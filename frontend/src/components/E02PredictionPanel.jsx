import { Cpu } from 'lucide-react';
import { Card, CardHeader } from './Card.jsx';
import { ErrorBox } from './StatusViews.jsx';
import { SkeletonLines } from './Skeleton.jsx';

const pct = (n) => Number.isFinite(Number(n))
  ? `${Number(n) > 0 ? '+' : ''}${Number(n).toFixed(2)}%` : '—';
const trendName = { UP: 'Tăng', DOWN: 'Giảm', SIDEWAYS: 'Đi ngang' };
const riskName = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao' };

export default function E02PredictionPanel({ state, symbol, onRetry }) {
  const { data, loading, error } = state;
  const rows = data?.predictions || [];
  const date = rows[0]?.as_of;
  return (
    <Card>
      <CardHeader title={`Lợi nhuận dự báo sau 5 phiên · ${symbol}`}
        subtitle="StockTrain E02 · dữ liệu dự báo đã lưu vào PostgreSQL"
        right={<Cpu size={16} className="text-forecast" />} />
      {loading && <div className="p-4"><SkeletonLines lines={3} /></div>}
      {error && <ErrorBox error={error} title="Không tải được dự báo E02" onRetry={onRetry} />}
      {!loading && !error && !rows.length && (
        <p className="p-4 text-sm text-muted">Chưa có dự báo lưu cho mã này. Kiểm tra daily_pipeline và PostgreSQL.</p>
      )}
      {rows.length > 0 && (
        <>
          <p className="px-4 py-2 text-xs text-muted">Ngày dữ liệu: {date} · Mục tiêu: lợi nhuận H5, không phải giá từng ngày</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[350px]">
              <thead><tr className="border-b border-line/70">
                <th className="th">Mô hình</th>
                <th className="th text-right">Lợi nhuận H5</th>
                <th className="th">Xu hướng</th>
              </tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.model} className="border-b border-line/40 last:border-0">
                    <td className="td text-xs">{p.model}</td>
                    <td className="td text-right font-semibold tabular-nums">{pct(p.predicted_return_percent)}</td>
                    <td className="td text-xs">{trendName[p.trend] || p.trend || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line/70 px-4 py-3 text-xs text-muted">
            Ngày mục tiêu ước lượng: {rows[0]?.target_date || '—'} (chưa trừ ngày nghỉ sàn).<br />
            Huấn luyện đến: {rows[0]?.trained_until || '—'}. Kết quả mang tính tham khảo, không đảm bảo lợi nhuận.
            Mức rủi ro nếu có là mô tả từ biến động lịch sử, không phải mô hình E10.
          </p>
        </>
      )}
    </Card>
  );
}
