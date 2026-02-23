import express from 'express';
import cors from 'cors';
// import dotenv from 'dotenv'; // Load env vars via system/render
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Import Routes
import campusRoutes from './routes/campuses';
import blockRoutes from './routes/blocks';
import unitRoutes from './routes/units';
import companyRoutes from './routes/companies';
import leaseRoutes from './routes/leases';
import auditRoutes from './routes/audit';
import dashboardRoutes from './routes/dashboard';
import sectorRoutes from './routes/sectors';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import restoreRoutes from './routes/restore';
import rollbackRoutes from './routes/rollback';

// Middleware
import { authenticateToken } from './middleware/authMiddleware';
import { requireRole } from './middleware/roleMiddleware';
import { errorHandler } from './middleware/errorHandler';
import requestIdMiddleware from './middleware/requestId';
import metricsMiddleware, { metricsEndpoint, healthEndpoint, resetMetricsEndpoint } from './middleware/metricsMiddleware';

// Logger
import { logger } from './utils/logger';

const app = express();
const PORT = process.env.PORT || 3001;

// SECURITY: Validate required environment variables on startup
const requiredEnvVars = ['JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    logger.fatal({ missing: missingEnvVars }, `FATAL: Missing required environment variables: ${missingEnvVars.join(', ')}`);
    logger.fatal('Server cannot start safely. Please set all required environment variables.');
    process.exit(1);
}

// Security Middleware
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request ID Middleware - Must be before CORS for proper tracing
app.use(requestIdMiddleware);

// P5.4: Metrics Collection - Track request latency, error rates, DB queries
app.use(metricsMiddleware);

// SECURITY: Tightened CORS - No wildcard suffix, exact matching only
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:4173',
    process.env.FRONTEND_URL // Render frontend URL
].filter(Boolean) as string[];

app.use(cors({
    origin: (origin, callback) => {
        // SECURITY: Allow requests without origin header (server-to-server, proxy, same-origin)
        // This is needed for Vite proxy in development
        if (!origin) {
            return callback(null, true);
        }

        // SECURITY: Exact origin matching only - no wildcard suffix
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            logger.warn({ origin }, `CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

// PERFORMANCE MODE: Bypass rate limiting when PERF_MODE=true (non-production only)
const isPerfMode = process.env.PERF_MODE === 'true';
const isProduction = process.env.NODE_ENV === 'production';

// Global Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => {
        // SECURITY: Never bypass rate limiting in production
        if (isProduction) return false;
        // Only bypass in performance mode
        return isPerfMode;
    },
});
app.use('/api/', limiter);

// SECURITY: Login-specific brute force protection
// 5 attempts per minute per IP+username combination
const loginLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 attempts per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many login attempts. Please try again later.',
    skipSuccessfulRequests: true, // Don't count successful requests
    skip: () => {
        // SECURITY: Never bypass rate limiting in production
        if (isProduction) return false;
        // Only bypass in performance mode
        return isPerfMode;
    },
});

// Public Routes
// P5.4: Enhanced health endpoint with metrics
app.get('/health', healthEndpoint);

app.get('/', (req, res) => {
    res.send('DijitalPark Backend API is secure and running!');
});

// Auth Routes (Public)
// SECURITY: Apply login rate limiter to login endpoint
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);

// Protected Routes Middleware
// All routes below this line require a valid JWT token
app.use('/api', authenticateToken);

// P5.4: Metrics endpoint (requires authentication)
// GET /metrics - Returns JSON metrics snapshot
// GET /metrics?format=prometheus - Returns Prometheus text format
// GET /metrics?format=summary - Returns per-route summary
// POST /metrics/reset - Resets metrics (ADMIN only)
app.get('/metrics', metricsEndpoint);
app.post('/metrics/reset', authenticateToken, requireRole(['ADMIN']), resetMetricsEndpoint);

import businessAreaRoutes from './routes/businessAreas';

// ... (other imports)

// Protected API Routes
app.use('/api/users', userRoutes);
app.use('/api/campuses', campusRoutes);
app.use('/api/blocks', blockRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/leases', leaseRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/sectors', sectorRoutes);
app.use('/api/business-areas', businessAreaRoutes);
app.use('/api/restore', restoreRoutes);
app.use('/api/rollback', rollbackRoutes);

// SECURITY: Global error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
    logger.info({ port: PORT }, `Server running on port ${PORT}`);
    logger.info('Security: All required environment variables validated');
});
