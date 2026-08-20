import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueueItemEntity } from '../entities/queue-item.entity';
import { UserEntity } from '../entities/user.entity';
import { TrackDto } from '../tracks/track.dto';
import { TracksService } from '../tracks/tracks.service';

@Injectable()
export class QueueService {
  constructor(
    @InjectRepository(QueueItemEntity)
    private readonly queueItems: Repository<QueueItemEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly tracksService: TracksService,
  ) {}

  // Чтение без побочных эффектов: если пользователь ещё не появлялся
  // (ни разу не сохранял очередь), просто пустой список, не заводим строку.
  async get(scUserId: string): Promise<TrackDto[]> {
    const user = await this.users.findOne({ where: { scUserId } });
    if (!user) return [];
    const rows = await this.queueItems.find({
      where: { userId: user.id },
      relations: ['track'],
      order: { position: 'ASC' },
    });
    return rows.map((row) => this.tracksService.toDto(row.track));
  }

  // Очередь во фронтенде — плоский массив, который целиком заменяется при
  // каждом изменении (играть отсюда/next/prev), поэтому и здесь просто
  // удаляем старые строки и пишем новые — без диффа по позициям.
  async replace(userId: string, tracks: TrackDto[]): Promise<void> {
    for (const track of tracks) {
      await this.tracksService.upsert(track);
    }
    await this.queueItems.delete({ userId });
    if (tracks.length === 0) return;
    const rows = tracks.map((track, index) =>
      this.queueItems.create({
        userId,
        scTrackId: String(track.id),
        position: index,
      }),
    );
    await this.queueItems.save(rows);
  }
}
