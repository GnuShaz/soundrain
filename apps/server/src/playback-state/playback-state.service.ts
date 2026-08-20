import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlaybackStateEntity } from '../entities/playback-state.entity';
import { UserEntity } from '../entities/user.entity';
import { TrackDto } from '../tracks/track.dto';
import { TracksService } from '../tracks/tracks.service';

export interface PlaybackStateDto {
  currentTrack: TrackDto | null;
  positionSecs: number;
  volume: number;
}

@Injectable()
export class PlaybackStateService {
  constructor(
    @InjectRepository(PlaybackStateEntity)
    private readonly states: Repository<PlaybackStateEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly tracksService: TracksService,
  ) {}

  async get(scUserId: string): Promise<PlaybackStateDto | null> {
    const user = await this.users.findOne({ where: { scUserId } });
    if (!user) return null;
    const state = await this.states.findOne({ where: { userId: user.id }, relations: ['currentTrack'] });
    if (!state) return null;
    return {
      currentTrack: state.currentTrack ? this.tracksService.toDto(state.currentTrack) : null,
      positionSecs: state.positionSecs,
      volume: state.volume,
    };
  }

  // currentTrack приходит целиком (не просто id): трек, который сейчас
  // играет, может ещё не быть в кэше (например, запущен прямо из поиска,
  // никогда не лайкнут и не был в сохранённой очереди) — без апсерта здесь
  // внешний ключ на tracks просто не найдёт строку.
  async save(userId: string, dto: PlaybackStateDto): Promise<void> {
    if (dto.currentTrack) {
      await this.tracksService.upsert(dto.currentTrack);
    }
    await this.states.upsert(
      {
        userId,
        currentTrackId: dto.currentTrack ? String(dto.currentTrack.id) : null,
        positionSecs: dto.positionSecs,
        volume: dto.volume,
      },
      ['userId'],
    );
  }
}
