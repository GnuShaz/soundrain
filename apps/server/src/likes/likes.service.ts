import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LikeEntity } from '../entities/like.entity';
import { UserEntity } from '../entities/user.entity';
import { TrackDto } from '../tracks/track.dto';
import { TracksService } from '../tracks/tracks.service';

@Injectable()
export class LikesService {
  constructor(
    @InjectRepository(LikeEntity)
    private readonly likes: Repository<LikeEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly tracksService: TracksService,
  ) {}

  async get(scUserId: string): Promise<TrackDto[]> {
    const user = await this.users.findOne({ where: { scUserId } });
    if (!user) return [];
    const rows = await this.likes.find({
      where: { userId: user.id },
      relations: ['track'],
      order: { likedAt: 'DESC' },
    });
    return rows.map((row) => this.tracksService.toDto(row.track));
  }

  async like(userId: string, track: TrackDto): Promise<void> {
    await this.tracksService.upsert(track);
    await this.likes.upsert(
      {
        userId,
        scTrackId: String(track.id),
        likedAt: new Date(),
        syncState: 'synced',
      },
      ['userId', 'scTrackId'],
    );
  }

  async unlike(scUserId: string, scTrackId: string): Promise<void> {
    const user = await this.users.findOne({ where: { scUserId } });
    if (!user) return;
    await this.likes.delete({ userId: user.id, scTrackId });
  }
}
