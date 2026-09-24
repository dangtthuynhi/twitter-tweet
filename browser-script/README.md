# X Auto Poster — userscript

Chạy thẳng trong tab X đã đăng nhập. Không cần Node, không cần proxy, không cần API key, không tốn phí.

## Vì sao cách này hợp với tình huống hiện tại

| | twitterapi.io | Userscript |
|---|---|---|
| Đăng nhập | Đang hỏng (`LOGIN_DENIED`) | Dùng luôn phiên trong trình duyệt |
| Proxy | Bắt buộc | Không cần |
| IP đăng bài | Anh / Nhật / Mỹ | Chính IP Việt Nam của bạn |
| Chi phí | ~$0.001/bài | $0 |
| Điều kiện | — | Phải giữ tab X mở |

Đăng từ đúng IP thường ngày của mình là thứ tự nhiên nhất dưới mắt X — không có cú nhảy địa lý nào để mà bị nghi.

## X chặn userscript — và cách vượt qua

X đặt **CSP (Content Security Policy)** rất chặt. Tampermonkey với `@grant none` chèn script vào **page context** — chính là thứ CSP chặn, nên script không chạy.

Hai cách xử lý, script này làm cả hai:

1. **Khai báo `@grant`** (`GM_setValue`, `GM_getValue`). Khi có grant, Tampermonkey chạy script trong **sandbox riêng** thay vì page context, nằm ngoài tầm với của CSP trang.
2. **Không dùng inline style.** CSS được chèn qua CSSOM (`document.createElement('style')` + `textContent`), và mọi thuộc tính `style="..."` đã được chuyển thành class. CSP `style-src` cũng chặn inline style, nên đây là chỗ hay bị vỡ giao diện.

Nếu vẫn bị chặn thì dùng [bản Chrome extension](../chrome-extension/) — content script chạy trong *isolated world*, hoàn toàn nằm ngoài CSP của trang.

## Cài

