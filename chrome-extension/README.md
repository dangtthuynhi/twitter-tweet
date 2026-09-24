# X Auto Poster — Chrome extension

Bản đóng gói của [../browser-script/x-auto-poster.user.js](../browser-script/x-auto-poster.user.js), chạy như extension riêng thay vì qua Tampermonkey/Violentmonkey.

## Vì sao dùng bản này

Chrome đã bỏ Manifest V2 (giữa 2025). Tampermonkey và Violentmonkey vẫn chạy được nhưng phải bật thêm quyền *"Allow user scripts"* cho từng extension, vì MV3 siết chặt việc chạy mã do người dùng cung cấp.

Content script trong extension **của chính bạn** thì không dính hạn chế đó — đây là cơ chế bình thường của MV3. Đổi lại bạn không cần cài extension của bên thứ ba nào.

**Quan trọng hơn:** X đặt CSP rất chặt và chặn script chèn vào page context — đây là lý do Tampermonkey hay không chạy được trên X. Content script của extension chạy trong **isolated world**, CSP của trang không áp lên nó, nên bản này miễn nhiễm với vấn đề đó.

## Cài

1. Mở `chrome://extensions`
2. Bật **Developer mode** (góc trên phải)
3. Bấm **Load unpacked**
4. Chọn thư mục `chrome-extension/` này
5. Mở **x.com** — bảng điều khiển hiện ở góc dưới phải

Extension chỉ chạy trên `x.com` và `twitter.com`, không xin quyền nào khác — xem [manifest.json](manifest.json), nó chỉ có đúng một khối `content_scripts`.

## Sửa script

Đừng sửa `content.js` — nó được sinh ra tự động. Sửa file gốc rồi build lại:

```bash
# sua browser-script/x-auto-poster.user.js
npm run build:ext
```

Rồi vào `chrome://extensions` bấm nút **Reload** (↻) trên thẻ extension, và tải lại tab X.

## Dùng

Giống hệt bản userscript — xem [../browser-script/README.md](../browser-script/README.md).

---

Làm bởi **dangtthuynhi** — https://github.com/dangtthuynhi/twitter-tweet
