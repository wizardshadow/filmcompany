((scope)=>{
 const limit=20*1024*1024;
 function add(existing,incoming){
  const result=[...existing];
  for(const file of incoming)if(!result.some(item=>item.name===file.name&&item.size===file.size&&item.lastModified===file.lastModified))result.push(file);
  return result.reduce((sum,file)=>sum+file.size,0)>limit?null:result;
 }
 scope.BriefFiles={add,limit};
})(typeof window==='undefined'?globalThis:window);
