import mongoose from 'mongoose';

export async function connectToDatabase() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('Missing required env var: MONGODB_URI');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(mongoUri);
}

export async function disconnectDatabase() {
  await mongoose.connection.close();
}
