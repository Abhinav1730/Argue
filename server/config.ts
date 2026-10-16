export function serverConfig(){return {secret:process.env.ROOM_SERVICE_SECRET||"",port:Number(process.env.ROOM_PORT||8787),key:process.env.OPENROUTER_API_KEY||"",model:process.env.OPENROUTER_MODEL||"google/gemma-4-31b-it:free",providers:(process.env.OPENROUTER_ALLOWED_PROVIDERS||"google-ai-studio").split(",").map(s=>s.trim()).filter(Boolean)}}

