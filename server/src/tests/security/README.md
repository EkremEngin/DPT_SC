# P5.3 Security Tests

This directory contains security validation tests for Phase 5.3 of the DPT-Local Teknokent Management System.

## Test Files

| Test File | Description |
|-----------|-------------|
| [`abuse.test.ts`](./abuse.test.ts) | Rate limiting and abuse prevention tests |
| [`rbac.test.ts`](./rbac.test.ts) | Role-based access control tests |
| [`input-validation.test.ts`](./input-validation.test.ts) | SQL injection, XSS, and input sanitization tests |
| [`auth-security.test.ts`](./auth-security.test.ts) | Authentication and token security tests |
| [`dast-scan.sh`](./dast-scan.sh) | OWASP ZAP DAST scan script |

## Running Security Tests

### Run all security tests:
```bash
cd server
npm run test:security
```

### Run with coverage:
```bash
cd server
npm run test:security:coverage
```

### Run specific test file:
```bash
cd server
npm test -- tests/security/abuse.test.ts
```

### Run DAST scan (requires Docker):
```bash
cd server
npm run dast:scan
```

## Test Categories

### 1. Rate Limit Abuse Tests (`abuse.test.ts`)
- Login brute force protection (5 attempts per minute)
- Global API rate limiting (100 requests per 15 minutes)
- Rate limit header validation
- Skip successful requests behavior

### 2. RBAC Tests (`rbac.test.ts`)
- VIEWER role: read-only access (403 on POST/PUT/DELETE)
- MANAGER role: can manage companies but not users
- ADMIN role: full access
- Cross-user access prevention
- Token tampering prevention

### 3. Input Validation Tests (`input-validation.test.ts`)
- SQL injection prevention (UNION, DROP, comments)
- XSS prevention (script tags, event handlers)
- CORS validation
- Input length limits
- Special character handling

### 4. Authentication Security Tests (`auth-security.test.ts`)
- Token validation and expiration
- Password security requirements
- Session management
- Token tampering prevention
- JWT secret security

## CI/CD Integration

Security tests run automatically in GitHub Actions on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Weekly schedule (Mondays at 6 AM UTC)
- Manual workflow dispatch

See [`.github/workflows/security-scan.yml`](../../../.github/workflows/security-scan.yml) for the full CI configuration.

## Environment Variables

Required for security tests:
```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=appdb_test
DB_USER=app
DB_PASSWORD=test_password
JWT_SECRET=test-secret-key-for-testing
NODE_ENV=test
```

## Security Coverage Goals

| Category | Target | Current |
|----------|--------|---------|
| Authentication | 100% | - |
| Authorization | 100% | - |
| Input Validation | 90% | - |
| Rate Limiting | 100% | - |

## Security Findings

See [`docs/security-validation.md`](../../../docs/security-validation.md) for documented findings and remediation steps.

## Contributing

When adding new security tests:
1. Use descriptive test names following the pattern: `should <expected behavior>`
2. Group related tests in `describe` blocks
3. Add cleanup code in `afterEach` or `afterAll` blocks
4. Use unique test data (timestamps, random strings) to avoid conflicts
5. Update this README with new test categories

## References

- [Phase 5 Roadmap](../../../plans/PHASE-5-ROADMAP.md)
- [P5.3 Security Validation Plan](../../../plans/phase5-3-security-validation-plan.md)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP ZAP](https://www.zaproxy.org/)
