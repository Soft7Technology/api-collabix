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
        const details = error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        }));

        const customMessage = details.length > 0
          ? details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join("; ")
          : "Validation Error";

        res.status(400).json({
          error: {
            message: customMessage,
            status: 400,
            details,
          },
        });
        return;
      }
      next(error);
    }
  };
};
