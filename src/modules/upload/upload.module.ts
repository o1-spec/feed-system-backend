import { Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service.js';
import { UploadController } from './upload.controller.js';

@Module({
  controllers: [UploadController],
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class UploadModule {}
