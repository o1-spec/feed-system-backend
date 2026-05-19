import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

/**
 * TransformInterceptor — wraps every successful response in a consistent envelope.
 *
 * Why a response envelope?
 * — Clients can reliably check `response.success` instead of inspecting status codes alone.
 * — Adds a timestamp for cache validation on the client side.
 * — Makes it trivial to add pagination meta later without breaking existing consumers.
 *
 * Output shape: { success: true, data: <original response>, timestamp: "..." }
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
