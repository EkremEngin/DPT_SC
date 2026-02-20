import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain, body } from 'express-validator';

/**
 * Middleware to handle validation errors from express-validator
 * Returns 400 with structured error messages if validation fails
 */
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({
            error: 'Validation Error',
            details: errors.array().map((err: any) => ({
                field: err.type === 'field' ? (err as any).path : 'unknown',
                message: err.msg
            }))
        });
        return;
    }
    next();
};

/**
 * Helper to create a validation middleware chain
 * Combines validation rules with error handling
 */
export const validate = (validations: ValidationChain[]) => [
    ...validations,
    handleValidationErrors
];

/**
 * Common validation rules
 */
export const commonValidations = {
    // Username: alphanumeric, 3-30 chars
    username: body('username')
        .trim()
        .isLength({ min: 3, max: 30 })
        .withMessage('Username must be 3-30 characters')
        .isAlphanumeric()
        .withMessage('Username must contain only letters and numbers'),

    // Password: min 8 chars, 1 uppercase, 1 lowercase, 1 number
    password: body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/[A-Z]/)
        .withMessage('Password must contain at least one uppercase letter')
        .matches(/[a-z]/)
        .withMessage('Password must contain at least one lowercase letter')
        .matches(/[0-9]/)
        .withMessage('Password must contain at least one number'),

    // Email (optional, for future use)
    email: body('email')
        .optional()
        .isEmail()
        .withMessage('Must be a valid email address'),

    // Name: 2-100 chars, letters and spaces
    name: body('name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be 2-100 characters')
        .matches(/^[a-zA-ZğüşıöçĞÜŞİÖÇ\s]+$/)
        .withMessage('Name must contain only letters'),

    // Phone: Turkish phone format or international
    phone: body('phone')
        .optional()
        .matches(/^(\+90|0)?[0-9]{10}$/)
        .withMessage('Must be a valid Turkish phone number'),

    // Sector: 2-50 chars
    sector: body('sector')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Sector must be 2-50 characters'),

    // ID: UUID format
    id: (paramName: string = 'id') => body(paramName)
        .isUUID()
        .withMessage(`${paramName} must be a valid UUID`),

    // Date: ISO format
    date: (fieldName: string = 'date') => body(fieldName)
        .isISO8601()
        .withMessage(`${fieldName} must be a valid date`),

    // Positive number
    positiveNumber: (fieldName: string) => body(fieldName)
        .isFloat({ min: 0 })
        .withMessage(`${fieldName} must be a positive number`),

    // Integer
    integer: (fieldName: string) => body(fieldName)
        .isInt({ min: 0 })
        .withMessage(`${fieldName} must be a positive integer`),

    // Role: must be one of allowed roles
    role: body('role')
        .optional()
        .isIn(['ADMIN', 'MANAGER', 'VIEWER'])
        .withMessage('Role must be one of: ADMIN, MANAGER, VIEWER')
};
