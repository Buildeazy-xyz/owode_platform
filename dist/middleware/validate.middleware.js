"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginValidation = exports.registerValidation = exports.validateRequest = void 0;
const express_validator_1 = require("express-validator");
const validateRequest = (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array()
        });
        return;
    }
    next();
};
exports.validateRequest = validateRequest;
exports.registerValidation = [
    (0, express_validator_1.body)('fullName').trim().notEmpty().withMessage('Full name is required').isLength({ min: 2 }).withMessage('Full name too short'),
    (0, express_validator_1.body)('phone').trim().matches(/^0[0-9]{10}$/).withMessage('Invalid Nigerian phone number'),
    (0, express_validator_1.body)('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters').matches(/^(?=.*[a-zA-Z])(?=.*[0-9])/).withMessage('Password must contain letters and numbers')
];
exports.loginValidation = [
    (0, express_validator_1.body)('phone').trim().matches(/^0[0-9]{10}$/).withMessage('Invalid phone number'),
    (0, express_validator_1.body)('password').notEmpty().withMessage('Password is required')
];
//# sourceMappingURL=validate.middleware.js.map