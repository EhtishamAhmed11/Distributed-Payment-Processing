import { Client, Pool } from "pg";

export const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  port: process.env.DB_PORT,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const client = new Client({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  port: process.env.DB_PORT,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

export const connectDB = async () => {
  try {
    await client.connect();
    console.log(`Connected to Database:${client.database}`);
  } catch (error) {
    console.log(`Error connecting Database:${error.message}`);
  }
};

