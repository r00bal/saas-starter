import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

async function setup() {
  // Create a connection for setup
  const sql = postgres(connectionString, { max: 1 });
  
  try {
    console.log('Dropping all tables...');
    
    // Drop all tables (this will fail if tables don't exist, which is fine)
    await sql`
      DROP TABLE IF EXISTS invitations CASCADE;
      DROP TABLE IF EXISTS team_members CASCADE;
      DROP TABLE IF EXISTS activity_logs CASCADE;
      DROP TABLE IF EXISTS teams CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `;
    
    console.log('Tables dropped successfully');
    
    // Create new tables using Drizzle
    const db = drizzle(sql, { schema });
    await migrate(db, { migrationsFolder: './lib/db/migrations' });
    
    console.log('Database setup completed successfully');
  } catch (error) {
    console.error('Setup failed:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

setup()
  .then(() => {
    console.log('Setup completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
