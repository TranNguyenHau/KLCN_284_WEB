# Risk/Return fixtures — G6, Lượt 2

## Nguồn dữ liệu và tính xác thực

- **THẬT**: `../risk-return/rr_FPT.json`, `rr_HPG.json`, `rr_VCB.json`, `rr_VNM.json`, `rr_SSI.json`, `rr_BAD.json`. Người dùng chụp từ backend thử nghiệm vào **26/10/2026** và đã đối chiếu SHA-256 gốc/bản sao trên máy Windows, tất cả khớp. Không chỉnh sửa byte của sáu file này. **Gói bàn giao KHÔNG kèm lại sáu file thật** để tránh ghi đè các bản đã kiểm hash.
- **TỔNG HỢP từ hợp đồng, chưa chụp từ DB thật**: toàn bộ file trong `synthetic/`. Chỉ sử dụng để thử trạng thái UI và thuật toán gộp/tách; không tuyên bố chúng là quan sát thực tế.
- `error_*.json` lưu thuộc tính Error sau interceptor, không phải HTTP body. Test ở Lượt 3 chỉ mock `api.riskReturnLatest`, `reject` Error với `status` và `code` không có `response`. Không mock `useApi`, i18n hoặc các component con.
- Mock không xác nhận interceptor, Vite proxy, Express hay Flask. Các phần này dùng log Bước 0 đã quan sát trực tiếp (27/10/2026).

## SHA-256 — đối chiếu gốc/bản sao từ log Windows

| File thật | SHA-256 bản gốc | SHA-256 bản sao | Kết quả |
|---|---|---|---|
| rr_FPT.json | `494120C8A33C621F292536A4F8FB8834F6B46DAE15C1D772752E83C0FC82421C` | `494120C8A33C621F292536A4F8FB8834F6B46DAE15C1D772752E83C0FC82421C` | Khớp |
| rr_HPG.json | `B882347B845E5732BBD948DB436024E4FEB4476FAA212FE6FEC3792E0707A745` | `B882347B845E5732BBD948DB436024E4FEB4476FAA212FE6FEC3792E0707A745` | Khớp |
| rr_VCB.json | `3660C3F584E939367ECE71F837E69808E68AD151CDB94A44E3340C2DD9E02543` | `3660C3F584E939367ECE71F837E69808E68AD151CDB94A44E3340C2DD9E02543` | Khớp |
| rr_VNM.json | `E4169CB312321F67D4D2D08281C6262F3540E9F302140373712106DCDD970058` | `E4169CB312321F67D4D2D08281C6262F3540E9F302140373712106DCDD970058` | Khớp |
| rr_SSI.json | `A1B020B628D29FEF4E035C475F3215B25771AA0DC5D96B24CA4BAA8012604EB6` | `A1B020B628D29FEF4E035C475F3215B25771AA0DC5D96B24CA4BAA8012604EB6` | Khớp |
| rr_BAD.json | `E57AF6D0DEF3C0FD5368025739DE8F58F6D145F373348908387D06A46FD0C12F` | `E57AF6D0DEF3C0FD5368025739DE8F58F6D145F373348908387D06A46FD0C12F` | Khớp |

## Danh mục tổng hợp

- `reason_*.json`: đủ 5 reason thực tế và một reason lạ. `mismatch_e02_dates.json`: `AS_OF_MISMATCH` với ngày E02 không đồng nhất, không có context/derived.
- `error_400/401/404/502/503/504/unknown/network/timeout/timeout_etimedout.json`: các ca HTTP và lỗi axios. **TỔNG HỢP từ hợp đồng, chưa chụp từ DB thật**.
- `empty_*`: 200 không có dữ liệu hợp lệ, có cả `aligned:true` nhưng `e02.predictions=[]`.
- `loading_state_marker.json`: đánh dấu trạng thái loading của UI, **không phải payload backend**.
- `age_weekdays_0/3/5.json`: thay đúng trường `age_weekdays`, không gọi đồng hồ, không dùng Date.now().
- `split_*.json`: mỗi fixture chỉ làm khác một trường dùng chung E02 tại mô hình thứ 3; `split_descriptive_risk.json` chỉ khác một số rất nhỏ trong nested dict.
- `context_null.json`, `derived_null.json`, `used_latest_e10_false.json`, `defensive_aligned_stale.json`, `warnings_mixed.json`: những trường hợp phòng thủ và độ phủ dữ liệu hiếm gặp.

## Thực tế đã quan sát so với chưa kiểm

**27/10/2026**: năm mã trả 200 qua Express 4011 (đo lại FPT và HPG qua Express 4011 và Vite 5173 ngày 28/10/2026 lúc 14:37, lặp lại lúc 15:38: 200, aligned=true); FPT trả 200 qua Vite 5173 với proxy tới 4011; symbol BAD/XXX trả 400; Flask tắt → Express 502; Express tắt → Vite 500 rỗng. Trên dữ liệu live (đo 28/10/2026), `age_weekdays=4`; trên sáu fixture chụp **26/10/2026**, các mã hợp lệ đều có `age_weekdays=2`. Đo lại 29/10 (Express 4011): 5 mã đều 200, as_of=2026-10-22, age_weekdays=5 lúc 15:21; ảnh card FPT/HPG (VI/EN) lúc 17:39–17:42.

**Chưa kiểm trực tiếp**: Vite chuyển tiếp 502, 503/504 thật, timeout 90s, network error không có status, năm reason `aligned:false`, CORS, hành vi mới của `api.riskReturnLatest` sau interceptor. Không chuyển các nhánh tổng hợp thành bằng chứng DB thật.
