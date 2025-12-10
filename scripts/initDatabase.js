// Database initialization script
const { initializeSchema } = require('../config/database');

async function init() {
    console.log('Initializing SafeAI database schema...');

    try {
        await initializeSchema();
        console.log('Database schema initialized successfully!');
        console.log('You can now start the server with: npm start');
        process.exit(0);
    } catch (error) {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    }
}

init();
