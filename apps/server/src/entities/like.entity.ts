import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TrackEntity } from './track.entity';
import { UserEntity } from './user.entity';

export type LikeSyncState = 'synced' | 'pending_like' | 'pending_unlike';

// sync_state — сердце оптимистичного UI (шаг 6): фронт помечает лайк
// pending_* мгновенно, до ответа SoundCloud, и сверяет позже.
@Entity('likes')
@Unique(['userId', 'scTrackId'])
export class LikeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ type: 'bigint' })
  scTrackId: string;

  @ManyToOne(() => TrackEntity)
  @JoinColumn({ name: 'scTrackId' })
  track: TrackEntity;

  @Column({ type: 'timestamptz' })
  likedAt: Date;

  @Column({ type: 'varchar', length: 20, default: 'synced' })
  syncState: LikeSyncState;
}
