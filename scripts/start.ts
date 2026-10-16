import "dotenv/config";
import {randomBytes} from "node:crypto";
import {spawn} from "node:child_process";
const env={...process.env,ROOM_SERVICE_SECRET:process.env.ROOM_SERVICE_SECRET||randomBytes(32).toString("hex")};
const children=[spawn(process.execPath,["--import","tsx","server/run.ts"],{stdio:"inherit",env,windowsHide:true}),spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","0.0.0.0","--port",env.PORT||"3000"],{stdio:"inherit",env,windowsHide:true})];
let stopping=false;function stop(){if(stopping)return;stopping=true;for(const c of children)c.kill();setTimeout(()=>process.exit(),100).unref()}process.on("SIGINT",stop);process.on("SIGTERM",stop);for(const c of children)c.on("exit",stop);

