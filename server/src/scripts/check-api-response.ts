import fetch from 'node-fetch';

async function checkLeasesDetails() {
    try {
        const response = await fetch('http://localhost:3001/api/leases/details');
        const data = await response.json();
        
        console.log('API Response - First 3 companies:');
        console.log('===================================');
        
        data.slice(0, 3).forEach((item: any) => {
            console.log(`\nCompany: ${item.company.name}`);
            console.log(`  Manager Name: ${item.company.managerName || 'NULL'}`);
            console.log(`  Manager Phone: ${item.company.managerPhone || 'NULL'}`);
            console.log(`  Manager Email: ${item.company.managerEmail || 'NULL'}`);
        });
        
        // Count how many have manager data
        const withManager = data.filter((item: any) => item.company.managerName).length;
        const withPhone = data.filter((item: any) => item.company.managerPhone).length;
        const withEmail = data.filter((item: any) => item.company.managerEmail).length;
        
        console.log('\n\nSummary from API:');
        console.log('==================');
        console.log(`Total companies: ${data.length}`);
        console.log(`With manager name: ${withManager}`);
        console.log(`With phone: ${withPhone}`);
        console.log(`With email: ${withEmail}`);
        
    } catch (error) {
        console.error('Error:', error);
    }
}

checkLeasesDetails();
