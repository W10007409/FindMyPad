export class AppError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message); this.name = new.target.name;
  }
}
export class ConflictError extends AppError { constructor(m = 'conflict') { super(409, 'CONFLICT', m); } }
export class NotFoundError extends AppError { constructor(m = 'not found') { super(404, 'NOT_FOUND', m); } }
export class UnauthorizedError extends AppError { constructor(m = 'unauthorized') { super(401, 'UNAUTHORIZED', m); } }
export class ValidationError extends AppError { constructor(m = 'validation') { super(400, 'VALIDATION', m); } }
