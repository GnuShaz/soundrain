import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaybackStateEntity } from '../entities/playback-state.entity';
import { UserEntity } from '../entities/user.entity';
import { TracksModule } from '../tracks/tracks.module';
import { UsersModule } from '../users/users.module';
import { PlaybackStateController } from './playback-state.controller';
import { PlaybackStateService } from './playback-state.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlaybackStateEntity, UserEntity]),
    TracksModule,
    UsersModule,
  ],
  controllers: [PlaybackStateController],
  providers: [PlaybackStateService],
})
export class PlaybackStateModule {}
