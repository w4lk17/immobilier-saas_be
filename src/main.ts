import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  ValidationPipe,
  ClassSerializerInterceptor,
  Logger,
} from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard'; // Adjust path

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS if needed (configure origin appropriately for production)
  app.enableCors({
    origin: ['http://localhost:3000'], // Your frontend URL
    credentials: true, // Allow cookies to be sent
  });

  // Use cookie parser globally
  app.use(cookieParser());

  // Global Pipes for validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties not in DTO
      transform: true, // Automatically transform payloads to DTO instances
    }),
  );

  // Removed global ClassSerializerInterceptor as entities are not used
  // app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Apply JWT Guard Globally (if desired, otherwise apply per controller/handler)
  // const reflector = app.get(Reflector); // Get Reflector instance
  // app.useGlobalGuards(new JwtAuthGuard(reflector)); // Apply global guard

  // Set API prefix globally
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // Set port
  const port = process.env.PORT || 3333;

  // Start listening
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
