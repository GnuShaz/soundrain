import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TrackEntity } from './track.entity';
import { UserEntity } from './user.entity';

// Одна строка на пользователя — восстановление позиции воспроизведения
// при старте приложения.
@Entity('playback_state')
export class PlaybackStateEntity {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @OneToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ type: 'bigint', nullable: true })
  currentTrackId: string | null;

  @ManyToOne(() => TrackEntity, { nullable: true })
  @JoinColumn({ name: 'currentTrackId' })
  currentTrack: TrackEntity | null;

  @Column({ type: 'double precision', default: 0 })
  positionSecs: number;

  @Column({ type: 'double precision', default: 1 })
  volume: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
