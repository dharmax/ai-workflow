/**
 * Responsibility: Bounded, lossless JSON syntax input at textual public boundaries.
 * Scope: Syntax only; registered action schemas own field and authority validation.
 */
import fs from 'node:fs';
function decimal(value:string):string {
 const [mantissa,exponent='0']=value.toLowerCase().split('e');
 const [whole,fraction='']=mantissa!.split('.');
 const coefficient=(whole!+fraction).replace(/^(-?)0+/, '$1').replace(/0+$/, '');
 const trailing=(whole!+fraction).match(/0+$/)?.[0].length??0;
 return (coefficient==='-'||!coefficient)?'0':coefficient+'e'+(Number(exponent)-fraction.length+trailing);
}
export function parsePublicJson(text:string):unknown {
 if(Buffer.byteLength(text)>65536)throw new SyntaxError('JSON input exceeds 64 KiB.');
 const value:unknown=JSON.parse(text);
 const stack:Array<Set<string>|null>=[];
 const tokens=text.match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|[^\s{}\[\]:,]+/g)??[];
 for(let i=0;i<tokens.length;i++){
  const token=tokens[i]!;
  if(token==='{'||token==='['){stack.push(token==='{'?new Set():null);if(stack.length>32)throw new SyntaxError('JSON nesting exceeds 32 levels.');}
  else if(token==='}'||token===']')stack.pop();
  else if(token.startsWith('"')&&tokens[i+1]===':'){
   const key=JSON.parse(token) as string,keys=stack.at(-1);
   if(['__proto__','prototype','constructor'].includes(key))throw new SyntaxError('Forbidden JSON key: '+key);
   if(keys?.has(key))throw new SyntaxError('Duplicate JSON key: '+key);keys?.add(key);
  }else if(/^-?[0-9]/.test(token)){
   const number=Number(token);
   if(!Number.isFinite(number)||Number.isInteger(number)&&!Number.isSafeInteger(number)||decimal(token)!==decimal(String(number)))throw new SyntaxError('JSON number exceeds supported precision.');
  }
 }
 return value;
}
export async function readPublicJson(file:string):Promise<unknown> {
 if(file==='-'){
  const reader=Bun.stdin.stream().getReader();let text='';const decoder=new TextDecoder();
  try{for(;;){const {done,value}=await reader.read();if(done)break;text+=decoder.decode(value,{stream:true});if(Buffer.byteLength(text)>65536)throw new SyntaxError('JSON input exceeds 64 KiB.');}return parsePublicJson(text+decoder.decode());}finally{await reader.cancel();reader.releaseLock();}
 }
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NONBLOCK);
 try{if(!fs.fstatSync(fd).isFile())throw new SyntaxError('JSON input must be a regular file.');const bytes=Buffer.alloc(65537);let count=0,n=0;do{n=fs.readSync(fd,bytes,count,bytes.length-count,null);count+=n;}while(n&&count<bytes.length);return parsePublicJson(bytes.subarray(0,count).toString('utf8'));}finally{fs.closeSync(fd);}
}
