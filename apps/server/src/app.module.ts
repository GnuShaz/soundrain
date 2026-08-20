import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LikeEntity } from './entities/like.entity';
import { PlaybackStateEntity } from './entities/playback-state.entity';
import { QueueItemEntity } from './entities/queue-item.entity';
import { TrackEntity } from './entities/track.entity';
import { UserEntity } from './entities/user.entity';
import { LikesModule } from './likes/likes.module';
import { PlaybackStateModule } from './playback-state/playback-state.module';
import { QueueModule } from './queue/queue.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      synchronize: false,
      entities: [UserEntity, TrackEntity, LikeEntity, QueueItemEntity, PlaybackStateEntity],
    }),
    UsersModule,
    LikesModule,
    QueueModule,
    PlaybackStateModule,
  ],
})
export class AppModule {}
