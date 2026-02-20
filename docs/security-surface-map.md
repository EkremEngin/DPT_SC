# DPT-Local System Security Surface Map

**Generated:** 2025-02-18  
**Purpose:** HTTP-first security testing reference (no schema assumptions)

---

## 1) Auth & Token

**JWT Library:** `jsonwebtoken` v9.0.3

**Files:**
- [`server/src/services/authService.ts`](../server/src/services/authService.ts)
- [`server/src/middleware/authMiddleware.ts`](../server/src/middleware/authMiddleware.ts)

**Token Payload Shape:**
```typescript
{
    id: string;          // User UUID
    username: string;
    role: string;        // 'ADMIN' | 'MANAGER' | 'VIEWER'
    iat: number;         // Issued at
    exp: number;         // Expiration
}
```

**Token Expiry:**
- Access Token: `24h`
- Refresh Token: `7d`

**Auth Required on:** All `/api/*` routes except `/api/auth/login`, `/api/auth/*` public GETs

**Status Codes:**
- `401` = No token / invalid token
- `403` = Valid token but insufficient role

---

## 2) Roles & RBAC middleware

**Role Enum:** `'ADMIN' | 'MANAGER' | 'VIEWER'`

**RBAC Implementation:** [`server/src/middleware/roleMiddleware.ts`](../server/src/middleware/roleMiddleware.ts)

```typescript
export const requireRole = (roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
        next();
    };
};
```

**No object-level auth** - All resources of a type are accessible to anyone with the required role.

---

## 3) Route inventory (security-relevant)

| METHOD | PATH | Auth? | Roles | Notes |
|--------|------|-------|-------|-------|
| **Public Routes** |
| GET | `/health` | No | - | Public health check |
| POST | `/api/auth/login` | No | - | **Rate limited: 5/min** |
| GET | `/api/campuses` | No | - | Public, cached |
| GET | `/api/blocks` | No | - | Public, cached |
| GET | `/api/units` | No | - | Public |
| GET | `/api/companies` | No | - | Public, cached |
| GET | `/api/companies/:id` | No | - | Public, cached |
| GET | `/api/leases` | No | - | Public, cached |
| GET | `/api/dashboard` | No | - | Public, cached |
| GET | `/api/sectors` | No | - | Public |
| GET | `/api/audit` | No | - | Public (logged entries) |
| **Auth Routes** |
| GET | `/api/auth/me` | Yes | Any | Get current user |
| PUT | `/api/auth/profile` | Yes | Any | Change password |
| **User Routes** |
| GET | `/api/users` | Yes | MANAGER, ADMIN | List all users |
| POST | `/api/users` | Yes | MANAGER, ADMIN | Create user |
| DELETE | `/api/users/:id` | Yes | MANAGER, ADMIN | Delete user (not self) |
| **Campus Routes** |
| POST | `/api/campuses` | Yes | ADMIN, MANAGER | Create campus |
| PUT | `/api/campuses/:id` | Yes | ADMIN, MANAGER | Update campus |
| DELETE | `/api/campuses/:id` | Yes | ADMIN, MANAGER | Soft delete |
| **Block Routes** |
| POST | `/api/blocks` | Yes | ADMIN, MANAGER | Create block |
| PUT | `/api/blocks/:id` | Yes | ADMIN, MANAGER | Update block |
| DELETE | `/api/blocks/:id` | Yes | ADMIN, MANAGER | Soft delete |
| **Unit Routes** |
| POST | `/api/units/assign` | Yes | ADMIN, MANAGER | Assign company to floor |
| DELETE | `/api/units/:id` | Yes | ADMIN, MANAGER | Soft delete unit |
| PUT | `/api/units/:id` | Yes | ADMIN, MANAGER | Update unit/company |
| **Company Routes** |
| POST | `/api/companies` | Yes | ADMIN, MANAGER | Create company |
| PUT | `/api/companies/:id` | Yes | ADMIN, MANAGER | Update company |
| DELETE | `/api/companies/:id` | Yes | ADMIN, MANAGER | Soft delete |
| POST | `/api/companies/:id/documents` | Yes | ADMIN, MANAGER | Add document |
| DELETE | `/api/companies/:id/documents/:docName` | Yes | ADMIN, MANAGER | Delete document |
| POST | `/api/companies/:id/scores` | Yes | ADMIN, MANAGER | Add score entry |
| DELETE | `/api/companies/:id/scores/:scoreId` | Yes | ADMIN, MANAGER | Delete score |
| **Lease Routes** |
| PUT | `/api/leases/:companyId` | Yes | ADMIN, MANAGER | Update lease |
| DELETE | `/api/leases/:companyId` | Yes | ADMIN, MANAGER | Soft delete |
| **Restore Routes - ADMIN ONLY** |
| POST | `/api/restore/campuses/:id` | Yes | ADMIN | Restore campus |
| POST | `/api/restore/blocks/:id` | Yes | ADMIN | Restore block |
| POST | `/api/restore/units/:id` | Yes | ADMIN | Restore unit |
| POST | `/api/restore/companies/:id` | Yes | ADMIN | Restore company |
| GET | `/api/restore/deleted` | Yes | ADMIN | List deleted items |

