import { Request, Response, NextFunction } from "express";
import { AnyZodObject, ZodError } from "zod";

export const validate = (schema: AnyZodObject) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const firstError = error.errors[0];
        const customMessage = firstError
          ? `${firstError.message}`
          : "Validation Error";

        res.status(400).json({
          error: {
            message: customMessage,
            status: 400,
          },
        });
        return;
      }
      next(error);
    }
  };
};
