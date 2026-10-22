import { auth } from "../../../../server/auth";
import { cors } from "../../../../server/cors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(r: Request) {
  return cors(r, await auth().handler(r));
}
export async function POST(r: Request) {
  return cors(r, await auth().handler(r));
}
export function OPTIONS(r: Request) {
  return cors(r, new Response(null, { status: 204 }));
}
