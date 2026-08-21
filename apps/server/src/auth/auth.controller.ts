import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';

class LoginDto {
  username: string;
  password: string;
}

@Controller('auth/soundcloud')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    const { username, password } = loginDto;

    if (!username || !password) {
      return {
        error: 'Требуется username и password',
      };
    }

    try {
      const result = await this.authService.loginWithCredentials(username, password);
      return result;
    } catch (error) {
      // NestJS автоматически обработает HttpException
      throw error;
    }
  }
}
