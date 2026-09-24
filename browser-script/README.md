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

Trong ô **Hàng đợi**, mỗi dòng là một bài:

```
Chao buoi sang moi nguoi
rt:1234567890123456789
Mot bai nua trong ngay
```

- Dòng thường → đăng thành tweet
- Dòng `rt:<id>` → retweet bài có ID đó (lấy ID từ URL tweet)
- Dòng `rt:` mà ID không phải số → bị bỏ qua kèm cảnh báo, **không** bị đăng nhầm thành tweet

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

## Cách nó hoạt động

X là ứng dụng một trang, và việc điều hướng tới ô soạn thảo sẽ nạp lại trang, xoá sạch biến trong bộ nhớ. Nên script là một **máy trạng thái lưu trong `localStorage`**:

```
chờ đến giờ → ghi "pending" → điều hướng
  → trang nạp lại → thấy "pending" → thao tác DOM → xoá pending → hẹn giờ tiếp
```

Tìm kiếm cũng đi qua đúng cơ chế đó: `pending = {type:'search'}` → mở trang kết quả → trang nạp lại → đọc kết quả → xoá pending.

`pending` được xoá **trước** khi thao tác, nên nếu có lỗi thì nó bỏ qua bài đó chứ không lặp vô hạn.

## Giới hạn cần biết

**Phải giữ tab X mở.** Đóng tab là dừng. Trạng thái vẫn được lưu nên mở lại rồi bấm Bắt đầu là chạy tiếp.

**Selector có thể gãy.** Script bám vào `data-testid` của X (`tweetTextarea_0`, `tweetButton`, `retweet`, `retweetConfirm`). X đổi giao diện thì phải cập nhật lại. Đây là điểm yếu cố hữu của mọi cách tự động hoá qua DOM.

**Không vượt được hạn mức của X.** Tài khoản chưa verified vẫn chỉ đăng được 50 bài gốc/ngày. Để `maxPerDay` dưới mức đó.

**Đừng để nhịp quá dày.** Mặc định 20 phút/bài kèm lệch ngẫu nhiên. Đăng dồn liên tục là cách nhanh nhất để bị gắn cờ, bất kể dùng công cụ gì.

## Gỡ lỗi

Mở DevTools (F12) → Console, tìm dòng bắt đầu bằng `[auto-poster]`. Bảng điều khiển cũng có khung log riêng.

Nếu báo `Khong thay element "..."` thì nhiều khả năng X đã đổi `data-testid`. Mở F12 → Elements, tìm ô soạn thảo xem thuộc tính mới là gì rồi sửa trong script.
