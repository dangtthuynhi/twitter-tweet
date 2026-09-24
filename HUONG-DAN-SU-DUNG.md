# Hướng dẫn sử dụng X Auto Poster

Tài liệu này dành cho người dùng bình thường. Bạn không cần biết gì về lập trình.

---

## 1. Công cụ này làm gì

Nó giúp bạn **đăng bài lên X (Twitter) tự động theo lịch**.

Bạn soạn sẵn một danh sách bài, cài đặt bao lâu đăng một bài, rồi bấm nút bắt đầu. Sau đó cứ để yên — nó tự đăng từng bài một, cách nhau đúng khoảng thời gian bạn đặt.

Nó cũng có thể **tự động retweet** các bài của người khác, kể cả tìm bài theo từ khoá.

### Vài điều cần biết trước

**Phải giữ tab X mở.** Công cụ này chạy ngay bên trong trình duyệt của bạn. Đóng tab X là nó dừng. Bạn vẫn mở tab khác, làm việc khác bình thường — chỉ cần đừng đóng tab X là được.

**Máy tính phải bật.** Máy tắt hoặc ngủ thì nó cũng dừng.

**Nó đăng bằng chính tài khoản bạn đang đăng nhập.** Không cần nhập mật khẩu vào đâu cả.

---

## 2. Tải về và giải nén

Bạn sẽ nhận được một file tên **`X-Auto-Poster.zip`** (qua Zalo, email, hoặc link tải).

File `.zip` là một file nén — giống như một cái hộp đựng nhiều file bên trong. Phải **mở hộp ra** trước khi dùng được.

### Bước 1 — Tải file về

Bấm vào file được gửi để tải. Chrome sẽ tự lưu vào thư mục **Tải xuống** (Downloads) trên máy bạn.

Tải xong, bạn thấy nó hiện ở góc dưới màn hình Chrome, hoặc bấm biểu tượng mũi tên ⬇ ở góc trên bên phải để xem.

### Bước 2 — Tạo chỗ để cất

Trước khi giải nén, hãy tạo một thư mục cố định để cất công cụ này.

**Cách dễ nhất:** mở thư mục **Tài liệu** (Documents), tạo một thư mục mới tên `X-Auto-Poster`.

> Tại sao cần bước này? Vì sau khi cài, Chrome sẽ **đọc trực tiếp từ thư mục đó mỗi lần bạn mở X**. Nếu để trong thư mục Tải xuống rồi lỡ tay xoá đi dọn dẹp, công cụ sẽ ngừng hoạt động. Để ở Tài liệu thì an toàn hơn nhiều.

### Bước 3 — Giải nén

**Trên Windows:**

1. Mở thư mục Tải xuống, tìm file `X-Auto-Poster.zip`
2. Bấm **chuột phải** vào file → chọn **"Extract All..."** (hoặc "Giải nén tất cả")
3. Một cửa sổ hiện ra hỏi giải nén vào đâu — bấm **Browse** và chọn thư mục `X-Auto-Poster` bạn vừa tạo ở Tài liệu
4. Bấm **Extract**

**Trên Mac:**

1. Mở thư mục Tải xuống (Downloads)
2. **Bấm đúp** vào file `X-Auto-Poster.zip` — máy tự giải nén ngay cạnh đó
3. Kéo thư mục vừa hiện ra vào thư mục `X-Auto-Poster` ở Tài liệu

### Bước 4 — Kiểm tra đã đúng chưa

Mở thư mục vừa giải nén, bạn phải thấy **một thư mục tên `chrome-extension`**, và bên trong nó có hai file:

```
chrome-extension
   ├── content.js
   └── manifest.json
```

Thấy đúng như vậy là được. Ghi nhớ đường dẫn tới thư mục `chrome-extension` này — bước sau cần tới.

> Nếu bấm đúp vào file zip mà chỉ thấy xem được nội dung chứ không giải nén ra, nghĩa là bạn mới chỉ *xem trộm* bên trong hộp thôi. Phải dùng "Extract All" như hướng dẫn trên.

---

## 3. Cài đặt

