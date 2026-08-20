import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Компаньон-сервис для одного локального десктоп-клиента — CORS открыт
  // только потому, что Tauri webview обращается сюда как к обычному HTTP,
  // сервис не смотрит наружу за пределы localhost.
  app.enableCors({ origin: true });
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

bootstrap();
