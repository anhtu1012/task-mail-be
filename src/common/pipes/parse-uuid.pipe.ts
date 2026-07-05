import { ParseUUIDPipe } from '@nestjs/common';

/** Named alias kept in common/pipes so call sites don't reach into @nestjs/common directly. */
export class ParseObjectIdPipe extends ParseUUIDPipe {
  constructor() {
    super({ version: '4' });
  }
}
