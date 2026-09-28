# FE: gộp request lúc mở màn hình vào `/boards/me/full`

> Áp dụng từ backend commit có `GET /boards/me/full?include=…`. **Không có thay đổi
> phá vỡ** — mọi endpoint cũ vẫn chạy y nguyên, FE chuyển dần được.

## 1. Vì sao phải sửa

Lúc mở dashboard, FE đang bắn ~10 request song song. Mỗi request giữ một kết nối
DB trong lúc chạy, nên càng nhiều request thì càng phải xếp hàng chờ kết nối —
đây chính là lý do các API "liên quan task" từng mất 1,5–2 giây.

Bốn trong số đó trả dữ liệu mà `/boards/me/full` hoặc đã có sẵn, hoặc nay có thể
gộp vào:

| Request hiện tại | Sau khi sửa |
|---|---|
| `GET /projects?includeArchived=false` | gộp vào `/full` qua `include=projects` |
| `GET /task-types` | gộp vào `/full` qua `include=taskTypes` |
| `GET /boards/me/labels?projectId=…` | **bỏ hẳn** — `/full` luôn trả `labels` (từ trước tới giờ) |
| `GET /boards/me/full?…` | giữ, thêm `include` |

Kết quả: **10 → 7 request** mỗi lần mở dashboard.

Đo trên cùng máy, cùng DB, trung vị 5 lần tải dashboard:

| | Số request | Thời gian cả đợt |
|---|---|---|
| Backend cũ, FE hiện tại | 10 | 487 ms |
| Backend mới, FE hiện tại | 10 | 184 ms |
| Backend mới, FE sửa theo tài liệu này | 7 | 180 ms |

Phần lớn tốc độ đến từ backend (cache + pooler mới) nên FE chưa sửa cũng đã
nhanh hơn. Phần FE sửa không làm trang nhanh thêm bao nhiêu ở tải thấp, nhưng
**giảm 30% số kết nối DB mỗi người dùng** — đó mới là thứ quyết định hệ thống
chịu được bao nhiêu người cùng lúc.

## 2. Việc FE cần làm

### 2.1 Lần tải đầu của màn hình bảng/dashboard

```http
GET /boards/me/full?projectId=<id>&cardsPerList=20&tz=Asia%2FBangkok&include=projects,taskTypes
```

Response vẫn là `BoardFullResponseDto` như cũ, **thêm** hai trường:

```ts
interface BoardFullResponse {
  board: BoardDto;
  lists: TaskListDto[];
  labels: BoardLabelDto[];          // đã có từ trước — dùng cái này, đừng gọi /boards/me/labels
  cards: CardSummaryDto[];
  cardCounts: Record<string, number>;
  today: TodayMetricsDto;

  // MỚI — chỉ có khi được xin qua `include`
  projects?: { items: ProjectDto[]; total: number };  // y hệt GET /projects?includeArchived=false
  taskTypes?: TaskTypeResponseDto[];                  // y hệt GET /task-types
}
```

`projects` và `taskTypes` có **đúng cùng cấu trúc** với response của endpoint
riêng, nên code render hiện tại dùng lại được nguyên vẹn — chỉ đổi nguồn dữ liệu.

Nếu FE có tầng cache phía client (React Query, SWR, store…), hãy **đổ dữ liệu vào
đúng khoá cache của endpoint cũ** để các component đang đọc `projects`,
`task-types`, `labels` không phải sửa:

```ts
const full = await api.get<BoardFullResponse>('/boards/me/full', {
  params: { projectId, cardsPerList: 20, tz, include: 'projects,taskTypes' },
});

// Ví dụ với React Query — tên khoá thay bằng khoá FE đang dùng
queryClient.setQueryData(['projects', { includeArchived: false }], full.data.projects);
queryClient.setQueryData(['task-types'], full.data.taskTypes);
queryClient.setQueryData(['labels', projectId], full.data.labels);
```

