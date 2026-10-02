# Hướng dẫn sử dụng X Auto Poster

## 1. Công cụ này làm gì

Tự đăng bài lên X (Twitter) theo lịch.

Bạn nhập **nhãn** (hashtag) và **số bài muốn đăng**. Nội dung thì công cụ tự bốc ngẫu nhiên từ kho 10.000 câu có sẵn — mỗi bài một câu khác nhau, không bài nào trùng bài nào.

Cần biết trước:

- **Phải giữ tab X mở và máy bật.** Đóng tab hoặc tắt máy là nó dừng.
- **Nên để tab X hiện trên màn hình.** Chrome làm chậm các tab bị che khuất, nên để tab X chạy ngầm phía sau thì công cụ dễ đăng hụt. Tốt nhất mở X ở một cửa sổ riêng và để nó nằm đó.
- **Đăng bằng chính tài khoản bạn đang đăng nhập.** Không cần nhập mật khẩu vào đâu cả.

---

## 2. Cài đặt

### Tải về

Vào **https://github.com/dangtthuynhi/twitter-tweet**, bấm nút xanh **`< > Code`** ở trên bên phải, chọn **"Download ZIP"**.

> Nhanh hơn: dán link này vào thanh địa chỉ, file tải ngay
> `https://github.com/dangtthuynhi/twitter-tweet/archive/refs/heads/master.zip`

Giải nén vào một thư mục cố định, ví dụ trong **Tài liệu** (Documents).

> **Đừng để trong thư mục Tải xuống.** Chrome đọc trực tiếp từ thư mục này mỗi lần bạn mở X — lỡ tay xoá đi dọn dẹp là công cụ ngừng chạy.

Mở thư mục vừa giải nén, tìm thư mục con tên **`chrome-extension`**. Chỉ cần đúng thư mục này, bên trong phải có:

```
content.js
content-lenamiu.json
manifest.json
```

### Cài vào Chrome

1. Gõ `chrome://extensions` vào thanh địa chỉ rồi Enter *(phải gõ tay, Google không tìm ra)*
2. Bật công tắc **"Chế độ dành cho nhà phát triển"** ở góc trên bên phải
3. Bấm **"Tải tiện ích đã giải nén"**, chọn thư mục **`chrome-extension`**

> Chọn *cả thư mục*, đừng mở nó ra rồi chọn file bên trong.

Hiện ra ô **"X Auto Poster 1.0.0"** là xong.

Mở **x.com**, đợi khoảng 2 giây, bảng điều khiển màu xám đậm hiện ở **góc dưới bên phải**. Không thấy thì nhấn **F5**.

---

## 3. Cách dùng

> **1.** Gõ nhãn vào ô lớn trên cùng
> **2.** Nhập số bài muốn đăng
> **3.** Bấm **"Bắt đầu"**
> **4.** Để yên đó

### Nhãn

**Mỗi dòng một nhãn**, và **tất cả các dòng nằm chung trong mọi bài đăng**:

```
LENAMIU AT FLEX
#Flex1045xPLSLoveรักได้ไหม
#LenaMiu #ลีน่าหมิว
```

Ba dòng trên **không** thành ba bài. Chúng là một cụm, gắn vào từng bài một.

Gõ gì cũng được — chữ hoa, chữ thường, tiếng Thái, emoji. Không bắt buộc có dấu `#`.

### Bài đăng ra trông thế nào

```
LenaMiu's warmth brightens my whole week 🌟     ← câu bốc ngẫu nhiên
22:16 02-10-2026                                ← ngày giờ
LENAMIU AT FLEX                                 ← nhãn của bạn
#Flex1045xPLSLoveรักได้ไหม
#LenaMiu #ลีน่าหมิว
```

### Các ô cài đặt

| Ô | Nghĩa |
|---|---|
| **Số tweet muốn đăng** | Soạn sẵn bao nhiêu bài |
| **Cách nhau ... đến ... phút** | Chờ ngẫu nhiên trong khoảng này giữa hai bài |
| **Tối đa ... bài/ngày** | Đủ số này thì nghỉ tới hôm sau |
| **Chỉ đăng từ ... đến ... giờ** | Khung giờ được phép đăng. Để 7–23 thì không đăng lúc nửa đêm |
| **Nhịp tự nhiên** | Nên bật. Làm khoảng cách giống người thật hơn |
| **Lặp lại** | Hết danh sách thì quay lại từ đầu. Thường nên tắt |

### Chạy

Bấm nút xanh **"Bắt đầu"**. Dòng giữa bảng đổi thành:

```
● Đang chạy — bài kế tiếp sau 2:18
Đã đăng 0/100 · hôm nay 0 bài
```

