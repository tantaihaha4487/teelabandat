import { searchIndex } from '../lib/content';
export async function GET() { return new Response(JSON.stringify(await searchIndex()), { headers: { 'Content-Type': 'application/json; charset=utf-8' } }); }
