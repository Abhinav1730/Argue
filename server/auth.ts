import {SignJWT,jwtVerify} from "jose";
const encoder=new TextEncoder();
export async function signParticipant(roomId:string,participantId:string,secret:string,now=Date.now()){return new SignJWT({roomId}).setProtectedHeader({alg:"HS256"}).setSubject(participantId).setIssuedAt(Math.floor(now/1000)).setExpirationTime(Math.floor(now/1000)+900).sign(encoder.encode(secret))}
export async function verifyParticipant(token:string,secret:string,now=Date.now()){const {payload}=await jwtVerify(token,encoder.encode(secret),{algorithms:["HS256"],currentDate:new Date(now)});if(typeof payload.roomId!=="string"||!payload.sub)throw Error("Unauthorized");return {roomId:payload.roomId,participantId:payload.sub,expiresAt:Number(payload.exp)*1000}}

