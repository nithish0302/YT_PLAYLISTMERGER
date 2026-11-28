const { getDB, sql, initDB } = require('./src/db');
const path = require('path');
const fs = require('fs');

async function test() {
  await initDB();
  const db = getDB();
  const target = path.join(__dirname, 'test_vac.db').replace(/\\/g, '/');
  if (fs.existsSync(target)) fs.unlinkSync(target);

  try {
    // Test if parameterized sql works with VACUUM INTO
    await db.query(sql`VACUUM INTO ${target}`);
    console.log('VACUUM INTO parameterized OK!');
  } catch (err) {
    console.log('Parameterized failed:', err.message);
    try {
      // Test raw sql
      await db.query(sql([`VACUUM INTO '${target}'`]));
      console.log('Raw sql VACUUM INTO OK!');
    } catch (e) {
      console.log('Raw failed:', e.message);
    }
  }

  if (fs.existsSync(target)) {
    console.log('Target exists, size:', fs.statSync(target).size);
    fs.unlinkSync(target);
  }
}

test();
