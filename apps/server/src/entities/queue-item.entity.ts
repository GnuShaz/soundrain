import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TrackEntity } from './track.entity';
import { UserEntity } from './user.entity';

@Entity('queue_items')
@Unique(['userId', 'position'])
export class QueueItemEntity {
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

  @Column({ type: 'int' })
  position: number;

  @CreateDateColumn()
  addedAt: Date;
}
