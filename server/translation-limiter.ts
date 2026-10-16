export class TranslationScheduler{
 private tokens:number;private updated=Date.now();private active=0;private queue:Array<{roomId:string;run:()=>void}>=[];
 constructor(private rpm=Number(process.env.TRANSLATION_RPM||18),private concurrency=Number(process.env.TRANSLATION_CONCURRENCY||2),private perRoom=Number(process.env.TRANSLATION_QUEUE_PER_ROOM||2),private timeout=Number(process.env.TRANSLATION_TIMEOUT_MS||5000)){this.tokens=rpm}
 submit<T>(roomId:string,work:(signal:AbortSignal)=>Promise<T>):Promise<T>{
 const now=Date.now();this.tokens=Math.min(this.rpm,this.tokens+(now-this.updated)*this.rpm/60000);this.updated=now;
 if(this.tokens<1)return Promise.reject(Error("rate_limited"));
 if(this.active>=this.concurrency&&this.queue.filter(q=>q.roomId===roomId).length>=this.perRoom)return Promise.reject(Error("queue_full"));
 this.tokens--;return new Promise<T>((resolve,reject)=>{
 const deadline=now+this.timeout;
 const run=()=>{this.active++;const c=new AbortController();const remaining=deadline-Date.now();let timer:ReturnType<typeof setTimeout>;
 const timeout=new Promise<never>((_,fail)=>{timer=setTimeout(()=>{c.abort();fail(Error("timeout"))},Math.max(0,remaining))});
 Promise.race([remaining>0?Promise.resolve().then(()=>work(c.signal)):Promise.reject(Error("timeout")),timeout]).then(resolve,reject).finally(()=>{clearTimeout(timer);this.active--;this.queue.shift()?.run()})};
 if(this.active<this.concurrency)run();else this.queue.push({roomId,run});
 })}
}

