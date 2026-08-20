import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { LikeEntity } from './entities/like.entity';
import { PlaybackStateEntity } from './entities/playback-state.entity';
import { QueueItemEntity } from './entities/queue-item.entity';
import { TrackEntity } from './entities/track.entity';
import { UserEntity } from './entities/user.entity';

config();

// Единственный источник правды о подключении к БД — используется и NestJS-ом
// (через TypeOrmModule.forRoot ниже в app.module.ts), и CLI-командами
// миграций (`pnpm typeorm migration:generate/run`). synchronize всегда
// false — схема меняется только явными миграциями, чтобы её можно было
// ревьюить.
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  entities: [UserEntity, TrackEntity, LikeEntity, QueueItemEntity, PlaybackStateEntity],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
});
