import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Локально всегда один пользователь (один SoundCloud-аккаунт в приложении),
// но схема на много — дешевле сейчас, чем мигрировать позже, если появится
// профиль/переключение аккаунтов.
@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // SoundCloud-id превышает диапазон int32 (видели id вида 2342417480 в
  // ответах api-v2) — только bigint.
  @Column({ type: 'bigint', unique: true })
  scUserId: string;

  @Column()
  username: string;

  @Column({ type: 'text', nullable: true })
  avatarUrl: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
