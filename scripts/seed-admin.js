const { createUser, findByUsername } = require('../src/server/services/user-service');
const { close } = require('../src/server/storage/db');
const { migrate } = require('./migrate');

async function seedAdmin() {
    const args = process.argv.slice(2);
    const usernameIdx = args.indexOf('--username');
    const passwordIdx = args.indexOf('--password');

    if (usernameIdx === -1 || passwordIdx === -1) {
        console.error('Usage: npm run seed-admin -- --username <name> --password <pass>');
        process.exit(1);
    }

    const username = args[usernameIdx + 1];
    const password = args[passwordIdx + 1];

    if (!username || !password) {
        console.error('Username and password are required');
        process.exit(1);
    }

    await migrate();

    const existing = await findByUsername(username);
    if (existing) {
        console.error(`User "${username}" already exists`);
        process.exit(1);
    }

    const user = await createUser(username, password, 'admin');
    console.log(`Admin user "${user.username}" created (id: ${user.id})`);
    await close();
}

seedAdmin().catch(err => {
    console.error('Seed failed:', err.message);
    close();
    process.exit(1);
});
