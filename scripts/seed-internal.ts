import { database } from '../lib/database';

async function seed() {
  const db = database();
  const workspaces = await db.query('SELECT id FROM workspaces');
  
  for (const ws of workspaces) {
    const clients = await db.query('SELECT * FROM records WHERE workspace_id = $1 AND kind = $2 AND data->>\'name\' = $3', [ws.id, 'client', 'The One Core (Interne)']);
    
    if (clients.length === 0) {
      console.log(`Creating internal client for workspace ${ws.id}...`);
      await db.query('INSERT INTO records (id, workspace_id, kind, revision, created_at, data) VALUES ($1, $2, $3, $4, $5, $6)', [
        crypto.randomUUID(),
        ws.id,
        'client',
        1,
        new Date().toISOString(),
        {
          name: 'The One Core (Interne)',
          description: 'Client interne pour les tâches de l\'agence'
        }
      ]);
    }
  }
  
  console.log('Done!');
  process.exit(0);
}

seed().catch(console.error);
