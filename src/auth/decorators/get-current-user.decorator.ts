import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayloadWithRt } from '../types';

// Decorator to get specific field from user payload (e.g., userId)
export const GetCurrentUser = createParamDecorator(
  (data: keyof JwtPayloadWithRt | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();
    if (!data) return request.user; // Return the whole user object if no key specified
    return request.user?.[data];
  },
);
