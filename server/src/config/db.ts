import { createClient } from '@supabase/supabase-js';
import { mockSupabase } from './mockSupabase';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

export let supabase: any;

if (supabaseUrl && supabaseKey) {
  console.log('🔌 Connecting to Cloud Supabase Database...');
  supabase = createClient(supabaseUrl, supabaseKey);
} else {
  console.log('📦 No SUPABASE_URL / SUPABASE_KEY found in environment.');
  console.log('🚀 Running in-memory Mock Supabase database fallback.');
  supabase = mockSupabase;
}

export const connectDB = async (): Promise<void> => {
  // Safe placeholder to match original DB initialization logic
  console.log('Database Client initialized successfully.');
};

export const closeDB = async (): Promise<void> => {
  console.log('Database Client connection closed.');
};
