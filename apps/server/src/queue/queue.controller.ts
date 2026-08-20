import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { ReplaceQueueDto } from './replace-queue.dto';
import { QueueService } from './queue.service';

@Controller('queue')
export class QueueController {
  constructor(
    private readonly queue: QueueService,
    private readonly users: UsersService,
  ) {}

  @Get()
  async get(@Query('scUserId') scUserId: string) {
    return { items: await this.queue.get(scUserId) };
  }

  @Put()
  async replace(@Body() body: ReplaceQueueDto) {
    const user = await this.users.ensureUser(body);
    await this.queue.replace(user.id, body.items);
    return { ok: true };
  }
}