---

## 4) Data ownership / tenant or user scoping

**Multi-tenant:** NO - Single-tenant application

**User isolation:** **NOT IMPLEMENTED**

- No `userId` filtering on resources
- Any MANAGER/ADMIN can modify ANY company/unit/lease
- Users table has self-delete prevention but no resource ownership checks

---

## 5) Validation & sanitization points

**Sanitizers:** **NONE** - No XSS sanitization libraries

**SQL Parameter Binding:** `node-postgres` with `$1, $2, $3...` placeholders

**Body Parser:** `express.json({ limit: '1mb' })`

---

## 6) Rate limiting configuration

**File:** [`server/src/index.ts`](../server/src/index.ts:74-108)

**Global Rate Limiter:**
- `15 minutes` window
- `100 requests` per IP
- Headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After`

**Login Rate Limiter:**
- `1 minute` window
- `5 attempts` per IP
- `skipSuccessfulRequests: true` - Successful logins don't count

---

## 7) Error handling / 500 sources

**Global Error Handler:** [`server/src/middleware/errorHandler.ts`](../server/src/middleware/errorHandler.ts)

- Production: Suppresses stack traces for 5xx errors
- Returns `requestId` for correlation
- Database errors typically return `{ error: 'Database error' }`

---

## 8) Minimal test fixtures via API

**Step 1: Create Users (one per role)**
```http
POST /api/users
Authorization: Bearer <MANAGER_TOKEN>
{
  "username": "test_viewer_001",
  "password": "TestPass123!",
  "email": "viewer@test.com",
  "role": "VIEWER"
}
```
Repeat for `test_manager_001` (role: MANAGER), `test_admin_001` (role: ADMIN)

**Step 2: Create Campus**
```http
POST /api/campuses
Authorization: Bearer <MANAGER_TOKEN>
{
  "name": "Test Campus",
  "address": "123 Test St",
  "maxOfficeCap": 100,
  "maxAreaCap": 5000,
  "maxFloorsCap": 5
}
```

**Step 3: Create Block**
```http
POST /api/blocks
Authorization: Bearer <MANAGER_TOKEN>
{
  "campusId": "<campus-uuid>",
  "name": "Block A",
  "maxFloors": 3,
  "maxOffices": 50,
  "maxAreaSqM": 2500,
  "floorCapacities": [
    {"floor": "1", "totalSqM": 800},
    {"floor": "2", "totalSqM": 800},
    {"floor": "3", "totalSqM": 900}
  ]
}
```

**Step 4: Create Company**
```http
POST /api/companies
Authorization: Bearer <MANAGER_TOKEN>
{
  "name": "Test Company LLC",
  "sector": "Technology",
  "managerName": "John Manager",
  "managerPhone": "+905551234567",
  "managerEmail": "john@testcompany.com",
  "employeeCount": 25
}
```

**Step 5: Create/Assign Unit (creates lease automatically)**
```http
POST /api/units/assign
Authorization: Bearer <MANAGER_TOKEN>
{
  "blockId": "<block-uuid>",
  "companyId": "<company-uuid>",
  "floor": "1",
  "areaSqM": 150,
  "isReserved": false
}
```

**Step 6: Get Login Token**
```http
POST /api/auth/login
{
  "username": "test_viewer_001",
  "password": "TestPass123!"
}
```

**No API to create:** Leases directly (auto-created on unit assign)  
**Must seed via DB:** Initial MANAGER user to create other users

---

## Ready-to-implement RBAC test matrix

| Route | Method | VIEWER | MANAGER | ADMIN | Unauth |
|-------|--------|--------|---------|-------|--------|
| `/api/auth/login` | POST | 200 | 200 | 200 | 200 |
| `/api/auth/me` | GET | 200 | 200 | 200 | 401 |
| `/api/auth/profile` | PUT | 200 | 200 | 200 | 401 |
| `/api/users` | GET | 403 | 200 | 200 | 401 |
| `/api/users` | POST | 403 | 201 | 201 | 401 |
| `/api/users/:id` | DELETE | 403 | 204* | 204 | 401 |
| `/api/campuses` | POST | 403 | 201 | 201 | 401 |
| `/api/campuses/:id` | DELETE | 403 | 204 | 204 | 401 |
| `/api/blocks` | POST | 403 | 201 | 201 | 401 |
| `/api/blocks/:id` | DELETE | 403 | 204 | 204 | 401 |
| `/api/companies` | POST | 403 | 201 | 201 | 401 |
| `/api/companies/:id` | DELETE | 403 | 204 | 204 | 401 |
| `/api/units/assign` | POST | 403 | 201 | 201 | 401 |
| `/api/units/:id` | DELETE | 403 | 204 | 204 | 401 |
| `/api/restore/deleted` | GET | 403 | 403 | 200 | 401 |
| `/api/restore/campuses/:id` | POST | 403 | 403 | 200 | 401 |

*MANAGER cannot delete self (returns 400)
