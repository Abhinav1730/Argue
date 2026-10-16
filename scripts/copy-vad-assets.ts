import {mkdir,copyFile,readdir} from "node:fs/promises";
await mkdir("public/vad",{recursive:true});
for(const [dir,match] of [["node_modules/@ricky0123/vad-web/dist",/^(silero_vad_v5\.onnx|vad\.worklet\.bundle\.min\.js)$/],["node_modules/onnxruntime-web/dist",/^ort-wasm.*\.(wasm|mjs)$/]] as const){for(const file of await readdir(dir))if(match.test(file))await copyFile(dir+"/"+file,"public/vad/"+file)}
console.log("Local VAD assets ready");

