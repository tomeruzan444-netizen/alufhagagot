const http=require('http'),fs=require('fs'),path=require('path'),url=require('url');
const ROOT=path.resolve('build');
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.mp4':'video/mp4','.xml':'application/xml','.txt':'text/plain; charset=utf-8'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(url.parse(req.url).pathname);
  let f=path.join(ROOT,p);
  try{ if(fs.existsSync(f)&&fs.statSync(f).isDirectory()) f=path.join(f,'index.html'); }catch(e){}
  if(!fs.existsSync(f)){ f=path.join(ROOT,'404.html'); res.statusCode=404; }
  try{
    res.setHeader('Content-Type',MIME[path.extname(f).toLowerCase()]||'application/octet-stream');
    fs.createReadStream(f).pipe(res);
  }catch(e){ res.statusCode=500; res.end('err'); }
}).listen(8181,'127.0.0.1',()=>console.log('serving build/ on http://127.0.0.1:8181'));