1. Cài **[Violentmonkey](https://violentmonkey.github.io/)** (hoặc Tampermonkey) cho trình duyệt
2. Mở bảng điều khiển của nó → **Create a new script**
3. Xoá hết nội dung mẫu, dán toàn bộ [x-auto-poster.user.js](x-auto-poster.user.js) vào
4. **Ctrl+S** để lưu
5. Mở **x.com** → bảng điều khiển hiện ở góc dưới bên phải

## Dùng

Ô **Hàng đợi** nhận hai định dạng, tự nhận biết:

**Mỗi dòng một bài** — gọn khi bài đều ngắn:

```
Chao buoi sang moi nguoi
rt:1234567890123456789
Mot bai nua trong ngay
```

**Tách bằng `---`** — dùng khi cần bài xuống dòng. Chỉ cần có một dòng `---` là cả ô chuyển sang chế độ này:

```
Bai mot dong binh thuong

---

3 thu hoc duoc hom nay:

1. Doc code cu lau hon viet code moi
2. Ten bien tot thay duoc 3 dong comment
3. Test khong chay = test khong ton tai

---

rt:1234567890123456789
```

Quy tắc chung:

- Khối thường → đăng thành tweet, giữ nguyên xuống dòng
- Khối `rt:<id>` → retweet bài có ID đó (lấy ID từ URL tweet)
- `rt:` mà ID không phải số → bỏ qua kèm cảnh báo, **không** bị đăng nhầm thành tweet
- Trong chế độ mỗi-dòng-một-bài, gõ `\n` cũng thành xuống dòng thật

### Vì sao cần xử lý riêng cho xuống dòng

Ô soạn thảo của X là DraftJS, và nó **không hiểu ký tự `\n`** truyền qua `insertText` — chuỗi sẽ bị nuốt hoặc biến thành khoảng trắng. Script chèn từng dòng một, giữa các dòng gọi `insertLineBreak` (tương đương người dùng bấm Enter trong ô soạn thảo).

Chỉnh nhịp đăng, độ lệch ngẫu nhiên, trần bài/ngày rồi bấm **Bắt đầu**.

## Retweet theo từ khoá

Mở khối **🔎 Tìm theo từ khoá** trong bảng điều khiển:

| Ô | Ý nghĩa |
|---|---|
| Từ khoá | Cú pháp tìm kiếm của X: `#nodejs`, `typescript OR deno`, `from:vercel` |
| Loại trừ | Bỏ bài chứa các từ này, cách nhau dấu phẩy |
| Tối thiểu N like | Bỏ bài chưa ai tương tác — lọc rác hiệu quả nhất |
| Lấy N bài | Trần mỗi lần quét |
| Duyệt tay trước | Hiện danh sách để bạn chọn, thay vì tự đẩy vào hàng đợi |
| Bài mới nhất | Tab "Latest" thay vì "Top" |

Bấm **Tìm ngay** → script mở trang tìm kiếm, đọc kết quả, rồi quay về.

Nó tự bỏ qua: bài quảng cáo, bài của chính bạn, bài đã retweet, bài đã nằm trong hàng đợi, bài không có nội dung, bài dưới ngưỡng like, và bài chứa từ loại trừ.

Với **Duyệt tay** bật (mặc định), các bài tìm được hiện thành danh sách kèm handle, số like và đoạn nội dung — bạn bấm **Lấy** hoặc **Bỏ** từng bài, hoặc **Lấy hết** / **Bỏ hết**. Link **xem** mở bài gốc ra tab mới để đọc trước.

> Mặc định bật duyệt tay là có chủ ý. Retweet hàng loạt mọi thứ khớp từ khoá là thứ X gọi thẳng tên trong luật: *"Bulk, aggressive, or spammy reposting is a violation of the X Rules"*. Chọn lọc vài bài thật sự hay thì vừa hợp lệ, vừa giữ được chất lượng feed của bạn.

## Nhịp đăng

**Cách nhau [min] đến [max] phút** — bạn chọn khoảng, script random trong đó. Nhập ngược (45 rồi 15) thì nó tự đảo lại; để hai ô bằng nhau thì thành cố định.

**Chỉ đăng từ N đến M giờ** — ngoài khung này thì hoãn tới lần mở cửa sổ kế tiếp. Tài khoản đăng đều đặn lúc 3 giờ sáng là thứ dễ thấy.

**Nhịp tự nhiên** — bật thì giãn cách tập trung quanh giữa khoảng thay vì rải đều. Với khoảng 15–45 phút:

```
ĐỀU              TỰ NHIÊN
15p ████         15p █
21p ████         21p ███
28p ████         28p ██████     ← đa số rơi quanh đây
34p ████         34p ████
44p ████         44p █
```

Cả hai đều tôn trọng khoảng bạn đặt, không bao giờ vượt ra ngoài.

> Chi tiết kỹ thuật: khi ở chế độ tự nhiên, giá trị rơi ra ngoài khoảng sẽ được **lấy mẫu lại** chứ không bị kẹp về biên. Kẹp về biên tạo ra cụm dồn ở đúng hai đầu khoảng — nhìn lại còn máy móc hơn cả random đều.

Mục đích không phải che giấu gì, mà là **đừng tạo ra mẫu máy móc**. Hệ thống chống spam của X phạt hành vi bùng nổ, lặp lại, đều tăm tắp. Đăng với nhịp giống người thật vừa ít bị gắn cờ nhầm, vừa đúng là cách dùng hợp lý.

Nhưng cần nói rõ: **không có thủ thuật thời gian nào bù được cho khối lượng.** Thứ thật sự khiến tài khoản bị phạt là số lượng và mức độ lặp lại, không phải độ chính xác của đồng hồ. Trần 50 bài/ngày với tài khoản chưa verified vẫn là trần, và retweet hàng loạt vẫn vi phạm luật dù rải đều cỡ nào.

## Cách nó hoạt động

X là ứng dụng một trang, và việc điều hướng tới ô soạn thảo sẽ nạp lại trang, xoá sạch biến trong bộ nhớ. Nên script là một **máy trạng thái lưu trong `localStorage`**:

```
chờ đến giờ → ghi "pending" → điều hướng
  → trang nạp lại → thấy "pending" → thao tác DOM → xoá pending → hẹn giờ tiếp
```

Tìm kiếm cũng đi qua đúng cơ chế đó: `pending = {type:'search'}` → mở trang kết quả → trang nạp lại → đọc kết quả → xoá pending.

### Ưu tiên điều hướng nội bộ

Tải lại toàn bộ trang mỗi lần đăng là mẫu hành vi khác hẳn người dùng thật — ứng dụng X vốn điều hướng nội bộ, không bao giờ full-load để mở ô soạn thảo.

Nên script **bấm đúng nút như người dùng**: `[data-testid="SideNav_NewTweet_Button"]` để mở ô soạn thảo, hoặc click thẳng link bài viết nếu nó đang hiện trên trang. Không có lần tải trang nào, và trạng thái nằm nguyên trong bộ nhớ.

Chỉ khi không tìm thấy nút (ví dụ đang ở trang không có thanh điều hướng) mới rơi về `location.href` — lúc đó máy trạng thái trong `localStorage` gánh tiếp.

`pending` được xoá **trước** khi thao tác, nên nếu có lỗi thì nó bỏ qua bài đó chứ không lặp vô hạn.

## Giới hạn cần biết

**Phải giữ tab X mở.** Đóng tab là dừng. Trạng thái vẫn được lưu nên mở lại rồi bấm Bắt đầu là chạy tiếp.

**Selector có thể gãy.** Script bám vào `data-testid` của X (`tweetTextarea_0`, `tweetButton`, `retweet`, `retweetConfirm`). X đổi giao diện thì phải cập nhật lại. Đây là điểm yếu cố hữu của mọi cách tự động hoá qua DOM.

**Không vượt được hạn mức của X.** Tài khoản chưa verified vẫn chỉ đăng được 50 bài gốc/ngày. Để `maxPerDay` dưới mức đó.

**Đừng để nhịp quá dày.** Mặc định 20 phút/bài kèm lệch ngẫu nhiên. Đăng dồn liên tục là cách nhanh nhất để bị gắn cờ, bất kể dùng công cụ gì.

## Gỡ lỗi

Mở DevTools (F12) → Console, tìm dòng bắt đầu bằng `[auto-poster]`. Bảng điều khiển cũng có khung log riêng.

Nếu báo `Khong thay element "..."` thì nhiều khả năng X đã đổi `data-testid`. Mở F12 → Elements, tìm ô soạn thảo xem thuộc tính mới là gì rồi sửa trong script.

---

Làm bởi **dangtthuynhi** — https://github.com/dangtthuynhi/twitter-tweet
