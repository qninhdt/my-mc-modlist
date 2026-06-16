# Hướng dẫn đồng bộ Metadata Mod (Turso SQLite Cache)

Tài liệu này hướng dẫn cách sử dụng công cụ đồng bộ toàn bộ metadata của mod từ **ModpackIndex** và **Modrinth** về cơ sở dữ liệu **Turso SQLite** (libSQL), giúp quá trình tìm kiếm mod và giải quyết dependencies diễn ra **tức thì (instant)** và **tránh bị lỗi giới hạn request (Rate Limit 429)** ở cả môi trường local development và production.

---

## 🏗️ Nguyên lý hoạt động

1. **Turso Integration**: Ứng dụng kết nối trực tiếp với database Turso trên đám mây bằng thư viện `@libsql/client` (không sử dụng local file SQLite thô trong production). Việc này cho phép chạy truy vấn ở cả serverless và edge runtimes trên Vercel.
2. **Local Development**: Khi không cấu hình biến môi trường Turso, hệ thống sẽ sử dụng database cục bộ làm fallback (nếu có cấu hình `TURSO_DATABASE_URL=file:data/mods.db`).
3. **On-demand CurseForge Fallback**: Hệ thống chỉ pre-crawl thông tin CurseForge cho các mod **CurseForge-only** (không có trên Modrinth). Khi người dùng yêu cầu, API route sẽ kiểm tra cache trong database Turso trước, nếu không có sẽ gọi trực tiếp đến `api.cfwidget.com` ở runtime và cache lại.

---

## 🚀 Cách sử dụng công cụ đồng bộ

Công cụ đồng bộ được viết bằng TypeScript và chạy trực tiếp qua CLI bằng lệnh `pnpm sync-mods`.

### 1. Cấu hình biến môi trường
Tạo tệp `.env.local` và thêm các biến môi trường Turso:
```bash
TURSO_DATABASE_URL=libsql://your-database-name.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token
```

### 2. Chạy đồng bộ toàn bộ (ModpackIndex và Modrinth)
Lệnh này sẽ tải danh sách mod từ ModpackIndex (mỗi giây một trang để tránh rate limit) sau đó gom nhóm truy vấn hàng loạt chi tiết mod trên Modrinth (mỗi 350ms một batch 100 projects).
```bash
pnpm sync-mods
```

### 3. Xóa database cũ và chạy lại từ đầu
Lệnh này sẽ tự động drop các table hiện tại trên Turso và tạo mới:
```bash
pnpm sync-mods --reset
```

### 4. Chỉ đồng bộ dữ liệu ModpackIndex
```bash
pnpm sync-mods --only-mpi
```

### 5. Chỉ đồng bộ dữ liệu chi tiết từ Modrinth
```bash
pnpm sync-mods --only-modrinth
```

### 6. Crawl thông tin CurseForge-only
Chạy script crawl các mod CurseForge-only (không có trên Modrinth) vào chung database Turso:
```bash
pnpm crawl-cfwidget
```

---

## ⚡ Các Tối ưu hóa dung lượng (Kích thước cực nhỏ)

Cơ sở dữ liệu đã được tái thiết kế giảm dung lượng từ **1.13 GB** xuống dưới **150 MB** (giảm hơn **87%**):
1. **Loại bỏ `raw_json`**: Trích xuất các trường dữ liệu cần thiết thành các cột cụ thể. Các mảng dữ liệu phức tạp được nén thành các chuỗi JSON tối giản (`links_json`, `modrinth_info_json`, `authors_json`, `categories_json`, `versions_json`).
2. **Xóa bỏ các bảng quan hệ không dùng ở runtime**: Loại bỏ bảng `mod_categories` và `mod_minecraft_versions` (tiết kiệm hơn 1 triệu dòng dữ liệu), lọc dữ liệu trực tiếp trong memory ở tầng ứng dụng.
3. **Nén nội dung lớn**: Nội dung mô tả dự án Markdown (`body`) từ Modrinth được nén bằng `zlib.deflateSync` trước khi lưu vào cột BLOB `body_compressed`.

---

## 🗄️ Cấu trúc Schema Turso

- **`mods`**: Metadata cơ bản của mod từ ModpackIndex.
- **`modrinth_projects`**: Thông tin chi tiết dự án Modrinth (bao gồm mô tả đã nén `body_compressed`).
- **`modrinth_info`**: Bảng quan hệ map giữa ModpackIndex ID và Modrinth Project ID.
- **`curseforge_mods`**: Thông tin mod CurseForge-only.
- **`curseforge_mod_files`**: Danh sách file của mod CurseForge-only.
- **`metadata`**: Trạng thái đồng bộ (ví dụ: `last_fetched_page_mpi`).
