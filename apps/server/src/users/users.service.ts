import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';

export interface EnsureUserInput {
  scUserId: string;
  username: string;
  avatarUrl: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  // Локальный сервис знает только своего пользователя — при первом же
  // запросе от десктоп-клиента заводим (или обновляем) строку по
  // scUserId, дальше likes/queue/playback-state ссылаются на внутренний uuid.
  async ensureUser(input: EnsureUserInput): Promise<UserEntity> {
    const existing = await this.users.findOne({ where: { scUserId: input.scUserId } });
    if (existing) {
      existing.username = input.username;
      existing.avatarUrl = input.avatarUrl;
      return this.users.save(existing);
    }
    return this.users.save(
      this.users.create({
        scUserId: input.scUserId,
        username: input.username,
        avatarUrl: input.avatarUrl,
      }),
    );
  }
}
