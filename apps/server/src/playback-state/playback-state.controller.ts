import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { PlaybackStateService } from './playback-state.service';
import { SavePlaybackStateDto } from './save-playback-state.dto';

@Controller('playback-state')
export class PlaybackStateController {
  constructor(
    private readonly playbackState: PlaybackStateService,
    private readonly users: UsersService,
  ) {}

  @Get()
  get(@Query('scUserId') scUserId: string) {
    return this.playbackState.get(scUserId);
  }

  @Put()
  async save(@Body() body: SavePlaybackStateDto) {
    const user = await this.users.ensureUser(body);
    await this.playbackState.save(user.id, body);
    return { ok: true };
  }
}
