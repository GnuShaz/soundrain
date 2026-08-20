import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// Кэш метаданных трека: очередь и лайки ссылаются на трек, которого может
// уже не быть в свежей ленте SoundCloud — без своей копии title/artwork
// нечего было бы показать в очереди/лайках после перезапуска.
@Entity('tracks')
export class TrackEntity {
  @PrimaryColumn({ type: 'bigint' })
  scTrackId: string;

  @Column()
  title: string;

  @Column()
  artistUsername: string;

  @Column({ type: 'text', nullable: true })
  artworkUrl: string | null;

  @Column({ type: 'int' })
  durationMs: number;

  @Column({ type: 'text' })
  permalinkUrl: string;

  @Column({ default: true })
  streamable: boolean;

  @UpdateDateColumn()
  cachedAt: Date;
}
