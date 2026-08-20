import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { LikeTrackDto } from './like-track.dto';
import { LikesService } from './likes.service';

@Controller('likes')
export class LikesController {
  constructor(
    private readonly likes: LikesService,
    private readonly users: UsersService,
  ) {}

  @Get()
  async get(@Query('scUserId') scUserId: string) {
    return { items: await this.likes.get(scUserId) };
  }

  @Put(':scTrackId')
  async like(@Body() body: LikeTrackDto) {
    const user = await this.users.ensureUser(body);
    await this.likes.like(user.id, body.track);
    return { ok: true };
  }

  @Delete(':scTrackId')
  async unlike(@Param('scTrackId') scTrackId: string, @Query('scUserId') scUserId: string) {
    await this.likes.unlike(scUserId, scTrackId);
    return { ok: true };
  }
}
