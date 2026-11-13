# Phòng tương tác trên lớp

Học sinh quét mã QR, chọn tên mình trong danh sách lớp, rồi **giơ tay xin phát biểu** và **trả lời câu hỏi nhanh** (A-D hoặc trả lời ngắn).
Giáo viên điều khiển ngay trong chế độ "Lên lớp" của Hồ sơ dạy học số (nút **Phòng QR**).

## Đưa lên Render (một lần)
1. Tạo repository GitHub mới tên `phong-tuong-tac`, đưa toàn bộ thư mục này lên (server.js, package.json, render.yaml, thư mục public).
2. Vào render.com, **New > Blueprint**, chọn repository. Ô `TEACHER_PASS`: nhập mật khẩu giáo viên. Bấm Deploy.
3. Render cho địa chỉ dạng `https://phong-tuong-tac.onrender.com`.
4. Điền địa chỉ đó vào `tuongTac` trong `nguon/config.js` của Hồ sơ dạy học số, chạy `node tools/dong_goi.js` (hoặc để trống, lần đầu bấm "Phòng QR" hồ sơ sẽ hỏi).

## Chạy thử trên laptop (cùng Wi-Fi)
`set TEACHER_PASS=abc` rồi `node server.js`. Dùng địa chỉ `http://<IP laptop>:3000` làm địa chỉ máy chủ.

## Trong tiết học
1. Mở bài > Dạy ngay > chọn lớp > **Phòng QR**. Màn hình hiện mã 4 số và mã QR (bấm vào QR để phóng to).
2. Học sinh quét QR, chọn tên, bấm Vào lớp.
3. Học sinh giơ tay: tên hiện trong danh sách. Bấm **Gọi** thì điện thoại em đó báo "đang gọi em", rồi chấm +1 / +0,5 / 0 như thường.
4. "Gọi tên" ngẫu nhiên cũng báo lên điện thoại em được gọi.
5. **Câu hỏi nhanh** gửi câu hỏi cho cả lớp, thấy ngay số em đã trả lời và tỉ lệ A-D.
6. Cuối tiết bấm **Kết thúc phòng và lưu có mặt**: danh sách có mặt và số câu đã trả lời được lưu vào Hồ sơ (trang Lớp học, có xuất CSV).

## Cần biết
- Gói miễn phí của Render tự ngủ sau ~15 phút không dùng; mở "Phòng QR" trước giờ học vài phút. Máy chủ khởi động lại thì phòng đang mở có thể mất, nhưng dữ liệu đã lưu trong Hồ sơ thì không.
- Mỗi tên chỉ vào được bằng một thiết bị; thiết bị khác chọn trùng tên sẽ bị chặn.
- Phòng tự xóa sau 12 giờ. Máy chủ chỉ giữ tên trong danh sách lớp gửi lên, không lưu thông tin khác.