Bạn cần trình duyệt **Google Chrome**. Nếu máy chưa có, tải ở [google.com/chrome](https://www.google.com/chrome/).

### Bước 1 — Mở trang quản lý tiện ích

Mở Chrome. Gõ dòng này vào thanh địa chỉ ở trên cùng rồi nhấn Enter:

```
chrome://extensions
```

*Lưu ý: phải gõ tay, không tìm được bằng Google.*

### Bước 2 — Bật chế độ nhà phát triển

Nhìn **góc trên bên phải** màn hình, có một công tắc tên **"Chế độ dành cho nhà phát triển"**. Gạt cho nó sáng lên.

Nghe có vẻ đáng sợ nhưng không sao cả — đây chỉ là cách Chrome cho phép cài công cụ không lấy từ cửa hàng của Google.

Bật xong bạn sẽ thấy xuất hiện thêm ba nút ở phía trên.

### Bước 3 — Nạp công cụ vào

Bấm nút **"Tải tiện ích đã giải nén"**.

> Đừng bấm nhầm nút "Đóng gói tiện ích" bên cạnh — nút đó dùng cho việc khác.

Một cửa sổ chọn thư mục hiện ra. Tìm tới thư mục **`chrome-extension`** mà bạn đã giải nén ở phần trước (trong Tài liệu → `X-Auto-Poster`), rồi chọn nó.

**Quan trọng:** chọn *cả thư mục* `chrome-extension`, đừng mở nó ra rồi chọn file `content.js` hay `manifest.json` bên trong.

### Bước 4 — Kiểm tra

Nếu thành công, bạn sẽ thấy một ô mới hiện ra với chữ:

```
X Auto Poster          1.0.0
```

Xong rồi. Không cần làm gì thêm ở trang này.

---

## 4. Lần đầu sử dụng

Mở **x.com** và đăng nhập như bình thường.

Đợi khoảng 2 giây, một **bảng điều khiển màu xám đậm** sẽ hiện ra ở **góc dưới bên phải** màn hình.

Nếu không thấy, thử tải lại trang (nhấn F5).

Bảng này có thể thu gọn lại bằng cách bấm vào thanh tiêu đề "X Auto Poster" ở trên cùng của nó.

---

## 5. Đăng bài tự động

### Viết danh sách bài

Ô lớn ở trên cùng là nơi bạn viết các bài muốn đăng. **Mỗi dòng là một bài:**

```
Chào buổi sáng mọi người
Hôm nay trời đẹp quá
Cuối tuần vui vẻ nhé
```

Ba dòng này sẽ thành ba bài đăng riêng biệt.

### Nếu bài cần xuống dòng

Khi một bài của bạn dài và cần xuống dòng, hãy dùng **ba dấu gạch ngang** `---` trên một dòng riêng để ngăn cách các bài:

```
Bài ngắn bình thường

---

Ba điều học được hôm nay:

1. Điều thứ nhất
2. Điều thứ hai
3. Điều thứ ba

---

Bài cuối cùng
```

Chỉ cần có một dòng `---` là công cụ tự hiểu bạn đang dùng cách này.

### Cài đặt thời gian

Ngay dưới ô nhập bài:

**"Cách nhau ... đến ... phút"** — công cụ sẽ chờ ngẫu nhiên trong khoảng này giữa hai bài. Ví dụ đặt 15 và 45 thì có bài cách nhau 20 phút, bài khác cách nhau 38 phút.

Đừng đặt quá ngắn. Đăng liên tục vài phút một bài là cách nhanh nhất để X cho rằng bạn là máy và khoá tài khoản.

**"Tối đa ... bài/ngày"** — đăng đủ số này là nghỉ đến hôm sau.

**"Chỉ đăng từ ... đến ... giờ"** — ví dụ 7 và 23 thì nó chỉ đăng trong ngày, không đăng lúc nửa đêm. Tài khoản đăng bài đều đặn lúc 3 giờ sáng trông rất bất thường.

**"Nhịp tự nhiên"** — nên để bật. Nó làm khoảng cách giữa các bài trông giống người thật hơn.

**"Lặp lại"** — bật thì đăng hết danh sách sẽ quay lại đăng từ đầu. Thường nên tắt.

### Bắt đầu

Bấm nút xanh **"Bắt đầu"**.

Dòng chữ ở giữa bảng sẽ đổi thành:

```
● Đang chạy — bài kế tiếp sau 18:42
Đã đăng 0/3 · hôm nay 0 bài
```

Con số đếm ngược cho biết còn bao lâu tới bài tiếp theo.

Khi tới giờ, màn hình sẽ tự mở ô soạn bài, tự gõ chữ và tự bấm đăng. **Đừng đụng vào chuột lúc đó**, để nó làm xong khoảng 5 giây.

### Dừng lại

Bấm nút đỏ **"Dừng"** bất cứ lúc nào.

---

## 6. Retweet

### Retweet một bài cụ thể

Vào bài muốn retweet, nhìn lên thanh địa chỉ, bạn sẽ thấy dạng:

```
https://x.com/tennguoidung/status/1234567890123456789
```

Dãy số dài ở cuối chính là mã bài viết. Chép dãy số đó vào danh sách, thêm chữ `rt:` phía trước:

```
rt:1234567890123456789
```

Bạn trộn chung với bài thường cũng được:

```
Chào buổi sáng
rt:1234567890123456789
Một bài nữa của mình
```

### Tìm bài để retweet theo từ khoá

Bấm vào dòng **"🔎 Tìm theo từ khoá"** để mở phần này ra.

**Ô từ khoá** — gõ thứ bạn muốn tìm, ví dụ `#dulich` hoặc `cà phê sài gòn`.

**Ô loại trừ** — gõ các từ bạn KHÔNG muốn thấy, cách nhau bằng dấu phẩy. Ví dụ `quảng cáo, giveaway`.

**"Tối thiểu ... like"** — bỏ qua các bài chưa ai thích. Đây là bộ lọc hữu ích nhất: kết quả tìm kiếm trên X có rất nhiều bài rác, đặt 5 hoặc 10 là lọc được phần lớn.

**"Lấy ... bài"** — mỗi lần tìm lấy nhiều nhất bao nhiêu bài.

**"Duyệt tay trước"** — nên để bật. Công cụ sẽ đưa danh sách bài tìm được để bạn xem và chọn, thay vì tự retweet hết.

Bấm **"Tìm ngay"**. Màn hình chuyển sang trang kết quả rồi quay lại.

Các bài tìm được hiện thành danh sách, mỗi bài có tên người đăng, số like và một đoạn nội dung. Với mỗi bài bạn bấm:

- **Lấy** — thêm vào danh sách chờ đăng
- **Bỏ** — không dùng bài này
- **xem** — mở bài gốc ra tab mới để đọc kỹ

Hoặc dùng **"Lấy hết"** / **"Bỏ hết"** cho nhanh.

---

## 7. Bảng tra nhanh các nút

| Nút / Ô | Tác dụng |
|---|---|
| Ô lớn trên cùng | Danh sách bài muốn đăng |
| Cách nhau ... đến ... phút | Khoảng thời gian giữa hai bài |
| Tối đa ... bài/ngày | Đăng đủ thì nghỉ tới hôm sau |
| Chỉ đăng từ ... đến ... giờ | Khung giờ được phép đăng |
| Nhịp tự nhiên | Làm thời gian trông giống người thật hơn |
| Lặp lại | Hết danh sách thì quay lại từ đầu |
| **Bắt đầu** | Chạy |
| **Dừng** | Ngừng |
| **Xoá lịch sử** | Quên các bài đã đăng, để đăng lại được |
| Khung chữ nhỏ dưới cùng | Nhật ký hoạt động |

---

## 8. Những điều nên biết

### Đừng đăng quá nhiều

X giới hạn **50 bài mỗi ngày** với tài khoản thường (chưa mua gói Premium). Vượt quá là bài không lên được.

Nhưng con số an toàn thấp hơn nhiều. Vài bài tới hơn chục bài một ngày, cách nhau vài chục phút, là hợp lý. Đăng dồn dập là cách nhanh nhất gặp rắc rối.

### Retweet hàng loạt là vi phạm

X cho phép retweet tự động ở mức vừa phải, nhưng **cấm rõ ràng** việc retweet hàng loạt. Đó là lý do công cụ mặc định bắt bạn duyệt tay — chọn vài bài thật sự hay thì an toàn, quét sạch mọi thứ khớp từ khoá thì không.

### Nội dung nên khác nhau

Đăng đi đăng lại nội dung giống nhau là dấu hiệu X để ý. Viết mỗi bài một kiểu.

### Công cụ chỉ chạy trên X

Nó không đọc, không can thiệp vào bất kỳ trang nào khác. Không lấy mật khẩu của bạn.

---

## 9. Khi gặp trục trặc

### Không thấy bảng điều khiển

1. Kiểm tra bạn đang ở đúng trang **x.com** (không phải trang khác)
2. Tải lại trang bằng phím **F5**
3. Vào lại `chrome://extensions`, xem ô "X Auto Poster" còn bật không
4. Nếu ô đó có nút **"Lỗi"** màu đỏ, bấm vào chụp màn hình gửi người hỗ trợ bạn

### Bài không đăng được

Xem khung nhật ký ở dưới cùng bảng điều khiển. Vài thông báo thường gặp:

| Thông báo | Nghĩa là | Làm gì |
|---|---|---|
| `Da dang: ...` | Thành công | Không cần làm gì |
| `Het bai trong hang doi` | Đăng hết rồi | Thêm bài mới vào |
| `Da du ... bai hom nay` | Chạm giới hạn ngày | Đợi hôm sau |
| `Khong thay element ...` | X đã đổi giao diện | Báo người hỗ trợ bạn |
| `Bai nay da duoc retweet truoc do` | Bạn đã retweet rồi | Bình thường, nó bỏ qua |

### Đang gõ mà số bị nhảy

Đã sửa ở bản mới. Nếu vẫn bị, bạn đang dùng bản cũ — nhờ người hỗ trợ cập nhật giúp.

### Muốn đăng lại các bài cũ

Bấm **"Xoá lịch sử"**. Công cụ sẽ quên các bài đã đăng và đăng lại từ đầu.

---

## 10. Câu hỏi thường gặp

**Tắt máy tính thì sao?**
Nó dừng. Bật lại, mở x.com rồi bấm "Bắt đầu" là chạy tiếp từ chỗ dừng. Danh sách và cài đặt vẫn còn nguyên.

**Đóng tab X thì sao?**
Cũng dừng. Mở lại rồi bấm "Bắt đầu".

**Tôi có thể dùng máy tính làm việc khác không?**
Được. Chỉ cần đừng đóng tab X. Mở bao nhiêu tab khác cũng không sao.

**Nó có đăng khi tôi đang dùng X không?**
Có. Tới giờ là nó tự mở ô soạn bài. Nếu đang gõ dở gì đó thì hơi phiền, nên tốt nhất để tab X yên một chỗ.

**Có mất phí không?**
Không. Hoàn toàn miễn phí.

**Có an toàn cho tài khoản không?**
Nếu dùng chừng mực — vài bài một ngày, cách nhau vài chục phút, nội dung khác nhau — thì rủi ro thấp. Đăng dồn dập hoặc retweet hàng loạt thì có thể bị X hạn chế.

**Tôi dùng được cho nhiều tài khoản không?**
Công cụ đăng bằng tài khoản bạn đang đăng nhập. Muốn đổi thì đăng xuất rồi đăng nhập tài khoản khác.

**Tôi lỡ xoá thư mục đã giải nén rồi, sao giờ?**
Công cụ sẽ ngừng chạy. Giải nén lại file zip vào thư mục cố định, rồi cài lại từ đầu theo phần 3. Danh sách bài và cài đặt của bạn vẫn còn, không mất.

**Có được đổi tên hay di chuyển thư mục sau khi cài không?**
Không nên. Chrome ghi nhớ đường dẫn cũ, đổi chỗ là nó không tìm thấy nữa. Nếu lỡ chuyển rồi thì vào `chrome://extensions` xoá đi và cài lại.

**Xoá công cụ đi thế nào?**
Vào `chrome://extensions`, tìm ô "X Auto Poster", bấm **"Xoá"**.
