import {
  ApiPropertyOptional,
  ApiProperty,
  IntersectionType,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsDateString,
  IsEnum,
  IsHexColor,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { TaskPriority } from '../../../common/enums/task-priority.enum';
import { TaskStatus } from '../../../common/enums/task-status.enum';
import { TaskCategory } from '../../../common/enums/task-category.enum';
import {
  LABEL_ICONS,
  MAX_CARDS_PER_LIST,
} from '../../../common/constants/board.constants';

export class UpdateBoardDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  starred?: boolean;
}

export class CreateListDto {
  @ApiProperty({ example: 'Tuần này' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @ApiPropertyOptional({ description: 'Bỏ trống = thêm vào cuối bảng' })
  @IsOptional()
  @IsNumber()
  position?: number;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  mapsToStatus?: TaskStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  wipLimit?: number;
}

export class UpdateListDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ description: 'null để bỏ giới hạn' })
  @IsOptional()
  @IsInt()
  @Min(1)
  wipLimit?: number | null;

  @ApiPropertyOptional({
    description:
      'true => thẻ trong danh sách quay về Hộp thư đến, không bị xoá',
  })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @ApiPropertyOptional({ enum: TaskStatus, description: 'null để bỏ ánh xạ' })
  @IsOptional()
  @IsEnum(TaskStatus)
  mapsToStatus?: TaskStatus | null;
}

export class MoveListDto {
  @ApiProperty()
  @IsNumber()
  position: number;
}

export class CardRepeatDtoInput {
  @ApiProperty({ enum: ['DAY', 'WEEK', 'MONTH'] })
  @IsEnum({ DAY: 'DAY', WEEK: 'WEEK', MONTH: 'MONTH' })
  unit: 'DAY' | 'WEEK' | 'MONTH';

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(365)
  interval: number;

