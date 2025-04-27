import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  constructor() {
    super({ session: false }); // 👈 Empêche Passport d’utiliser des sessions
  }
  // You can override handleRequest here for custom error handling if needed
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = (await super.canActivate(context)) as boolean;
    const request = context.switchToHttp().getRequest();
    await super.logIn(request); // Important for session persistence if using sessions alongside (though we primarily use JWT here)
    return result;
  }
}
