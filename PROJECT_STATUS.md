# PROJECT STATUS — Domino Online

## Game
Domino Online (kiểu Miền Nam). Node/Express + Socket.io (server) + vanilla JS (client).

## Trạng thái hiện tại (2026-08-08)

### ĐÃ HOÀN THÀNH

#### Phase 3 — Chọn A/B trên bàn + Tạm dừng/Ready + Bảng tổng kết/Tiếp tục (mới)
1. **Chọn A/B bấm trực tiếp trên bàn**: khi 1 quân nối được cả 2 đầu khác số, bỏ popup cũ. Người chơi bấm quân trên tay (tô xanh `pick-pending`), rồi bấm **nhánh A/B hiện trên ban** (nổi lên, nhấp nháy, phóng to) để đánh vào đầu đó. Nhánh trùng số vẫn đánh mặc định không cần hỏi.
   - Server `game.js`: thêm `startSeat` vào `game` (làm tie-break xếp hạng block).
2. **Tạm dừng + Ready đồng bộ cả phòng** (mọi lý do: bấm tay, mất kết nối):
   - `rooms.js` thêm `room.ready` (Set seat), `markDisconnected` trả `bool` (true nếu thực sự từ connected→offline).
   - `index.js` bỏ auto-advance (NEXT_ROUND_DELAY); thêm `allConnectedHumansReady` — resume chỉ khi **mọi người thật đang kết nối đều đã bấm "Sẵn sàng"**; bot/ghế trống luôn sẵn sàng; **người đang offline không khóa (không thể bấm); reconnect phải bấm lại**.
   - Event `pause` (đổi tên bỏ `resume`, dùng `ready` chung); `disconnect` tự pause nếu đang chơi. UI: nút tạm dừng → "✅ Sẵn sàng", đối thủ hiện chấm xanh/đỏ ready.
3. **Kiểu chặn xếp hạng theo điểm tay** (`gameEngine.resolveBlockRanking`): số điểm tay càng thấp hạng càng cao; hòa → ai tới lượt sớm hơn (offset từ `startSeat`) hạng cao hơn. Nhất +2, nhì +1, ba -1, chót -2 (tích lũy vào `room.scores`, tổng sau mỗi ván = 0). Gọi cho mọi cách kết thúc ván (hết bài / bị chặn) khi `mode='block'`.
4. **Bảng tổng kết + nút "Tiếp tục" cho MỌI biến thể & cả 2 mode**: overlay sau ván hiện xếp hạng (vị trí, người chơi, điểm tay, +/- , tổng tích lũy) + nút **Tiếp tục** để vào ván mới (thay auto-advance). Match kết thúc → chỉ còn "Chơi lại".

### ĐÃ HOÀN THÀNH (các phase trước)
- **5 biến thể luật**: Block, Draw (nọc), Muggins (ăn 5), All Threes (ăn 3), Bergen, Matador.
- **Phase 1 UI game** (commit `7c8c03c`): nút tạm dừng cả phòng (dừng đếm giờ + bot auto), cảnh báo `beforeunload` khi rời trang giữa ván, hiển thị điểm/số ván thắng cạnh tên người chơi, khôi phục phiên qua localStorage token.
- **Phase 2 — Sửa bug bàn xoắn ốc + nút tạm dừng** (commit `08f2ecc`, `75c6a5f`):
  1. Bàn xoắn ốc: **nhánh B không còn đè lên chính nó**. Viết lại `computeSpiralLayout` — theo dõi worst-overlap từng quân, chặn rẽ vào trong bằng cách kiểm tra sức chứa ring còn lại (hệ số an toàn **5.0**), thêm escape-mode để nhánh B đi vòng quanh quân cũ khi ring cạn.
  2. Nút tạm dừng: **không còn đè lên quân bài**. Chuyển từ hand-area lên room-header (flex row), xóa CSS absolute-positioning cũ.
  3. Giảm lãng phí không gian ở góc rẽ: margin trong `overflows()` (điều kiện quyết định "còn đi thẳng được không") giảm từ `thin*1.35` xuống **`thin*0.5`** (nửa bề rộng quân) — trước đó rẽ sớm không cần thiết, để trống cả 1 khoảng hình chữ nhật lớn ở góc (VD nhánh B chỉ đi 4 quân rồi dừng giữa chừng thay vì đi gần sát mép). `worstOverlap()` vẫn là lưới chặn hình học cuối cùng nên margin nhỏ hơn không làm tái xuất hiện overlap.
  - Test cả 2 vòng: 1120 kịch bản (n=1..28, tỷ lệ khung ngẫu nhiên) + 12 biên cực + browser thật tới 17-18 quân → **0 overlap** mỗi lần.

### CẤU TRÚC QUAN TRỌNG
- `computeSpiralLayout` (public/client.js, dòng ~385) — xoắn ốc 4 hướng, ring thu nhỏ trừu tượng, chống overlap = worstOverlap (hình học thật, chốt chặn cuối) + interiorCapacity (hệ số 5.0, chặn rẽ vào trong khi không đủ chỗ) + margin rẽ sớm nhỏ (thin*0.5). Chỉ được gọi từ `renderSnakeBoard`.
- Server: `server/index.js` (socket), `game.js`, `gameEngine.js` (luật thuần), `rooms.js`, `bot.js`.

### RÀNG BUỘC / LƯU Ý
- **Port 3000 hiện bị một app Next.js khác chiếm** — server domino mặc định 3000, cần khởi động bằng `PORT=<khác> node server/index.js` để test (đã test trên 3999, 3010, 3011).
- Luôn trả lời bằng tiếng Việt có dấu. Commit+push sau khi tự xác minh; hỏi trước với git op rủi ro cao.
- Test hình học thuần: trích xuất khối `spiralBox`..`computeSpiralLayout` từ client.js (không cần DOM) để test overlap ngoài browser nhanh — cách này đã dùng nhiều lần, hiệu quả hơn test browser cho việc kiểm chứng thuật toán.
- Có file test cục bộ `test-ui.js` (Playwright) + `qa_log.json` — tái sử dụng khi cần UI-test lại toàn bộ feature (pause/ready/ranking/continue). Playwright/socket.io-client cài qua `--no-save`, không phụ thuộc package.json.
- **Lưu ý resume sau disconnect**: nếu 1 người đang offline, 3 người còn lại (kể cả bot) có thể bấm ready để tiếp tục; người đó chỉ cần bấm ready khi reconnect. Người reconnect phải tự bấm "Sẵn sàng" — không auto-resume.

### TODO (tương lai, chưa lên lịch)
- Số người chơi 2/4 tùy chọn theo biến thể (đã bàn, chưa làm).
- Có thể thêm các biến thể double-9/12, Mexican Train.
