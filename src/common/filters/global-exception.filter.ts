import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
}

/**
 * GlobalExceptionFilter — catches ALL exceptions and returns a consistent error shape.
 *
 * Why this matters:
 * — Clients should never get raw 500 stack traces in production.
 * — Uniform error structure makes frontend error handling simpler.
 * — Prisma errors (P2002, P2025, etc.) are mapped to meaningful HTTP codes.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const res = exceptionResponse as Record<string, unknown>;
        message = (res.message as string | string[]) || message;
        error = (res.error as string) || error;
      }
      error = exception.name;
    } else if (this.isPrismaError(exception)) {
      const prismaError = exception as Record<string, unknown>;
      const code = prismaError.code as string;

      if (code === 'P2002') {
        statusCode = HttpStatus.CONFLICT;
        message = 'Resource already exists';
        error = 'Conflict';
      } else if (code === 'P2025') {
        statusCode = HttpStatus.NOT_FOUND;
        message = 'Resource not found';
        error = 'Not Found';
      } else {
        this.logger.error(`Unhandled Prisma error: ${code}`, prismaError);
      }
    } else {
      this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : exception);
    }

    const errorResponse: ErrorResponse = {
      statusCode,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(errorResponse);
  }

  private isPrismaError(exception: unknown): boolean {
    return (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      typeof (exception as Record<string, unknown>).code === 'string' &&
      ((exception as Record<string, unknown>).code as string).startsWith('P')
    );
  }
}
