import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('冷藏集装箱异常通知服务')
    .setDescription('面向运输系统、设备平台和客服系统的统一告警入口')
    .setVersion('1.0.0')
    .addTag('告警规则', '按货类配置告警规则')
    .addTag('设备数据', '接收温度、位置、电源、门磁等设备数据')
    .addTag('告警管理', '告警查询和管理')
    .addTag('通知管理', '通知发送和重试')
    .addTag('处置回执', '告警处理结果回填')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`
╔════════════════════════════════════════════════════════════╗
║     冷藏集装箱异常通知服务已启动                            ║
╠════════════════════════════════════════════════════════════╣
║  服务地址: http://localhost:${port}                           ║
║  API文档:  http://localhost:${port}/api-docs                 ║
║  API前缀:  /api                                             ║
╚════════════════════════════════════════════════════════════╝
  `);
}

bootstrap();
