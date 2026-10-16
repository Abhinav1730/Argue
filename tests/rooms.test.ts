import {it,expect} from "vitest";
import {RoomStore} from "../server/rooms";
const a={name:"Asha",language:"hi",listeningLanguage:"en"} as const;
const b={name:"Mateo",language:"es",listeningLanguage:"en"} as const;
it("enforces two seats and reconnect ownership",()=>{let now=0;const s=new RoomStore(()=>now);const x=s.create(a);const y=s.join(x.invite,b);expect(()=>s.join(x.invite,a)).toThrow("Room is full");s.disconnect(y.participant.id);expect(()=>s.join(x.invite,a)).toThrow("Room is full");expect(s.join(x.invite,b,y.resumeToken).participant.id).toBe(y.participant.id);s.disconnect(y.participant.id);now=60001;expect(s.join(x.invite,a).participant.id).not.toBe(y.participant.id)});
it("expires rooms and bounds event recovery",()=>{let now=0;const s=new RoomStore(()=>now);const x=s.create(a);for(let i=0;i<101;i++)s.source(x.roomId,x.participant.id,{segmentId:String(i),revision:1,text:"Hello",committed:true});expect(s.history(x.roomId,0).events).toHaveLength(100);expect(s.history(x.roomId,0).historyIncomplete).toBe(true);now=600001;expect(s.history(x.roomId,0).events).toHaveLength(0);now=86400001;expect(()=>s.join(x.invite,b)).toThrow("Room expired")});
it("does not accept stale source revisions",()=>{const s=new RoomStore();const x=s.create(a);s.source(x.roomId,x.participant.id,{segmentId:"s",revision:2,text:"Yes",committed:true});expect(()=>s.source(x.roomId,x.participant.id,{segmentId:"s",revision:1,text:"No",committed:true})).toThrow("Obsolete revision")});

