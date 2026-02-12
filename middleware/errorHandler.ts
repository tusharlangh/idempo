import type { NextFunction, Request, Response } from "express";
import type { AppError as AppErrorConfig } from "../types/appError.ts";
import { errorMiddlewareLogger } from "../utils/logger.ts";

export class AppError extends Error {
  statusCode: number;
  code?: string;
  details?: null | Record<string, any>;
  isOperational?: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    details = null,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, "NOT_FOUND");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details = null) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

export function errorHandler(
  err: AppErrorConfig,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  let statusCode = err.statusCode || 500;
  let code = err.code || "INTERNAL_ERROR";
  let message = err.message || "An unexpected error occurred";
  let details = err.details || null;

  errorMiddlewareLogger.error({
    timestamp: new Date().toISOString(),
    error: message,
    code: code,
    statusCode: statusCode,
    path: req.path,
    method: req.method,
  });

  if (err.isOperational) {
    return res.status(statusCode).json({
      success: false,
      error: {
        code: code,
        message: message,
        ...(details && { details }),
      },
      data: null,
    });
  } else {
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message:
          process.env.NODE_ENV === "production"
            ? "An unexpected error occurred"
            : message,
      },
      data: null,
    });
  }
}
