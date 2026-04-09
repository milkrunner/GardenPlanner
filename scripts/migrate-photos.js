/**
 * Migration script: Convert existing Base64 photos in the database to file-based storage.
 *
 * What it does:
 * 1. Reads all tasks that have Base64 data URLs in their photos array
 * 2. Extracts the Base64 data, writes it to data/photos/ as files
 * 3. Generates thumbnails in data/photos/thumbs/
 * 4. Updates the DB to store filenames instead of Base64 strings
 *
 * Usage: node scripts/migrate-photos.js
 * Requires DATABASE_URL environment variable.
 */

const { query, close } = require('../src/server/storage/db');
const { saveBase64Photo, ensureDirectories } = require('../src/server/services/photo-service');

async function migratePhotos() {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL environment variable is not set.');
        process.exit(1);
    }

    ensureDirectories();

    console.log('Migrating Base64 photos to file storage...');

    // Find all tasks with photos that contain Base64 data URLs
    const { rows } = await query(
        "SELECT id, photos FROM tasks WHERE photos IS NOT NULL AND photos::text LIKE '%data:image/%'"
    );

    if (rows.length === 0) {
        console.log('No tasks with Base64 photos found. Nothing to migrate.');
        return;
    }

    console.log(`Found ${rows.length} task(s) with Base64 photos.`);

    let totalConverted = 0;
    let totalFailed = 0;

    for (const row of rows) {
        const photos = row.photos || [];
        const newPhotos = [];
        let changed = false;

        for (const photo of photos) {
            if (typeof photo === 'string' && photo.startsWith('data:image/')) {
                // This is a Base64 photo - convert to file
                const filename = await saveBase64Photo(photo);
                if (filename) {
                    newPhotos.push(filename);
                    totalConverted++;
                    changed = true;
                } else {
                    // Keep the original if conversion failed
                    newPhotos.push(photo);
                    totalFailed++;
                    console.warn(`  Warning: Failed to convert a photo in task ${row.id}`);
                }
            } else {
                // Already a filename reference - keep it
                newPhotos.push(photo);
            }
        }

        if (changed) {
            await query('UPDATE tasks SET photos = $1, updated_at = NOW() WHERE id = $2', [
                JSON.stringify(newPhotos),
                row.id,
            ]);
            console.log(`  Task ${row.id}: converted ${newPhotos.length} photo(s)`);
        }
    }

    console.log(`\nMigration complete: ${totalConverted} photo(s) converted, ${totalFailed} failed.`);
}

if (require.main === module) {
    migratePhotos()
        .then(() => close())
        .catch(err => {
            console.error('Photo migration failed:', err);
            close();
            process.exit(1);
        });
}

module.exports = { migratePhotos };
