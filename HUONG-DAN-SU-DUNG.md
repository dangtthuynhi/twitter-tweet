# Hướng dẫn sử dụng X Auto Poster

## 1. Công cụ này làm gì

Tự đăng bài lên X (Twitter) theo lịch.

Bạn nhập **nhãn** (hashtag) và **số bài muốn đăng**. Nội dung thì công cụ tự bốc ngẫu nhiên từ kho 20.000 câu có sẵn — **mỗi lần đăng bốc một câu mới**, không bài nào trùng bài nào.

Ngoài ra có thể dán **list tweet id** (ví dụ các bài của LenaMiu_CH3): công cụ vào từng bài, **reply** bằng một câu trong kho kèm nhãn của bạn, rồi **retweet** bài đó.

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
Okay, I need to talk about this. Every time Miu   ← câu bốc ngẫu nhiên,
smiles, the whole scene feels softer. Lena's         dài khoảng 150–215 ký tự
expressions in the latest episode are still
living in my head. Ten out of ten, no notes. 🌟
                                                  ← một dòng trống
LENAMIU AT FLEX                                   ← nhãn của bạn
#Flex1045xPLSLoveรักได้ไหม
#LenaMiu #ลีน่าหมิว
```

X chỉ cho mỗi bài **280 ký tự** (emoji tính 2). Câu và nhãn cộng lại phải nằm trong đó, nên khi nhãn dài, công cụ **tự cắt bớt câu cho vừa** — nhãn thì giữ nguyên:

- Bỏ dần từng câu ở cuối (câu kết trước), vẫn giữ emoji cuối bài.
- Vẫn dài thì bỏ emoji và câu mở đầu, nhưng luôn giữ câu có tên Lena / Miu.
- Chỉ khi còn một câu mà vẫn dài mới cắt giữa câu (đúng chỗ hết một từ) và thêm `…`.

Ngay dưới ô nhãn có dòng báo, ví dụ `Label 62 ký tự · còn 216/280 cho content · câu nào cũng vừa`. Nhãn mẫu ở trên thì không câu nào bị cắt. Nhãn dài quá, chỉ còn dưới 30 ký tự cho câu, thì dòng đó báo đỏ và công cụ dừng lại — rút gọn nhãn rồi bấm "Bắt đầu" lại.

### Các ô cài đặt

| Ô | Nghĩa |
|---|---|
| **Số tweet muốn đăng** | Soạn sẵn bao nhiêu bài mới. Để `0` nếu chỉ muốn reply + retweet theo list tweet |
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

**Xoá hàng đợi:** bấm **"Xoá hàng đợi"** để bỏ hết các việc đang chờ (bài mới, reply, retweet) và dừng bot. Dòng giữa bảng đổi thành `○ Hàng đợi trống`. Muốn chạy lại thì sửa ô nhập hoặc bấm **"Bắt đầu"** — công cụ soạn hàng đợi mới từ những gì đang có trong các ô.

> **Xoá hàng đợi** khác **Xoá lịch sử**: xoá hàng đợi chỉ bỏ việc *chưa làm*, công cụ vẫn nhớ câu nào đã đăng, tweet nào đã reply/retweet nên không làm lại. Xoá lịch sử thì quên hết những thứ đó.

---

## 4. Reply + retweet theo list tweet

Ô **"List tweet"** nằm ngay dưới ô số tweet. **Mỗi dòng một tweet id** — là dãy số cuối link bài:

```
2103095712292696459
2103000000000000001
```

> Lấy id thế nào: mở bài trên X, link có dạng `https://x.com/LenaMiu_CH3/status/2103095712292696459` — id là dãy số sau `/status/`. Dán nguyên cả link vào ô cũng được, công cụ tự lấy id ra.

Ô **"Mỗi tweet reply ... lần, rồi retweet"**: mỗi tweet sẽ được reply bấy nhiêu lần (mỗi lần một câu khác nhau), sau đó retweet một lần. Để `0` thì chỉ retweet, không reply.

**Reply dùng chính nhãn ở ô trên cùng** — giống hệt bài đăng mới: một câu trong kho, cách một dòng trống, rồi đến nhãn:

```
Lena and Miu make every scene feel like home. 💗

LENAMIU AT FLEX
#Flex1045xPLSLoveรักได้ไหม
#LenaMiu #ลีน่าหมิว
```

Nhãn dài thì câu tự cắt bớt cho vừa 280 ký tự, nhãn giữ nguyên (xem phần "Bài đăng ra trông thế nào"). Chưa nhập nhãn thì reply chỉ có câu, dòng báo dưới ô list sẽ nhắc.

Bên dưới ô list có dòng đếm, ví dụ `2 tweet → 2 reply + 2 retweet · xong 0/4`. Dòng nào không phải tweet id hay link bài sẽ được báo và bỏ qua.

Thứ tự chạy: **làm hết list tweet trước** (reply, reply…, retweet, sang tweet sau), **rồi mới đăng bài mới**. Các việc cách nhau theo ô "Cách nhau ... phút" — **trừ retweet: chạy ngẫu nhiên 3–10 giây sau reply cuối cùng của chính bài đó**, như người thật reply xong thì bấm retweet luôn. Mỗi reply, mỗi retweet vẫn tính là một bài trong "Tối đa ... bài/ngày".

