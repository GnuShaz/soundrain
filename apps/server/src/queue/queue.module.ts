import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueItemEntity } from '../entities/queue-item.entity';
import { UserEntity } from '../entities/user.entity';
import { TracksModule } from '../tracks/tracks.module';
import { UsersModule } from '../users/users.module';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([QueueItemEntity, UserEntity]),
    TracksModule,
    UsersModule,
  ],
  controllers: [QueueController],
  providers: [QueueService],
})
export class QueueModule {}
