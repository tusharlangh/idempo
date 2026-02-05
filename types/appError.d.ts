export interface AppError extends Error {
  statusCode: number;
  code?: string;
  details?: null | Record<string, any>;
  isOperational?: boolean;
}
