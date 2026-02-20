/**
 * Performance Test Dataset Generator
 * 
 * Generates deterministic sample data for load testing.
 * MUST use PERF_SEED=true environment variable to run.
 * 
 * Usage:
 *   PERF_SEED=true npm run db:seed:perf
 *   PERF_SEED=true PERF_COMPANIES=1000 npm run db:seed:perf
 * 
 * Generated Data:
 *   - 500-1000 companies (default: 500)
 *   - 2000+ units (default: 2500)
 *   - Realistic leases with varying dates
 *   - Multiple campuses, blocks, sectors
 */

import { query } from './index';
import { hashPassword } from '../services/authService';
import { v4 as uuidv4 } from 'uuid';

// Configuration from environment
const PERF_SEED = process.env.PERF_SEED === 'true';
const PERF_COMPANIES = parseInt(process.env.PERF_COMPANIES || '500');
const PERF_UNITS = parseInt(process.env.PERF_UNITS || '2500');
const PERF_CAMPUSES = parseInt(process.env.PERF_CAMPUSES || '5');

// Deterministic data sources
const SECTORS = [
  'Yazılım ve Bilişim Hizmetleri',
  'Elektronik ve Yazılım Geliştirme',
  'Biyoteknoloji ve İlaç',
  'Telekomünikasyon',
  'Finansal Teknoloji',
  'E-Ticaret',
  'Yapay Zeka ve Makine Öğrenmesi',
  'Siber Güvenlik',
  'Mobil Uygulama Geliştirme',
  'Büyük Veri ve Analitik',
];

const BUSINESS_AREAS = [
  'SaaS', 'Mobil', 'Web', 'AI/ML', 'IoT', 
  'Fintech', 'Healthtech', 'Edtech', 'E-commerce',
  'Enterprise', 'Consulting', 'R&D'
];

const TURKISH_NAMES = [
  'Tekno', 'Dijital', 'Akıllı', 'Bilişim', 'Yazılım',
  'Sistem', 'Çözüm', 'Nexus', 'Nova', 'Aura',
  'Delta', 'Omega', 'Alpha', 'Beta', 'Gamma',
  'Prime', 'Core', 'Link', 'Net', 'Sys'
];

const TURKISH_SUFFIXES = [
  'Teknoloji A.Ş.', 'Bilişim Ltd. Şti.', 'Yazılım ve Danışmanlık',
  'Çözümleri A.Ş.', 'Sistemleri San. Tic. Ltd. Şti.', 
  'Teknolojileri A.Ş.', 'Hizmetleri Ltd. Şti.'
];

const MANAGERS = [
  { name: 'Ahmet Yılmaz', phone: '5321234567', email: 'ahmet@example.com' },
  { name: 'Mehmet Demir', phone: '5332345678', email: 'mehmet@example.com' },
  { name: 'Ayşe Kaya', phone: '5343456789', email: 'ayse@example.com' },
  { name: 'Fatma Çelik', phone: '5354567890', email: 'fatma@example.com' },
  { name: 'Ali Özkan', phone: '5365678901', email: 'ali@example.com' },
  { name: 'Zeynep Arslan', phone: '5376789012', email: 'zeynep@example.com' },
  { name: 'Mustafa Yıldız', phone: '5387890123', email: 'mustafa@example.com' },
  { name: 'Elif Şahin', phone: '5398901234', email: 'elif@example.com' },
];

// Seeded random number generator for reproducibility
class SeededRandom {
  private seed: number;
  
  constructor(seed: number) {
    this.seed = seed;
  }
  
  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
  
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }
  
  pick<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)];
  }
  
  pickMultiple<T>(array: T[], count: number): T[] {
    const shuffled = [...array].sort(() => this.next() - 0.5);
    return shuffled.slice(0, Math.min(count, array.length));
  }
}

// Data generators
function generateCompanyName(rng: SeededRandom): string {
  const prefix = rng.pick(TURKISH_NAMES);
  const suffix = rng.pick(TURKISH_SUFFIXES);
  const number = rng.next() > 0.7 ? rng.nextInt(1, 99) : '';
  return `${prefix}${number ? ' ' + number : ''} ${suffix}`;
}

function generateRegistrationNumber(rng: SeededRandom): string {
  return `${rng.nextInt(100000000, 999999999)}`;
}

