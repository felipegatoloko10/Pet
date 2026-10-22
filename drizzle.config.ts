import {defineConfig} from 'drizzle-kit';import {config} from 'dotenv';config({path:'apps/web/.env.local',quiet:true});
export default defineConfig({schema:'./apps/web/src/server/schema.ts',out:'./drizzle',dialect:'postgresql',dbCredentials:{url:process.env.DATABASE_URL_UNPOOLED??''}});