Sau đó **xoá** ba lời gọi `GET /projects?includeArchived=false`, `GET /task-types`,
`GET /boards/me/labels` khỏi luồng mở màn hình.

### 2.2 Tải lại bảng (sau kéo thả, thêm cột, hoàn thành thẻ…)

Gọi `/boards/me/full` **không** kèm `include`. Response giữ nguyên như trước,
không có `projects`/`taskTypes` — đừng ghi đè dữ liệu cache phía client bằng
`undefined`.

### 2.3 Đổi dự án

`GET /boards/me/full?projectId=<dự án mới>` **không** cần `include`: danh sách dự
án không đổi theo dự án đang mở, còn task types là danh mục dùng chung.

### 2.4 Những chỗ vẫn gọi riêng

| Request | Lý do giữ riêng |
|---|---|
| `GET /projects?includeArchived=true` (trang quản lý dự án) | `/full` chỉ gộp dự án **đang hoạt động** |
| `GET /tasks?…`, `GET /tasks?kind=EVENT…` | có phân trang/lọc riêng, dữ liệu đổi liên tục |
| `GET /boards/me/agenda` | theo ngày, đổi liên tục |
| `GET /auth/me`, `GET /users`, `GET /mail-accounts` | thuộc module khác; chưa gộp đợt này |

## 3. Độ tươi của dữ liệu (quan trọng)

Backend giờ cache ba loại dữ liệu. Sau mọi thao tác ghi, backend **tự xoá cache**
— FE refetch như cũ là thấy dữ liệu mới, **không cần làm gì thêm**, với một ngoại lệ:

| Dữ liệu | Khi nào thấy thay đổi |
|---|---|
| Task types (admin sửa) | ngay |
| Nhãn (tạo/sửa/xoá) | ngay |
| Dự án: tên, màu, icon, mặc định, lưu trữ, xoá | ngay |
| **Dự án: `stats`** (`totalTasks`, `openTasks`, `overdueTasks`, `lastActivityAt`) | **trễ tối đa 30 giây** |

`stats` đổi theo mọi lần tạo/sửa/hoàn thành việc, nên backend không xoá cache
theo từng thao tác đó mà để tự hết hạn sau 30 giây. Nếu có màn nào cần số việc
nhảy **ngay** sau khi tạo/hoàn thành việc (ví dụ badge trên bộ chọn dự án), hãy
cập nhật lạc quan (optimistic) phía client thay vì refetch `/projects`.

## 4. Lỗi

- `include` chứa giá trị lạ (ví dụ `include=users`) → `400`. Giá trị hợp lệ:
  `projects`, `taskTypes` (phân biệt hoa thường).
- Cả hai dạng đều được nhận: `include=projects,taskTypes` và
  `include=projects&include=taskTypes`.
- Các lỗi khác của `/full` không đổi.

## 5. Checklist kiểm thử cho FE

- [ ] Mở dashboard: tab Network chỉ còn **một** request `/boards/me/full` (có
      `include`), **không** còn `/projects?includeArchived=false`,
      `/task-types`, `/boards/me/labels`.
- [ ] Bộ chọn dự án, dropdown task type, danh sách nhãn hiển thị đúng như trước.
- [ ] Kéo thả thẻ → `/full` tải lại **không** có `include`, bộ chọn dự án và
      task types không bị mất dữ liệu.
- [ ] Đổi dự án → bảng mới hiện đúng, bộ chọn dự án giữ nguyên.
- [ ] Tạo/sửa/xoá nhãn → danh sách nhãn cập nhật ngay sau khi refetch.
- [ ] Đổi tên / đặt mặc định / lưu trữ dự án → bộ chọn cập nhật ngay.
- [ ] Tạo việc mới → số việc trên dự án cập nhật (ngay nếu làm optimistic, hoặc
      trong ≤30 giây nếu refetch).
- [ ] Trang quản lý dự án (có dự án lưu trữ) vẫn gọi
      `/projects?includeArchived=true` và hiện đủ.