export async function generatePerfDataset() {
  if (!PERF_SEED) {
    console.error('❌ PERF_SEED environment variable must be set to true');
    console.error('   Run: PERF_SEED=true npm run db:seed:perf');
    process.exit(1);
  }
  
  console.log('🌱 Generating performance test dataset...');
  console.log(`   Companies: ${PERF_COMPANIES}`);
  console.log(`   Units: ${PERF_UNITS}`);
  console.log(`   Campuses: ${PERF_CAMPUSES}`);
  
  const rng = new SeededRandom(12345); // Fixed seed for reproducibility
  const startTime = Date.now();
  
  try {
    // Clear existing perf test data (marked with is_perf_data flag if exists)
    // We don't clear everything to be safe
    
    // 1. Create Campuses
    console.log('\n📍 Creating campuses...');
    const campusIds: string[] = [];
    
    for (let i = 0; i < PERF_CAMPUSES; i++) {
      const campusName = `Teknokent Kampüs ${String.fromCharCode(65 + i)}`;
      const result = await query(
        `INSERT INTO campuses (id, name, address, max_office_cap, max_area_cap, max_floors_cap)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [
          uuidv4(),
          campusName,
          `${campusName} Adresi, No: ${i + 1}`,
          500,
          50000,
          10
        ]
      );
      campusIds.push(result.rows[0].id);
      console.log(`   ✓ ${campusName}`);
    }
    
    // 2. Create Blocks (3-5 per campus)
    console.log('\n🏢 Creating blocks...');
    const blockIds: string[] = [];
    
    for (const campusId of campusIds) {
      const blockCount = rng.nextInt(3, 5);
      
      for (let b = 0; b < blockCount; b++) {
        const blockName = `Blok ${String.fromCharCode(65 + b)}`;
        const result = await query(
          `INSERT INTO blocks (id, campus_id, name, max_floors, max_offices, max_area_sqm, sqm_per_employee, floor_capacities)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [
            uuidv4(),
            campusId,
            blockName,
            rng.nextInt(5, 10),
            rng.nextInt(20, 50),
            rng.nextFloat(2000, 5000).toFixed(2),
            rng.nextFloat(4, 6).toFixed(2),
            JSON.stringify([])
          ]
        );
        blockIds.push(result.rows[0].id);
      }
    }
    
    // 3. Create Units
    console.log('\n🚪 Creating units...');
    const unitIds: string[] = [];
    
    for (const blockId of blockIds) {
      const unitsPerBlock = Math.floor(PERF_UNITS / blockIds.length);
      
      for (let u = 0; u < unitsPerBlock; u++) {
        const floor = rng.nextInt(1, 10);
        const number = `${floor}${String(rng.nextInt(1, 20)).padStart(3, '0')}`;
        const area = rng.nextFloat(30, 200).toFixed(2);
        
        const result = await query(
          `INSERT INTO units (id, block_id, number, floor, area_sqm, status)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET number = EXCLUDED.number RETURNING id`,
          [uuidv4(), blockId, number, floor.toString(), area, 'VACANT']
        );
        unitIds.push(result.rows[0].id);
      }
    }
    
    console.log(`   ✓ Created ${unitIds.length} units`);
    
    // 4. Create Companies
    console.log('\n🏢 Creating companies...');
    const companyIds: string[] = [];
    
    for (let i = 0; i < PERF_COMPANIES; i++) {
      const manager = rng.pick(MANAGERS);
      const sector = rng.pick(SECTORS);
      const businessAreas = rng.pickMultiple(BUSINESS_AREAS, rng.nextInt(1, 3));
      
      const result = await query(
        `INSERT INTO companies (
          id, name, registration_number, sector, business_areas, work_area,
          manager_name, manager_phone, manager_email, employee_count,
          score, contract_template
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [
          uuidv4(),
          generateCompanyName(rng),
          generateRegistrationNumber(rng),
          sector,
          businessAreas,
          rng.pick(BUSINESS_AREAS),
          manager.name,
          manager.phone,
          manager.email,
          rng.nextInt(5, 100),
          rng.nextFloat(0, 100).toFixed(2),
          JSON.stringify({
            rentPerSqM: rng.nextFloat(20, 50).toFixed(2),
            startDate: new Date(rng.nextInt(2023, 2024), rng.nextInt(0, 11), 1).toISOString().split('T')[0],
            endDate: new Date(rng.nextInt(2024, 2027), rng.nextInt(0, 11), 1).toISOString().split('T')[0]
          })
        ]
      );
      
      companyIds.push(result.rows[0].id);
      
      if ((i + 1) % 100 === 0) {
        console.log(`   ✓ ${i + 1}/${PERF_COMPANIES} companies created`);
      }
    }
    
    console.log(`   ✓ Created ${companyIds.length} companies`);
    
    // 5. Create Leases and Assign Units
    console.log('\n📄 Creating leases and assigning units...');
    let createdLeaseCount = 0;
    const occupancyRate = 0.7; // 70% occupancy
    
    for (let i = 0; i < Math.floor(companyIds.length * occupancyRate); i++) {
      const companyId = companyIds[i];
      const unitId = unitIds[i % unitIds.length];
      
      // Assign unit to company
      await query(
        `UPDATE units SET company_id = $1, status = 'OCCUPIED' WHERE id = $2`,
        [companyId, unitId]
      );
      
      // Create lease
      const startDate = new Date(rng.nextInt(2023, 2024), rng.nextInt(0, 11), 1);
      const endDate = new Date(rng.nextInt(2025, 2027), rng.nextInt(0, 11), 1);
      
      await query(
        `INSERT INTO leases (id, unit_id, company_id, start_date, end_date, monthly_rent, operating_fee)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET unit_id = EXCLUDED.unit_id RETURNING id`,
        [
          uuidv4(),
          unitId,
          companyId,
          startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0],
          rng.nextFloat(500, 5000).toFixed(2),
          rng.nextFloat(100, 500).toFixed(2)
        ]
      );
      
      createdLeaseCount++;
      
      if ((i + 1) % 100 === 0) {
        console.log(`   ✓ ${i + 1} leases created`);
      }
    }
    
    console.log(`   ✓ Created ${createdLeaseCount} leases`);
    
    // 6. Add some score entries and documents
    console.log('\n📊 Adding score entries and documents...');
    let scoreCount = 0;
    
    for (const companyId of companyIds.slice(0, Math.min(companyIds.length, 100))) {
      const numScores = rng.nextInt(1, 5);
      
      for (let s = 0; s < numScores; s++) {
        await query(
          `INSERT INTO company_score_entries (id, company_id, type, description, points, date)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [
            uuidv4(),
            companyId,
            rng.pick(['PERFORMANCE', 'INNOVATION', 'COLLABORATION', 'GROWTH']),
            `Performance score entry ${s + 1}`,
            rng.nextFloat(-10, 20).toFixed(2),
            new Date(rng.nextInt(2023, 2024), rng.nextInt(0, 11), 1).toISOString().split('T')[0]
          ]
        );
        scoreCount++;
      }
      
      // Add 1-2 documents
      const numDocs = rng.nextInt(1, 2);
      for (let d = 0; d < numDocs; d++) {
        await query(
          `INSERT INTO company_documents (id, company_id, name, url, type)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [
            uuidv4(),
            companyId,
            `Document ${d + 1}`,
            `https://example.com/doc/${d + 1}`,
            'CONTRACT'
          ]
        );
      }
    }
    
    console.log(`   ✓ Created ${scoreCount} score entries`);
    
    // 7. Verify counts
    console.log('\n📊 Verifying dataset...');
    const [campuses, blocks, units, companies, leases] = await Promise.all([
      query('SELECT COUNT(*) FROM campuses WHERE deleted_at IS NULL'),
      query('SELECT COUNT(*) FROM blocks WHERE deleted_at IS NULL'),
      query('SELECT COUNT(*) FROM units WHERE deleted_at IS NULL'),
      query('SELECT COUNT(*) FROM companies WHERE deleted_at IS NULL'),
      query('SELECT COUNT(*) FROM leases WHERE deleted_at IS NULL'),
    ]);
    
    console.log(`\n✅ Performance test dataset generated successfully in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
    console.log('\n📈 Dataset Summary:');
    console.log(`   Campuses: ${campuses.rows[0].count}`);
    console.log(`   Blocks: ${blocks.rows[0].count}`);
    console.log(`   Units: ${units.rows[0].count}`);
    console.log(`   Companies: ${companies.rows[0].count}`);
    console.log(`   Leases: ${leases.rows[0].count}`);
    
    console.log('\n💡 You can now run performance tests:');
    console.log('   npm run perf:run');
    
  } catch (error) {
    console.error('❌ Error generating performance test dataset:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  generatePerfDataset();
}
