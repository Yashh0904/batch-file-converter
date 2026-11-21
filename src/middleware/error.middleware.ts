import type { NextFunction, Request, Response } from "express";

export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {    
    super(message);
    this.message = message;
    this.statusCode = statusCode;
  }
}

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    error: message,
  });
};