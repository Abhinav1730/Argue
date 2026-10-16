import {describe,it,expect} from "vitest";
import {emptyConversation,reduceRoomEvent} from "../src/shared/conversation";
const source = {type:"source",id:"s1",seq:1,roomId:"r",participantId:"a",segmentId:"s",revision:1,sourceTimestamp:1,createdAt:1,text:"No.",language:"en",committed:true} as const;
describe("conversation",()=>{
 it("ignores duplicate delivery",()=>{const s=reduceRoomEvent(emptyConversation(),source);expect(reduceRoomEvent(s,source).events).toHaveLength(1)});
 it("keeps the newest source revision",()=>{let s=reduceRoomEvent(emptyConversation(),{...source,id:"s2",seq:2,revision:2,text:"Yes."});s=reduceRoomEvent(s,source);expect(s.sources["a:s"].text).toBe("Yes.")});
 it("rejects translation of an obsolete source",()=>{let s=reduceRoomEvent(emptyConversation(),{...source,revision:2});s=reduceRoomEvent(s,{...source,id:"t1",seq:2,type:"translation",recipientId:"b",targetLanguage:"es",sourceRevision:1,text:"No.",status:"translated"});expect(s.translations).toHaveLength(0)});
 it("marks missing history",()=>{expect(reduceRoomEvent(emptyConversation(),{...source,seq:4}).historyIncomplete).toBe(true)});
});