Cần biết:

- **Bài đã retweet từ trước** thì bỏ qua, không tính là lỗi, chạy sang việc kế tiếp ngay.
- **Tweet đã làm rồi thì không làm lại**, kể cả khi bạn sửa nhãn hay dán lại cùng id. Muốn reply thêm thì tăng số lần reply (ví dụ 1 → 2), công cụ chỉ làm phần còn thiếu. Muốn làm lại từ đầu thì bấm **"Xoá lịch sử"**.
- **Bài khoá reply** (chủ bài chỉ cho một số người trả lời) sẽ báo lỗi ở phần reply, nhưng vẫn retweet.
- **Tab X bị ẩn** (chuyển sang tab khác, thu nhỏ cửa sổ): công cụ đi đường khác, không cần mở trang bài viết — reply mở thẳng ô soạn bài ở chế độ trả lời bài đó, retweet mở hộp thoại retweet của X. Retweet chỉ bấm khi nút đúng là "Repost / Đăng lại"; bài đã retweet rồi (hộp thoại hiện "Undo repost") thì bỏ qua, không bao giờ gỡ retweet. Việc nào vẫn hỏng lúc tab ẩn thì được giữ lại, dòng giữa bảng báo `⏸ … đang đợi tab X hiện lại`, mở tab X lên là làm tiếp. Xem thêm phần "Khi gặp trục trặc".
- **Reply hàng loạt cùng một kiểu dễ bị X hạn chế** hơn đăng bài thường. Mỗi tweet nên reply ít lần, và giữ khoảng cách vài phút.

---

## 5. Nên biết

**Đừng đăng quá nhiều.** Công cụ để sẵn 100 bài/ngày cách nhau 1–4 phút — đó là số chạy thử. Dùng lâu dài nên hạ xuống: ít bài hơn, giãn cách vài chục phút. X cũng chỉ cho khoảng 50 bài/ngày với tài khoản thường.

**Retweet và reply hàng loạt là vi phạm.** X cấm rõ việc này — chỉ đưa vào list những bài bạn thật sự muốn tương tác, và đừng để list quá dài.

**Công cụ chỉ chạy trên X.** Không đụng tới trang nào khác, không lấy mật khẩu.

---

## 6. Khi gặp trục trặc

**Không thấy bảng điều khiển** — Kiểm tra đang ở đúng x.com → nhấn F5 → vào `chrome://extensions` xem ô "X Auto Poster" còn bật không.

**Bấm Bắt đầu mà báo hàng đợi trống** — Bạn chưa nhập nhãn (hoặc để số tweet là 0 mà list tweet còn trống).

**Bấm Bắt đầu rồi mà mãi không đăng** — Nhìn số đếm ngược giữa bảng. Đang đếm thì cứ để yên.

**Chạy nền chậm, hoặc báo "đang đợi tab X hiện lại"** — Khi tab X bị ẩn, Chrome ngừng vẽ trang và làm chậm mọi nhịp chờ. Công cụ đã đổi sang đường không cần vẽ trang bài viết (ô soạn bài cho reply, hộp thoại retweet cho retweet), nhưng mỗi bài vẫn có thể mất vài phút, và việc nào hỏng thì phải đợi tab hiện lại. Muốn chạy nhanh và chắc nhất:

- Mở X ở **một cửa sổ Chrome riêng**, để tab X là tab đang mở của cửa sổ đó.
- **Đừng thu nhỏ** cửa sổ đó xuống thanh taskbar. Kéo nhỏ lại, để ở một góc màn hình là được.
- **Đừng để cửa sổ khác che kín** nó: Windows coi cửa sổ bị che kín hoàn toàn là đang ẩn. Hở một góc là đủ.

**Đang chạy thì tự dừng** — Xem dòng cuối khung nhật ký ở đáy bảng: đủ số bài hôm nay thì đợi mai, hết bài thì nhập nhãn mới.

**X chặn không cho đăng** — Thỉnh thoảng X hiện hộp thoại bắt xác minh. Mở x.com tự tay đăng thử một bài, làm xong yêu cầu của X rồi bấm "Bắt đầu" lại. Vẫn hỏng thì nghỉ vài tiếng và hạ số bài/ngày xuống.

**Nhật ký nhắc tới `content-lenamiu.json`** — Thiếu file kho câu. Kiểm tra thư mục `chrome-extension` có file đó không, thiếu thì giải nén lại rồi vào `chrome://extensions` bấm **Tải lại** (↻).

**Muốn dùng lại các câu đã đăng** — Bấm **"Xoá lịch sử"**. Thường không cần, vì 20.000 câu là rất nhiều.

---

## 7. Hỏi đáp

**Các bài có trùng nội dung nhau không?**
Không. Mỗi lần đăng, công cụ bốc ngẫu nhiên một câu trong số những câu **chưa từng đăng kèm nhãn này**, nên không lấy lại câu cũ. Đổi sang nhãn khác thì cả kho lại dùng được từ đầu.

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
