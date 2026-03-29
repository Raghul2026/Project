// db.js — MySQL connection pool
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'mysql-ssmilkdairy-dharaniendarks-9213.i.aivencloud.com',
  port:               parseInt(process.env.DB_PORT, 10) || 13418,
  user:               process.env.DB_USER     || 'avnadmin',
  password:           process.env.DB_PASSWORD || 'AVNS_DMSgk2P5Aj0Sa56tbIw',
  database:           process.env.DB_NAME     || 'ssmilk_db',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+05:30',
});

// Non-blocking test — warns but does NOT crash the process
pool.getConnection()
  .then(conn => { console.log('✅ MySQL connected'); conn.release(); })
  .catch(err  => { console.error('⚠️  MySQL warning:', err.message, '\n   → Start MySQL and the routes will work once connected.'); });

module.exports = pool;