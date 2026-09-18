/**
 * Giao diện mặc định của hệ thống — trả về cho người dùng chưa từng lưu.
 *
 * Phải khớp với `DEFAULT_THEME` trong `libs/theme/presets.ts` của frontend.
 * Đây là bản sao có chủ ý: frontend vẫn vẽ được khi backend chưa deploy, nên
 * hai bên cùng giữ một bộ mặc định thay vì bên này đi hỏi bên kia.
 */
export const DEFAULT_THEME = {
  background: 'harbour',
  accent: '#0a436d',
  surfaceOpacity: 0.7,
  surfaceBlur: 16,
} as const;

/** id preset nền: chữ thường, số và gạch nối. */
export const BACKGROUND_ID_PATTERN = /^[a-z0-9-]+$/;
export const BACKGROUND_ID_MAX_LENGTH = 40;

export const ACCENT_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Dưới 0.5 thì chữ tối trên khung kính đặt trên ảnh nền tối chỉ còn tương phản
 * ~3.8:1, dưới chuẩn WCAG AA (4.5:1). Thanh trượt ở frontend đã chặn, backend
 * chặn lại vì client nào cũng có thể bị qua mặt.
 */
export const MIN_SURFACE_OPACITY = 0.5;
export const MAX_SURFACE_OPACITY = 1;

export const MIN_SURFACE_BLUR = 0;
export const MAX_SURFACE_BLUR = 28;

/**
 * Frontend gom lần gọi (debounce 700ms) nên kéo thanh trượt hết cỡ chỉ sinh một
 * request. Trần 60/phút rộng rãi so với thực tế vài request mỗi phiên, nhưng
 * vẫn phải nâng: mức chung của app là 20/phút, quá sát.
 */
export const THEME_RATE_LIMIT = 60;
