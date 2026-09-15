import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configModules } from '../config';
import { PrismaModule } from '../infrastructure/database/prisma.module';
import { BoardModule } from '../modules/board/board.module';

/**
 * Root module for one-off CLI scripts.
 *
 * Deliberately **not** `AppModule`: that one pulls in `ScheduleModule` and with
 * it three live cron jobs — the Gmail ingestion (which creates real tasks), the
 * Zalo deadline reminder (which sends real messages) and the keep-alive ping.
 * A maintenance script that happens to run for a minute should never fire any
 * of those as a side effect.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: configModules }),
    PrismaModule,
    BoardModule,
  ],
})
export class ScriptModule {}
