import 'dotenv/config';
import mongoose from 'mongoose';
import { connectToDatabase, disconnectDatabase } from '../src/config/db.js';

const COLLECTIONS = ['sv_ai_insights', 'sv_bots', 'sv_bot_drafts'];

function parseArgs(argv) {
  const args = { dryRun: false, workspaceId: null };
  for (const arg of argv) {
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg.startsWith('--workspaceId=')) {
      args.workspaceId = arg.split('=')[1] || null;
    }
  }
  return args;
}

async function getCollectionCounts(filter) {
  const db = mongoose.connection.db;
  const counts = {};
  for (const collectionName of COLLECTIONS) {
    const collection = db.collection(collectionName);
    counts[collectionName] = await collection.countDocuments(filter);
  }
  return counts;
}

async function cleanupAiCollections({ dryRun, workspaceId }) {
  const filter = workspaceId ? { workspaceId: new mongoose.Types.ObjectId(workspaceId) } : {};
  const before = await getCollectionCounts(filter);

  console.log('[cleanup:ai] mode =', dryRun ? 'DRY_RUN' : 'EXECUTE');
  console.log('[cleanup:ai] scope =', workspaceId ? `workspace:${workspaceId}` : 'all workspaces');
  console.log('[cleanup:ai] before =', before);

  if (!dryRun) {
    const db = mongoose.connection.db;
    for (const collectionName of COLLECTIONS) {
      const collection = db.collection(collectionName);
      await collection.deleteMany(filter);
    }
  }

  const after = await getCollectionCounts(filter);
  console.log('[cleanup:ai] after =', after);
}

async function main() {
  const { dryRun, workspaceId } = parseArgs(process.argv.slice(2));
  if (workspaceId && !mongoose.Types.ObjectId.isValid(workspaceId)) {
    throw new Error('Invalid --workspaceId value. Expected a valid ObjectId.');
  }

  await connectToDatabase();
  try {
    await cleanupAiCollections({ dryRun, workspaceId });
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error('[cleanup:ai] failed:', error.message);
  process.exit(1);
});
