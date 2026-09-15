import { AppValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  SnoozeQueryDto,
  UndoFlagQueryDto,
  TimezoneQueryDto,
} from './board-request.dto';

/**
 * Query strings arrive as strings, so `?undo=true` only becomes a real boolean
 * if Nest can see a DTO **class** for the parameter.
 *
 * A `TimezoneQueryDto & UndoFlagQueryDto` intersection used to be passed here:
 * TypeScript erases it, Nest falls back to `Object`, validation is skipped, and
 * `undo` stays the string `'true'` — so every `undo === true` check silently
 * evaluated to false and the activity log got polluted anyway.
 */
const transform = <T>(cls: new () => T, query: Record<string, string>) =>
  AppValidationPipe.transform(query, {
    type: 'query',
    metatype: cls,
  }) as Promise<T>;

describe('cờ ?undo', () => {
  it('biến "true" thành boolean true', async () => {
    const dto = await transform(UndoFlagQueryDto, { undo: 'true' });
    expect(dto.undo).toBe(true);
  });

  it('chấp nhận "1"', async () => {
    const dto = await transform(UndoFlagQueryDto, { undo: '1' });
    expect(dto.undo).toBe(true);
  });

  it.each(['false', '0', 'yes'])('coi "%s" là không undo', async (value) => {
    const dto = await transform(UndoFlagQueryDto, { undo: value });
    expect(dto.undo).toBe(false);
  });

  it('bỏ trống thì undefined, không phải false', async () => {
    const dto = await transform(UndoFlagQueryDto, {});
    expect(dto.undo).toBeUndefined();
  });

  describe('SnoozeQueryDto (tz + undo)', () => {
    it('là class thật nên transform được cả hai trường', async () => {
      const dto = await transform(SnoozeQueryDto, {
        tz: 'Asia/Ho_Chi_Minh',
        undo: 'true',
      });
      expect(dto.undo).toBe(true);
      expect(dto.tz).toBe('Asia/Ho_Chi_Minh');
    });

    it('kế thừa đủ cả hai DTO gốc', () => {
      const dto = new SnoozeQueryDto();
      expect(dto).toBeInstanceOf(SnoozeQueryDto);
      // Cảnh báo hồi quy: nếu ai đó đổi lại thành intersection type thì
      // SnoozeQueryDto không còn là class và dòng dưới sẽ hỏng.
      expect(typeof SnoozeQueryDto).toBe('function');
      expect(typeof TimezoneQueryDto).toBe('function');
    });
  });

  it('từ chối giá trị không phải boolean sau transform', async () => {
    // Transform ép mọi thứ về boolean nên không có đường nào lọt qua IsBoolean.
    const dto = await transform(UndoFlagQueryDto, { undo: 'rubbish' });
    expect(dto.undo).toBe(false);
  });
});