Tới giờ, màn hình tự mở ô soạn bài, tự gõ và tự đăng. **Đừng đụng chuột lúc đó**, để nó làm xong khoảng 5 giây.

> Khoảng cách giữa hai bài có thể tới vài phút, im lìm một lúc là bình thường. **Đừng bấm "Bắt đầu" thêm lần nữa** — cứ nhìn số đếm ngược.

**Đổi nhãn:** bấm **"Dừng"**, sửa nhãn, bấm **"Bắt đầu"** lại. Chỉnh các ô thời gian thì không cần dừng.

**Dừng:** bấm nút đỏ **"Dừng"** bất cứ lúc nào.

---

## 4. Tìm bài để retweet

Bấm **"🔎 Tìm theo từ khoá"** để mở ra.

Nhập từ khoá (ví dụ `#dulich`), các từ muốn loại trừ, số like tối thiểu *(đặt 5–10 để lọc bài rác)*, rồi bấm **"Tìm ngay"**.

Để **"Duyệt tay trước"** bật. Công cụ đưa danh sách bài tìm được, mỗi bài bạn bấm **Lấy** / **Bỏ** / **xem**.

---

## 5. Nên biết

**Đừng đăng quá nhiều.** Công cụ để sẵn 100 bài/ngày cách nhau 1–4 phút — đó là số chạy thử. Dùng lâu dài nên hạ xuống: ít bài hơn, giãn cách vài chục phút. X cũng chỉ cho khoảng 50 bài/ngày với tài khoản thường.

**Retweet hàng loạt là vi phạm.** X cấm rõ việc này — đó là lý do nên để "Duyệt tay trước" bật.

**Công cụ chỉ chạy trên X.** Không đụng tới trang nào khác, không lấy mật khẩu.

---

## 6. Khi gặp trục trặc

**Không thấy bảng điều khiển** — Kiểm tra đang ở đúng x.com → nhấn F5 → vào `chrome://extensions` xem ô "X Auto Poster" còn bật không.

**Bấm Bắt đầu mà báo hàng đợi trống** — Bạn chưa nhập nhãn.

**Bấm Bắt đầu rồi mà mãi không đăng** — Nhìn số đếm ngược giữa bảng. Đang đếm thì cứ để yên.

**Đang chạy thì tự dừng** — Xem dòng cuối khung nhật ký ở đáy bảng: đủ số bài hôm nay thì đợi mai, hết bài thì nhập nhãn mới.

**X chặn không cho đăng** — Thỉnh thoảng X hiện hộp thoại bắt xác minh. Mở x.com tự tay đăng thử một bài, làm xong yêu cầu của X rồi bấm "Bắt đầu" lại. Vẫn hỏng thì nghỉ vài tiếng và hạ số bài/ngày xuống.

**Nhật ký nhắc tới `content-lenamiu.json`** — Thiếu file kho câu. Kiểm tra thư mục `chrome-extension` có file đó không, thiếu thì giải nén lại rồi vào `chrome://extensions` bấm **Tải lại** (↻).

**Muốn dùng lại các câu đã đăng** — Bấm **"Xoá lịch sử"**. Thường không cần, vì 10.000 câu là rất nhiều.

---

## 7. Hỏi đáp

**Các bài có trùng nội dung nhau không?**
Không. Công cụ nhớ những câu đã dùng nên không lấy lại.

**Tắt máy hoặc đóng tab X thì sao?**
Nó dừng. Mở lại x.com rồi bấm "Bắt đầu" là chạy tiếp. Nhãn và cài đặt vẫn còn.

**Dùng máy làm việc khác được không?**
Được, nhưng đừng để tab X bị che khuất quá lâu — Chrome làm chậm các tab chạy ngầm và công cụ sẽ đăng hụt. Cách gọn nhất là mở X ra một cửa sổ riêng, để nó ở một góc màn hình.

**Có mất phí không?**
Không.

**Dùng cho nhiều tài khoản được không?**
Công cụ đăng bằng tài khoản đang đăng nhập. Muốn đổi thì đăng xuất rồi đăng nhập tài khoản khác.

**Lỡ xoá thư mục đã giải nén?**
Giải nén lại vào thư mục cố định rồi cài lại theo phần 2. Nhãn và cài đặt không mất.

**Có bản mới thì cập nhật thế nào?**
Tải lại zip, giải nén đè lên thư mục cũ, vào `chrome://extensions` bấm **Tải lại** (↻), rồi tải lại tab X.

**Gỡ công cụ đi thế nào?**
Vào `chrome://extensions`, tìm ô "X Auto Poster", bấm **"Xoá"**.
