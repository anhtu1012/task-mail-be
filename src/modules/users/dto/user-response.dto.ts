import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../common/enums/role.enum';

/**
 * Người dùng ở mức "đủ để hiển thị và để chọn khi giao việc".
 *
 * KHÔNG có tên riêng vì bảng `users` không có cột nào như vậy — tài khoản tạo
 * bằng email/mật khẩu hay bằng Google đều chỉ có email. Frontend hiển thị
 * email, và đó là thứ duy nhất người đọc hiểu được cho tới khi có cột tên thật.
 */
export class UserSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: Role }) role: Role;
}
