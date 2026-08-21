import { Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';

interface SoundCloudAuthResponse {
  access_token?: string;
  user?: {
    id: number;
    username: string;
    permalink: string;
  };
  error?: string;
  error_description?: string;
}

@Injectable()
export class AuthService {
  private readonly CLIENT_ID = 'EXLwg5lHTO2dslU5EePe3xkw0m1h86Cd'; // Fallback, попробуем обновить позже
  private readonly AUTH_ENDPOINT = 'https://api-auth.soundcloud.com/web-auth/sign-in/password';

  async loginWithCredentials(username: string, password: string): Promise<{ oauth_token: string; user: any }> {
    try {
      // Генерируем device_id (формат: 4 блока по 6 цифр)
      const deviceId = this.generateDeviceId();

      // Формируем тело запроса (упрощённая версия без signature пока)
      const payload = {
        client_id: this.CLIENT_ID,
        recaptcha_pubkey: 'null',
        recaptcha_response: 'null',
        credentials: {
          identifier: username,
          password: password,
        },
        device_id: deviceId,
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      };

      const response = await fetch(`${this.AUTH_ENDPOINT}?client_id=${this.CLIENT_ID}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('SoundCloud auth failed:', response.status, errorText);

        if (response.status === 401 || response.status === 403) {
          throw new UnauthorizedException('Неверный логин или пароль');
        }

        throw new ServiceUnavailableException('Ошибка авторизации SoundCloud');
      }

      const data: SoundCloudAuthResponse = await response.json();

      if (data.error) {
        throw new UnauthorizedException(data.error_description || data.error);
      }

      if (!data.access_token) {
        throw new ServiceUnavailableException('SoundCloud не вернул токен');
      }

      return {
        oauth_token: data.access_token,
        user: data.user || null,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ServiceUnavailableException) {
        throw error;
      }
      console.error('Login error:', error);
      throw new ServiceUnavailableException('Не удалось связаться с SoundCloud');
    }
  }

  private generateDeviceId(): string {
    const block = () => Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    return `${block()}-${block()}-${block()}-${block()}`;
  }
}
