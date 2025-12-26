// Persona Routes
const express = require('express');
const router = express.Router();
const { authenticate, requireTenantAdmin } = require('../middleware/auth');
const { query } = require('../config/database');

// Get available personas for user
router.get('/', authenticate, async (req, res) => {
    try {
        const { tenantId } = req.auth;

        // Get global personas + tenant-specific personas
        const result = await query(
            `SELECT id, name, description, system_template, enabled, tenant_id
       FROM personas
       WHERE (tenant_id IS NULL OR tenant_id = $1) AND enabled = true
       ORDER BY tenant_id NULLS FIRST, name`,
            [tenantId]
        );

        res.json({
            personas: result.rows.map(p => ({
                id: p.id,
                name: p.name,
                description: p.description,
                isCustom: p.tenant_id !== null
            }))
        });

    } catch (error) {
        console.error('Get personas error:', error);
        res.status(500).json({ error: 'Failed to get personas' });
    }
});

// Create custom persona (tenant admin only)
router.post('/', authenticate, requireTenantAdmin, async (req, res) => {
    try {
        const { id, name, description, systemTemplate } = req.body;
        const { tenantId } = req.auth;

        if (!id || !name || !systemTemplate) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        await query(
            `INSERT INTO personas (id, name, description, system_template, enabled, tenant_id)
       VALUES ($1, $2, $3, $4, true, $5)`,
            [id, name, description || '', systemTemplate, tenantId]
        );

        res.json({ success: true, personaId: id });

    } catch (error) {
        console.error('Create persona error:', error);
        res.status(500).json({ error: 'Failed to create persona' });
    }
});

// Update custom persona
router.put('/:id', authenticate, requireTenantAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, systemTemplate, enabled } = req.body;
        const { tenantId } = req.auth;

        // Verify persona belongs to tenant
        const check = await query('SELECT tenant_id FROM personas WHERE id = $1', [id]);
        if (check.rows.length === 0 || check.rows[0].tenant_id !== tenantId) {
            return res.status(404).json({ error: 'Persona not found' });
        }

        const updates = [];
        const values = [];
        let paramCount = 1;

        if (name) {
            updates.push(`name = $${paramCount++}`);
            values.push(name);
        }
        if (description !== undefined) {
            updates.push(`description = $${paramCount++}`);
            values.push(description);
        }
        if (systemTemplate) {
            updates.push(`system_template = $${paramCount++}`);
            values.push(systemTemplate);
        }
        if (enabled !== undefined) {
            updates.push(`enabled = $${paramCount++}`);
            values.push(enabled);
        }

        values.push(id);

        await query(
            `UPDATE personas SET ${updates.join(', ')} WHERE id = $${paramCount}`,
            values
        );

        res.json({ success: true });

    } catch (error) {
        console.error('Update persona error:', error);
        res.status(500).json({ error: 'Failed to update persona' });
    }
});

// Delete custom persona
router.delete('/:id', authenticate, requireTenantAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId } = req.auth;

        // Verify persona belongs to tenant
        const check = await query('SELECT tenant_id FROM personas WHERE id = $1', [id]);
        if (check.rows.length === 0 || check.rows[0].tenant_id !== tenantId) {
            return res.status(404).json({ error: 'Persona not found' });
        }

        await query('DELETE FROM personas WHERE id = $1', [id]);

        res.json({ success: true });

    } catch (error) {
        console.error('Delete persona error:', error);
        res.status(500).json({ error: 'Failed to delete persona' });
    }
});

module.exports = router;