  /**
   * Các trường dưới đây là phần "lặp nâng cao". Đều tuỳ chọn, và bỏ trống hết
   * thì hành vi đúng bằng bản cũ: lặp mãi, giữ nguyên thứ/ngày của hạn chót.
   */
  @ApiPropertyOptional({
    type: [Number],
    description: '0=CN..6=T7, chỉ có tác dụng khi unit=WEEK',
    example: [1, 4],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  @ApiPropertyOptional({ description: '1..31, chỉ có tác dụng khi unit=MONTH' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number | null;

  @ApiPropertyOptional({ description: 'ISO — ngừng lặp sau mốc này' })
  @IsOptional()
  @IsDateString()
  until?: string | null;

  @ApiPropertyOptional({
    description: 'Số lượt còn lại sau lượt hiện tại. Bỏ trống = lặp mãi',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  remaining?: number | null;
}

export class CreateCardDto {
  @ApiProperty({ example: 'Gọi khách hàng Hải An' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title: string;

  @ApiPropertyOptional({ description: 'Bỏ trống = thêm vào cuối cột' })
  @IsOptional()
  @IsNumber()
  position?: number;

  @ApiPropertyOptional({ description: 'HTML Quill — backend tự làm sạch' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional({ enum: TaskPriority })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ enum: TaskCategory })
  @IsOptional()
  @IsEnum(TaskCategory)
  category?: TaskCategory;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  labelIds?: string[];

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimateMinutes?: number;

  @ApiPropertyOptional({ type: CardRepeatDtoInput })
  @IsOptional()
  @ValidateNested()
  @Type(() => CardRepeatDtoInput)
  repeat?: CardRepeatDtoInput | null;

  @ApiPropertyOptional({ description: 'CSS gradient hoặc URL ảnh bìa' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  cover?: string;

  /**
   * Chỉ dùng khi tạo thẳng vào Hộp thư đến (`POST /tasks/inbox/cards`): hộp thư
   * đến không thuộc cột nào nên không suy ra được dự án. Tạo trong một cột
   * (`POST /lists/:id/cards`) thì trường này bị bỏ qua — dự án suy từ bảng chứa
   * cột, và đó mới là nguồn đúng.
   */
  @ApiPropertyOptional({
    description:
      'Chỉ có tác dụng ở /tasks/inbox/cards. Bỏ trống = dự án mặc định',
  })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}

export class MoveCardDto {
  @ApiPropertyOptional({
    description: 'null = trả thẻ về Hộp thư đến',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  listId?: string | null;

  @ApiProperty()
  @IsNumber()
  position: number;
}

export class SnoozeCardDto {
  @ApiPropertyOptional({ description: 'null để bỏ hạn', nullable: true })
  @IsOptional()
  @IsDateString()
  deadline?: string | null;
}

export class CreateLabelDto {
  @ApiProperty({ example: 'Khách hàng' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @ApiProperty({ example: '#e63946' })
  @IsHexColor()
  color: string;

  @ApiPropertyOptional({ enum: LABEL_ICONS, example: 'tag' })
  @IsOptional()
  @IsIn(LABEL_ICONS as readonly string[])
  icon?: string | null;
}

export class UpdateLabelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ example: '#e63946' })
  @IsOptional()
  @IsHexColor()
  color?: string;

  /** `null` = gỡ icon, đưa nhãn về dạng chỉ có màu */
  @ApiPropertyOptional({ enum: LABEL_ICONS, nullable: true, example: 'tag' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(LABEL_ICONS as readonly string[])
  icon?: string | null;
}

export class SetCardLabelsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  labelIds: string[];
}

export class CreateChecklistDto {
  @ApiProperty({ example: 'Chuẩn bị tài liệu' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;
}

export class CreateChecklistItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  content: string;

  @ApiPropertyOptional({ description: 'Bỏ trống = thêm vào cuối' })
  @IsOptional()
  @IsNumber()
  position?: number;
}

export class UpdateChecklistItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  checked?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  position?: number;
}

export class UpsertNoteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  content: string;
}

export class CreateAttachmentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ enum: ['IMAGE', 'FILE', 'LINK'] })
  @IsEnum({ IMAGE: 'IMAGE', FILE: 'FILE', LINK: 'LINK' })
  kind: 'IMAGE' | 'FILE' | 'LINK';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sizeBytes?: number;
}

export class UpdateAttachmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCover?: boolean;
}

/**
 * `?projectId=` trên mọi endpoint bảng.
 *
 * Bảng thuộc dự án, nên thiếu `projectId` thì không suy ra được bảng nào. Bỏ
 * trống = dự án mặc định của người gọi — frontend luôn gửi, còn mặc định ở đây
 * là để một lần gọi tay (curl, Swagger) không phải tra id trước.
 */
export class ProjectScopeQueryDto {
  @ApiPropertyOptional({ description: 'Bỏ trống = dự án mặc định' })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}

/** `?tz=` on every endpoint that has to cut a day boundary (mục 4.5). */
export class TimezoneQueryDto extends ProjectScopeQueryDto {
  @ApiPropertyOptional({ example: 'Asia/Ho_Chi_Minh' })
  @IsOptional()
  @IsString()
  tz?: string;
}

export class AgendaQueryDto extends TimezoneQueryDto {
  @ApiPropertyOptional({
    example: '2026-09-15',
    description: 'Bỏ trống = hôm nay',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date phải có dạng YYYY-MM-DD' })
  date?: string;
}

export class BoardFullQueryDto extends TimezoneQueryDto {
  @ApiPropertyOptional({ default: 20, maximum: MAX_CARDS_PER_LIST })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CARDS_PER_LIST)
  cardsPerList?: number;
}

export class ListCardsQueryDto extends ProjectScopeQueryDto {
  @ApiPropertyOptional({
    description: 'position của thẻ cuối đã nhận — không phải số trang',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cursor?: number;

  @ApiPropertyOptional({ default: 20, maximum: MAX_CARDS_PER_LIST })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CARDS_PER_LIST)
  limit?: number;
}

export class SearchQueryDto extends ProjectScopeQueryDto {
  @ApiProperty({ example: 'bao gia' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(({ value }: { value: string }) => value?.trim())
  q: string;

  @ApiPropertyOptional({ default: 8, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/**
 * `?undo=true` bỏ bước ghi `TaskActivity`, để Ctrl+Z không làm rác nhật ký
 * (mục 5.7.3 của đặc tả).
 *
 * Mọi endpoint ghi đều **nhận** cờ này, kể cả endpoint hiện chưa ghi nhật ký:
 * nếu không nhận thì `forbidNonWhitelisted` trả 400, và frontend sẽ phải nhớ
 * endpoint nào được gửi cờ, endpoint nào không.
 */
export class UndoFlagQueryDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  // Đọc `obj` (giá trị thô) chứ không đọc `value`: `enableImplicitConversion`
  // đã ép chuỗi về Boolean trước khi tới đây, mà `Boolean('false')` là `true` —
  // nên `?undo=false` sẽ bị hiểu thành có undo nếu đọc `value`.
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    const raw = obj?.undo;
    return raw === 'true' || raw === '1' || raw === true;
  })
  @IsBoolean()
  undo?: boolean;
}

/**
 * Phải là class thật chứ không phải `TimezoneQueryDto & UndoFlagQueryDto`:
 * intersection của TypeScript bị xoá lúc biên dịch nên Nest chỉ thấy `Object`,
 * bỏ qua ValidationPipe, và `undo` nằm lại dưới dạng chuỗi `'true'` — so sánh
 * `=== true` sẽ luôn sai.
 */
export class SnoozeQueryDto extends IntersectionType(
  TimezoneQueryDto,
  UndoFlagQueryDto,
) {}
