# Alpha AI và StockTrain MCP

React → Express `/api/chat` (requireAuth + CSRF hiện có) → kế hoạch tool cố định → MCP cục bộ / Flask → trả lời.
Không thêm function-calling. Không thêm route công khai. Không ghi DB hoặc lưu hội thoại. Frontend không gọi MCP.

## Cấu hình và khởi động

Biến backend: `MCP_URL`, `MCP_AUTH_TOKEN`. Không đặt secret trong mã hoặc tài liệu.
Biến MCP: `HOST`, `PORT`, `DATA_SOURCE`, `MCP_AUTH_TOKEN`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `ENABLE_MODELS`.

MCP nằm ngoài repo web tại `C:/Users/ACER/Desktop/stocktrain_mcp`.
Từ thư mục đó: `.venv\Scripts\python.exe start_local.py`.
Launcher ép loopback và PostgreSQL. `server.py` cũng kiểm tra loopback, token và nguồn PostgreSQL, warm-up FPT/all trước khi mở HTTP; dừng nếu warm-up lỗi. LSTM hiện chạy được; nếu tắt phải dùng `ENABLE_MODELS` và báo rõ.
Kết nối DB của data_provider đặt session read-only, không tạo role. Không cài vào `.venv-1` Flask.

Bộ requirements gốc không cài trọn trên Python 3.13 vì vnstock. Runtime dùng `requirements-postgres.txt` + `requirements-lstm.txt`, giữ nguyên các pin và bỏ vnstock không dùng. Python 3.10 thử riêng cũng thất bại với pin XGBoost. Không gọi vnstock khi chạy nguồn PostgreSQL; cache giá vẫn có thể được dùng nếu Postgres lỗi và có cache.

Backend dùng SDK `@modelcontextprotocol/sdk` ghim `1.32.1`, npm ghi ngày phát hành 2026-10-05. Node thực tế kiểm tra: 24.15.0.

## Tool, nguồn và trả lời

Allowlist MCP: `list_models_and_symbols`, `predict_stock`, `rank_stocks`, `get_recent_prices`, `get_model_metrics`.
`predict_with_custom_prices` không được đăng ký trong agent. Mọi URL/header/refresh/custom prices do người dùng đưa vào đều không được truyền sang MCP. Client chỉ chấp nhận HTTP loopback, đường dẫn `/mcp`, không query/credential; gửi Bearer, từ chối redirect.

MCP là nguồn dự báo chính. `get_lstm_prediction` giữ code nhưng không còn trong kế hoạch mặc định. Câu hỏi xếp hạng không cần mã; câu hỏi dự báo dùng predict_stock; các câu hỏi đã lưu, risk-return và biến động có kế hoạch riêng.
Tool thay thế các mục README thiếu: `get_stored_predictions`, `get_risk_return`, `get_volatility_forecast`, dùng GET Flask hiện có và cookie của người gọi. Không cache dự báo đã lưu giữa người dùng.

- MCP: tính trực tiếp, ghi `as_of` và nguồn giá thực tế; xếp hạng theo lợi suất trung bình các model.
- Đã lưu: ghi rõ `du_doan` / daily pipeline và ngày dữ liệu, không gắn nhãn tính trực tiếp.
- E10 là dự báo mức biến động, không phải chiều tăng/giảm. Risk-return chỉ trình bày kết hợp khi aligned.
- Mô hình lợi suất E02 huấn luyện đến 2025-08-19, horizon 5 phiên; R2 backtest nhiều trường hợp âm; không phải khuyến nghị đầu tư.
- Không đưa MUA/BÁN, Entry/SL/TP. Chỉ trình bày kết quả và nhãn UP/HOLD/DOWN.

Dự báo dùng composer xác định, chỉ lấy các trường số/ngày/enum cho phép; không đưa chuỗi tool vào LLM. LLM vẫn tùy chọn cho các câu hỏi khác, với system prompt coi evidence là dữ liệu và cấm khuyến nghị giao dịch. Không thể coi prompt đơn lẻ là bảo đảm chống mọi injection cho mọi nguồn tin ngoài dự báo.

## Deadline, cache và giới hạn

| Phạm vi | Giới hạn |
| --- | --- |
| predict_stock | 45 giây |
| rank_stocks | 60 giây |
| các MCP tool đọc khác | 10 giây |
| tool dịch vụ khác | 10 giây |
| LLM trong chat | 10 giây, nằm trong ngân sách tổng |
| runAgent sau xác thực | 75 giây tổng |

Deadline MCP gồm thời gian chờ lượt, kết nối và gọi tool; không reset khi có progress. Tối đa 2 lệnh đồng thời, hàng chờ tối đa 20. Cache dự báo/xếp hạng trong Express 180 giây, tối đa 100 mục, giữ nguyên as_of. Không cache lỗi; trả bản sao dữ liệu để tránh sửa cache qua tham chiếu.

Hết hạn trả tiếng Việt và phần dữ liệu đã nhận. HTTP SDK/LLM nhận tín hiệu hủy. Luồng tính toán Python đã vào thread có thể vẫn tiếp tục sau hủy HTTP; không tuyên bố hủy đã dừng CPU. Deadline 75 giây bắt đầu sau auth hiện có; thời gian kiểm tra auth và nhận body không nằm trong ngân sách agent. Đồng hồ JS chịu ảnh hưởng nếu event loop bị chặn.

## Bằng chứng ngày 2026-11-06

Trước sửa mã: predict_stock(all) từng VNM/VCB/FPT/HPG/SSI, 5 kết quả mỗi mã, đủ 25 predicted_return, không khóa error; tất cả postgres, as_of 2026-11-05.

| Phép đo đơn lẻ | Giây |
| --- | ---: |
| rank đầu tiên trên tiến trình lạnh, trước warm-up | 16.099 |
| rank lặp lại trên tiến trình đó | 3.570 |
| warm-up thử ban đầu | 6.323 |
| warm-up bản server.py cuối | 10.088 |
| SDK Express rank sau warm-up bản cuối | 2.635 |
| SDK Express FPT/all sau warm-up bản cuối | 0.450 |
| SDK Express rank lặp lại từ cache | dưới 0.001 theo độ phân giải báo cáo |

Lần rank cuối trả 5 mã và 5 nguồn postgres. SDK thật dùng Bearer thành công. `/health` 200 và không Bearer 401 đã kiểm tra ở Bước 1 và sau warm-up thử ban đầu.
Đây là mẫu đơn lẻ, không phải p95/p99, không phải benchmark tải. Lần lạnh chỉ có nghĩa tiến trình mới, không xóa cache hệ điều hành/ổ đĩa.

## Kiểm tra và phần chưa xác minh

`cd backend` rồi `node --test`: mock client/transport factory cho thành công, tắt, quá hạn cả connect, từ chối allowlist, cache TTL, giới hạn song song/hủy hàng chờ; test agent cho injection, trả phần dữ liệu còn có khi quá hạn, nhãn nguồn và router /api/chat 401.
Chưa chạy kịch bản đăng nhập thật và câu hỏi trong trình duyệt; dừng chờ xác nhận. Các endpoint Flask đã lưu chưa kiểm tra bằng phiên người dùng thật trong lượt này.
Frontend không thay đổi nên không chạy npm test frontend trong Bước 2.
Npm audit báo 3 mục (body-parser, follow-redirects, qs); không tự cập nhật dependency ngoài phạm vi.
