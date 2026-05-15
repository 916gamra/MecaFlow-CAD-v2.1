export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 500,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errorHandler = {
  handle: (error: unknown, context?: string) => {
    console.error(`[Error in ${context || 'App'}]`, error);
    
    // In a real production app, this would send to Sentry/LogRocket
    if (error instanceof AppError) {
      // Handle known AppErrors
    } else if (error instanceof Error) {
      // Handle unknown JS Errors
    }
    
    // Return a user-friendly message if needed
    return error instanceof Error ? error.message : 'حدث خطأ غير متوقع';
  }
};
