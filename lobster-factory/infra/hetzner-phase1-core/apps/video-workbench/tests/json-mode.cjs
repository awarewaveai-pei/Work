const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const readInput=require('./response-input.cjs');
(async()=>{
 const calls=[],dir=fs.mkdtempSync(path.join(os.tmpdir(),'vw-json-mode-'));
 const server=require('../server.cjs').createServer({dataDir:dir,env:{OPENAI_API_KEY:'test-only'},fetchImpl:async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);calls.push(body);
  if(body.text?.format?.type==='json_object'){
   // Reproduce the provider's guard: instructions alone do not satisfy input messages.
   if(!/json/i.test(JSON.stringify(body.input)))return Response.json({error:{message:"Response input messages must contain the word 'json'"}},{status:400});
   const input=readInput(body);
   return Response.json({output_text:JSON.stringify(input.cues?{clips:[{title:'測試選段',start:0,end:2}]}:{reply:'請選擇鏡頭',choices:[],stage:'consultation',script:'',duration:null})});
  }
  return Response.json({output_text:'[Verse]\n原創測試歌詞'});
 }});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=async(route,input)=>{const r=await fetch(base+'/api/vw'+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});const body=await r.json();assert(r.ok,JSON.stringify(body));return body;};
 try{
  const cues=[{start:0,end:2,text:'這是一段中文口白'}];const short=await post('/tools/short/analyze',{cues,duration:10,count:3,prompt:'挑出重點',length:'短'});assert.equal(short.clips.length,1);assert.deepEqual(readInput(calls[0]).cues,cues);
  await post('/director/chat',{messages:[{role:'user',text:'請幫我拍咖啡'}],phase:'consultation',images:[{url:'/assets/test-image-1.png'}]});const vision=calls[1].input.find(message=>message.role==='user').content;assert(vision.some(part=>part.type==='input_image'&&part.image_url.startsWith('data:image/')));
  await post('/tools/music/lyrics',{theme:'出發',language:'繁體中文'});assert.equal(calls[2].text,undefined);assert.equal(typeof calls[2].input,'string');
  assert(calls.slice(0,2).every(body=>body.input[0].role==='developer'&&/JSON/.test(body.input[0].content)));
  console.log('PASS 嚴格重現 JSON input guard：短影音與含圖導演請求符合要求，保留使用者資料；純文字回覆維持原格式');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
