// Retention Job - Daily cleanup of expired data
const cron = require('node-cron');
const { query } = require('../config/database');

let hasDatabase = false;
try {
    hasDatabase = !!process.env.DATABASE_URL;
} catch (error) {
    hasDatabase = false;
}

// Run daily at 2 AM
const retentionJob = cron.schedule('0 2 * * *', async () => {
    if (!hasDatabase) {
        console.log('Retention job skipped: No database configured');
        return;
    }

    console.log('Starting retention cleanup...');

    try {
        // Delete expired wizard sessions
        const sessionsResult = await query(
            'DELETE FROM wizard_sessions WHERE expires_at < NOW()'
        );
        console.log(`✓ Deleted ${sessionsResult.rowCount} expired wizard sessions`);

        // Delete old events per tenant retention policy
        const eventsResult = await query(`
      DELETE FROM events e
      USING tenants t
      WHERE e.tenant_id = t.id
      AND e.timestamp < NOW() - (t.retention_days || ' days')::INTERVAL
    `);
        console.log(`✓ Deleted ${eventsResult.rowCount} old events`);

        console.log('Retention cleanup completed successfully');

    } catch (error) {
        console.error('Retention cleanup failed:', error);
    }
}, {
    scheduled: false // Don't start automatically
});

module.exports = {
    start: () => {
        if (hasDatabase) {
            retentionJob.start();
            console.log('✓ Retention job scheduled (daily at 2 AM)');
        } else {
            console.log('⚠ Retention job not started: No database configured');
        }
    },

    // Manual trigger for testing
    runNow: async () => {
        console.log('Running retention cleanup manually...');
        await retentionJob.fireOnTick();
    }
};
