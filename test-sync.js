
async function testSync() {
    const payload = {
        operations: [
            {
                table: 'instructions',
                operation: 'upsert',
                data: {
                    // id is missing!
                    patient_id: 'test-patient-1',
                    patient_name: 'Test Patient'
                }
            }
        ]
    };

    try {
        const response = await fetch('http://localhost:9010/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log('Status:', response.status);
        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

testSync();
