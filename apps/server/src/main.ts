import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Компаньон-сервис для десктоп-клиента — CORS открыт, потому что Tauri
  // webview обращается сюда как к обычному HTTP, а не как браузерная
  // страница с определённым origin.
  app.enableCors({ origin: true });

  // У likes/queue/playback-state нет проверки, что scUserId в теле запроса
  // реально принадлежит вызывающему — это не страшно, пока сервис слушает
  // только 127.0.0.1, но при разворачивании наружу (см. docker-compose,
  // прод) кто угодно смог бы читать/писать чужие данные, просто зная id.
  // Простой общий секрет — не полноценная авторизация по пользователям, но
  // закрывает эндпоинты от случайных посторонних из интернета. В локальной
  // разработке API_KEY не задан — проверка не включается.
  const apiKey = process.env.API_KEY;
  if (apiKey) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.header('x-api-key') === apiKey) {
        next();
        return;
      }
      res.status(401).json({ message: 'unauthorized' });
    });
  }

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

bootstrap();
