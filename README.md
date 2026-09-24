# auto-tweet

Bot đăng tweet tự động chạy qua [twitterapi.io](https://docs.twitterapi.io/introduction) — không cần đăng ký X Developer App, không cần OAuth. Node.js thuần, **zero dependency**.

## Bot làm được gì

- Đăng tweet theo lịch (mỗi N phút/giờ), có jitter ngẫu nhiên cho tự nhiên
- Giới hạn khung giờ (`7-23`) và trần số tweet mỗi ngày
- Queue nội dung trong 1 file text, tự nhớ bài nào đã đăng (không đăng trùng)
- Đính kèm ảnh/video, reply, quote tweet, đăng vào community
- Cache session đăng nhập, tự login lại khi hết hạn
- Chế độ `--dry` để xem trước mà không tốn credit

## Yêu cầu

| Thứ cần có | Ghi chú |
|---|---|
| Node.js >= 20 | Dùng `fetch`/`FormData` built-in |
| API key twitterapi.io | Lấy ở Dashboard, trả theo credit (~$0.001/tweet) |
| Tài khoản X | Username, email, password (+ TOTP secret nếu bật 2FA) |
| **Proxy residential tĩnh** | **Bắt buộc.** API yêu cầu field `proxy` |

> ⚠️ **Về proxy:** twitterapi.io bắt buộc truyền proxy ở cả bước login lẫn đăng bài, và phải là **cùng một proxy**. Đổi IP giữa chừng là dấu hiệu bất thường với X, dễ bị khoá tài khoản. Dùng static residential proxy, đừng dùng datacenter proxy.
>
> ⚠️ **Về rủi ro tài khoản:** cách này đăng nhập bằng username/password thay vì OAuth chính thức. Nên dùng tài khoản phụ trước, và giữ nhịp đăng hợp lý (vài giờ/bài) thay vì spam.

## Cài đặt

```bash
cp .env.example .env
$EDITOR .env          # điền API key, tài khoản, proxy
```

Không cần `npm install` — project không có dependency nào.

## Dùng

```bash
node src/cli.js check          # kiểm tra .env + proxy + hạn mức TRƯỚC khi chạy thật
node src/cli.js list           # xem queue, bài nào đã đăng
node src/cli.js post --dry     # xem trước bài kế tiếp, không gọi API
node src/cli.js login          # đăng nhập & cache session
node src/cli.js post           # đăng 1 bài kế tiếp trong queue
node src/cli.js run            # chạy scheduler, đăng liên tục
node src/cli.js status         # xem cấu hình + lịch sử
```

Đăng nội dung tuỳ ý không qua queue:

```bash
node src/cli.js post --text "Hello từ twitterapi.io 👋"
node src/cli.js post --text "Ảnh nè" --media ./content/media/a.png
node src/cli.js post --text "Đồng ý" --reply 1234567890123456789
node src/cli.js post --retweet 1234567890123456789
```

> ⚠️ **Về retweet tự động.** X nêu đích danh retweet trong luật automation: *"Bulk, aggressive, or spammy reposting (retweeting) is a violation of the X Rules"*, nhưng cho phép *"repost or quote post in an automated manner for entertainment, informational, or novelty purposes"*. Nói cách khác retweet tự động ở mức vừa phải thì được, retweet hàng loạt thì vi phạm. Retweet **không** giúp lách trần 50 bài/ngày — nhiều khả năng vẫn bị tính chung (X chưa xác nhận chính thức).

Hoặc qua npm scripts: `npm start` (= `run`), `npm run check`, `npm run post`, `npm run status`.

### Có nhiều proxy thì làm sao

Gói rẻ thường bán theo lô (Webshare tối thiểu 20 IP). Đừng xoay vòng chúng — hãy **chấm điểm rồi chọn một cái dùng cố định**:

```bash
# dán list vào content/proxies.txt hoặc TW_PROXY_LIST trong .env
node src/cli.js proxies
```

Lệnh này thử song song từng proxy và xếp hạng theo: còn sống không, residential hay datacenter, độ trễ bao nhiêu, ISP/quốc gia nào. Cuối cùng in ra dòng `TW_PROXY=...` để bạn dán thẳng vào `.env`. Nhận cả định dạng `http://user:pass@ip:port` lẫn `ip:port:user:pass` (kiểu export của Webshare).

> **Tại sao không xoay vòng proxy?** X gắn session đăng nhập với IP. Đổi IP giữa chừng là tín hiệu chiếm tài khoản kinh điển → challenge hoặc khoá. Trong code này, [session.js](src/session.js) tính fingerprint từ tài khoản + proxy, nên đổi proxy sẽ **buộc đăng nhập lại** — và nhiều lần login từ nhiều IP khác nhau đúng là thứ dễ bị gắn cờ nhất. Chọn một cái tốt rồi ở yên với nó; chỉ đổi khi proxy chết hẳn.

### Lệnh `check` làm gì

Chạy đầu tiên sau khi điền `.env`. Nó kiểm tra 4 thứ mà không tốn credit nào:

1. **Biến môi trường** — thiếu cái nào, sai định dạng proxy không
2. **Proxy sống không** — `curl` qua proxy tới `api.ipify.org`, báo IP thoát + độ trễ
3. **Chất lượng IP** — hỏi `ip-api.com` (qua chính proxy đó) xem IP thuộc loại nào. Nếu trả về `hosting: true` thì đó là **IP datacenter**, X rất dễ chặn khi login → cần đổi proxy. IP residential thật (Comcast, Viettel, VNPT…) sẽ trả `hosting: false`.
4. **Độ ổn định của IP** — ghi lại IP thoát mỗi lần chạy, báo động nếu nó đổi. Quan trọng nhất khi bạn tự dựng proxy tại nhà: IP động khiến bot phải đăng nhập lại từ IP mới mỗi lần đổi, đúng pattern X gắn cờ. Chạy `check` định kỳ vài ngày trước khi chạy thật để biết đường truyền có đủ ổn định không:
   ```bash
   # kiểm tra mỗi 2 tiếng trong 2–3 ngày
   (crontab -l 2>/dev/null; echo "0 */2 * * * cd $PWD && node src/cli.js check >> ip-check.log 2>&1") | crontab -
   ```
5. **Hạn mức** — cảnh báo nếu `MAX_PER_DAY` vượt 50 mà tài khoản chưa Premium

Bước 3 gửi IP thoát của proxy tới ip-api.com (dịch vụ tra cứu IP công khai, miễn phí, không cần key). Không gửi API key, mật khẩu hay nội dung tweet đi đâu cả.

## Chế độ `watch` — tự retweet bài mới của các account

Thay vì đăng từ file, bot theo dõi một danh sách account và retweet bài mới của họ. Đây là bot **curation** — X cho phép rõ ràng: *"you may repost or quote post in an automated manner for entertainment, informational, or novelty purposes"*.

```ini
SOURCE=watch
WATCH_ACCOUNTS=vercel,nodejs,typescript
WATCH_INTERVAL=30m
WATCH_ADAPTIVE=true
WATCH_MAX_AGE=6h
WATCH_INCLUDE=            # vd: #nodejs,release  — chỉ retweet bài chứa từ này
WATCH_EXCLUDE=giveaway,airdrop
POST_INTERVAL=20m         # nhịp retweet (tách biệt với nhịp quét)
MAX_PER_DAY=30
```

Hoặc để `WATCH_ACCOUNTS` trống và liệt kê handle trong `content/accounts.txt`, mỗi dòng một cái.

```bash
node src/cli.js watch      # quét một lần, xem tìm được gì + chi phí
node src/cli.js queue      # xem hàng đợi retweet và tần suất đăng của từng account
node src/cli.js run        # chạy nền: vừa quét vừa retweet theo nhịp
```

**Lần đầu theo dõi một account, bot chỉ ghi mốc chứ không retweet loạt bài cũ.** Bài cũ hơn `WATCH_MAX_AGE` cũng bị bỏ qua, và reply/retweet-của-người-khác bị lọc mặc định.

### Tiết kiệm chi phí quét

Mỗi lần quét tốn tiền ($0.00015/tweet trả về, tối đa 20 tweet/trang). Bật `WATCH_ADAPTIVE=true` (mặc định) thì bot tự đo tần suất đăng của từng account rồi giãn nhịp quét cho account ít đăng:

| Account đăng | Nhịp quét thực tế | Chi phí/tháng |
|---|---|---|
| 20 bài/ngày | 30 phút | ~$4.3 |
| 5 bài/ngày | 1 giờ | ~$2.2 |
| 2 bài/ngày | 2 giờ | ~$1.1 |
| 0.5 bài/ngày | 4 giờ | ~$0.5 |
| 0.1 bài/ngày | 6 giờ | ~$0.4 |

Theo dõi 10 account hỗn hợp rơi vào khoảng **$10–20/tháng** nếu không adaptive, và thường **dưới $8/tháng** khi bật. Muốn rẻ hơn nữa thì tăng `WATCH_INTERVAL` — đổi lại bài mới được retweet chậm hơn.

> Con số chi phí ở trên tính theo giá công bố $0.00015/tweet. Blog của twitterapi.io đưa ra ước tính thấp hơn (~$0.48/tháng/account ở nhịp 30 phút), có thể họ chỉ tính phí theo request khi không có bài mới. Chạy `node src/cli.js watch` vài ngày đầu rồi đối chiếu dashboard để biết con số thật.

## Viết nội dung

Sửa `content/tweets.txt`. Mỗi tweet cách nhau bằng một dòng `---`:

```
Tweet đầu tiên của bot 🤖

---

@media: ./content/media/demo.png
Tweet có kèm ảnh.

---

@reply: 1234567890123456789
Đây là một reply.
```

Metadata đặt ở đầu mỗi khối:

| Directive | Tác dụng |
|---|---|
| `@media: <path>` | Đính kèm file (lặp lại nhiều dòng cho nhiều file) |
| `@reply: <tweet_id>` | Trả lời một tweet |
| `@quote: <tweet_id>` | Quote một tweet |
| `@retweet: <tweet_id>` | Retweet một tweet có sẵn (khối này không cần nội dung) |
| `@url: <link>` | `attachment_url` |
| `@community: <id>` | Đăng vào community |
| `@note: true` | Tweet dài > 280 ký tự (cần X Premium) |
| `@schedule: <ISO-8601>` | Hẹn giờ, X tự xử lý |

Bài đã đăng được ghi vào `data/state.json` theo hash nội dung nên chạy lại không bị đăng trùng. Sửa nội dung một bài = nó thành bài mới và sẽ được đăng lại.

## Cấu hình lịch (`.env`)

```ini
POST_INTERVAL=4h      # nhịp đăng
POST_JITTER=20m       # lệch ngẫu nhiên ±20 phút
POST_DAYS=            # chỉ đăng các thứ này: fri | mon,wed,fri | t6 | 1-5. Trống = mọi ngày
POST_HOURS=7-23       # chỉ đăng 7h–23h (hỗ trợ khung qua đêm: 22-6)
MAX_PER_DAY=8         # trần mỗi ngày
MAX_PER_WINDOW=0      # trần trong 30 phút (X chia hạn mức theo khung nửa tiếng). 0 = tắt
SPREAD=false          # true = bỏ qua POST_INTERVAL, tự rải đều MAX_PER_DAY trong POST_HOURS
ORDER=sequential      # hoặc random
LOOP_QUEUE=false      # true = hết queue thì quay lại đăng từ đầu
POST_ON_START=true    # đăng ngay 1 bài khi khởi động
DRY_RUN=false
```

### Đăng khối lượng lớn vào một ngày cố định

Ví dụ: 300 bài, chỉ vào thứ 6, rải đều trong ngày.

```ini
POST_DAYS=fri
POST_HOURS=7-23
MAX_PER_DAY=300
SPREAD=true           # 16h / 300 bài = tự tính ra 1 bài mỗi ~3m12s
MAX_PER_WINDOW=20     # chặn đăng dồn quá 20 bài / 30 phút
POST_JITTER=30s
```

Chạy `node src/cli.js status` để xem nhịp mà `SPREAD` tính ra trước khi bật thật.

> ⚠️ **Giới hạn tài khoản, không phải giới hạn API.** Từ 5/2026 X chặn tài khoản **chưa verified** ở **50 original post/ngày** (200 reply/ngày). Tài khoản **X Premium** mới quay về trần 2.400/ngày. Giới hạn này áp ở tầng tài khoản nên **không backend nào lách được** — kể cả API chính thức. Đăng >50 bài/ngày mà không có Premium sẽ fail bất kể cấu hình.

## Chạy nền

```bash
# nohup
nohup node src/cli.js run > auto-tweet.log 2>&1 &

# systemd (/etc/systemd/system/auto-tweet.service)
[Service]
WorkingDirectory=/home/nhi/twitter-tweet
ExecStart=/usr/bin/node src/cli.js run
Restart=always
RestartSec=30
```

## Cấu trúc

```
src/
  cli.js         lệnh CLI
  scheduler.js   vòng lặp lịch đăng
  poster.js      đăng 1 bài + retry khi session hết hạn
  api.js         client twitterapi.io (login / create_tweet / upload_media)
  session.js     cache login_cookie
  source.js      đọc & parse queue
  store.js       lịch sử đăng, chống trùng, đếm theo ngày
  config.js      đọc .env, validate
content/tweets.txt   nội dung
data/                state.json + session.json (gitignored)
```

## Endpoint đang dùng

Bản v2 của twitterapi.io (v1 cookie **không** dùng được với v2 và ngược lại):

- `POST /twitter/user_login_v2` → `login_cookie`
- `POST /twitter/create_tweet_v2` → `tweet_id`
- `POST /twitter/upload_media_v2` → `media_id`

## Lỗi hay gặp

| Triệu chứng | Xử lý |
|---|---|
| Login fail dù đúng mật khẩu | Thử `TW_USERNAME` thay vì `TW_EMAIL`, hoặc đổi proxy chất lượng hơn |
| Đòi 2FA | Điền `TW_TOTP_SECRET` = chuỗi base32 lúc quét QR, **không phải** mã 6 số |
| `status=error` khi đăng | Session hết hạn → bot tự login lại 1 lần; nếu vẫn lỗi chạy `node src/cli.js logout` rồi `login` |
| Tweet quá dài | Rút ngắn, hoặc `@note: true` nếu có X Premium |
