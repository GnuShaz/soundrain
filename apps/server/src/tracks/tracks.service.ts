import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrackEntity } from '../entities/track.entity';
import { TrackDto } from './track.dto';

@Injectable()
export class TracksService {
  constructor(
    @InjectRepository(TrackEntity)
    private readonly tracks: Repository<TrackEntity>,
  ) {}

  async upsert(dto: TrackDto): Promise<TrackEntity> {
    const scTrackId = String(dto.id);
    await this.tracks.upsert(
      {
        scTrackId,
        title: dto.title,
        artistUsername: dto.artist,
        artworkUrl: dto.artworkUrl,
        durationMs: dto.durationMs,
        permalinkUrl: dto.permalinkUrl,
        streamable: dto.streamable,
      },
      ['scTrackId'],
    );
    return this.tracks.findOneByOrFail({ scTrackId });
  }

  toDto(track: TrackEntity): TrackDto {
    return {
      id: Number(track.scTrackId),
      title: track.title,
      artist: track.artistUsername,
      artworkUrl: track.artworkUrl,
      durationMs: track.durationMs,
      permalinkUrl: track.permalinkUrl,
      streamable: track.streamable,
    };
  }
}
