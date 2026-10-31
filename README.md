# extensionChromeUtimate

Chrome Extension: Chặn quảng cáo (YouTube, Banner, Popup, Cờ bạc), tăng tốc trình duyệt Chrome, khuếch đại âm thanh Studio Audiophile (220% Hi-Fi không rè) và dịch nhanh ngữ cảnh chuột phải.

---

## Tính Năng Chính

### 1. Chặn Quảng Cáo Tuyệt Đối
- YouTube Ads: Tự động skip sạch sẽ pre-roll, mid-roll mà không làm gián đoạn hay kẹt đen 0:00.
- Cờ Bạc & Cá Độ: Chặn sạch banner VSbet, FB88, W88, Fun88, 1xBet, ColaScore...
- Popup & Redirect: Chặn triệt để window.open tự ý nhảy tab mới.
- 50+ Ad Networks: Chặn từ tầng mạng (declarativeNetRequest) trước khi tải về.

### 2. Giao Diện YouTube Pure Cinema
- Loại bỏ toàn bộ thành phần rác: Khung Live chat, Shorts, End-screen cards, Info cards, nút Thanks/Clip/Remix/Merchandise.
- Tự động khóa chất lượng video ở mức cao nhất (1080p / 2K / 4K 60FPS).
- Mở rộng video toàn khung hình cinema.

### 3. Bộ Khuếch Đại Âm Thanh Audiophile Studio Engine
- Khuếch đại thực tế 220% mà không làm nát hay méo tiếng.
- Tube Soft-Clipper & Dynamic Limiter: Mô phỏng amply đèn Analog, triệt tiêu méo hài bậc lẻ, chống rè vỡ tiếng 100%.
- 3-Band Studio EQ:
  - Sub-Bass 90Hz (+3dB): Âm trầm sâu, chắc nịch, không bị ù rền.
  - Vocal Presence 3.2kHz (+2.2dB): Giọng ca trong trẻo, tách bạch.
  - Air Treble 11kHz (+2.5dB): Tơi xốp, thoáng đãng.
- Vô hiệu hóa tính năng dìm âm lượng tự động (Stable Volume) của YouTube.

### 4. Giảm Lag Trình Duyệt Chrome (Zero Lag)
- Ép GPU Hardware Acceleration giải mã hình ảnh và cuộn trang mượt mà 60-120FPS.
- Vô hiệu hóa Ambient Mode ngốn tài nguyên GPU trên YouTube.
- Chặn sạch các tracker theo dõi chuột chạy ngầm (Hotjar, Mouseflow, Clarity...).
- Tự động đóng băng các tab không dùng (Memory Saver) giúp tiết kiệm tới 60% RAM.

### 5. Dịch Chuột Phải Siêu Tốc (~30ms)
- Bôi đen bất kỳ chữ nào -> Nhấn chuột phải -> Chọn "Dịch sang Tiếng Việt".
- Trả về bản dịch chuẩn xác trong 30ms và tự động đổi chữ trực tiếp trên trang.

---

## Cấu Trúc Dự Án

```
AdBlocker-Extension/
├── manifest.json         # Khai báo quyền, content scripts, background worker (Manifest V3)
├── background.js         # Service Worker quản lý bộ nhớ, cache, menu chuột phải
├── audio-main-world.js   # Audio DSP Engine & Hook YouTube Player trong Main World
├── youtube-blocker.js    # Tối ưu giao diện Pure Cinema & Skip Ads YouTube
├── content.js            # Quét và xóa DOM Ads, popup, betting banners
├── perf-injector.js      # Turbo Engine tối ưu hóa tốc độ tải trang toàn Chrome
├── translator.js         # Xử lý hiển thị kết quả dịch chuột phải
├── blocker.css           # CSS ẩn các thành phần quảng cáo & rác
├── rules.json            # 50 Network blocking rules (Declarative Net Request)
├── popup.html            # Giao diện điều khiển tối giản
├── popup.js              # Xử lý logic bật/tắt tính năng & thanh trượt âm thanh
└── icons/                # Icon extension độ phân giải 16x16, 48x48, 128x128
```

---

## Hướng Dẫn Cài Đặt

1. Clone repository về máy:
   ```bash
   git clone https://github.com/TaiLoiZzzz/extensionChromeUtimate.git
   ```
2. Mở trình duyệt Chrome và truy cập:
   ```text
   chrome://extensions
   ```
3. Bật chế độ "Chế độ dành cho nhà phát triển" (Developer mode) ở góc trên bên phải.
4. Bấm vào nút "Tải tiện ích đã giải nén" (Load unpacked).
5. Chọn thư mục AdBlocker-Extension trong thư mục vừa tải về.

---

## Giấy Phép
Dự án được phát hành dưới giấy phép MIT License.
